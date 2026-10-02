/**
 * The Identity domain service — what other domains and `apps/api` call, in process.
 *
 * Release 1 implements the capture and inspection half of the UC12 boundary. Confirmation,
 * canonical Explicit State reads and corrections arrive in R2/R4; they are absent rather than
 * stubbed, because a method returning an empty Eₜ would read as "this person has nothing" when the
 * truth is "this release cannot answer that".
 */

import type { Database } from '@joby/database';
import {
  InProcessEventDispatcher,
  TransactionalEventPublisher,
  type EventDispatcher,
} from '@joby/events';
import { PostgresOutboxStore } from '@joby/database';

import type { DurableIdentityModule } from './durable-contract';
import {
  CorrectionService,
  type AddNodeInput,
  type CorrectNodeInput,
  type CorrectionResult,
} from './correction';
import { DeterministicCvExtractor } from './extraction/deterministic-extractor';
import { OpenAiCvExtractor } from './extraction/openai-extractor';
import type { CvExtractor } from './extraction/port';
import { ExplicitStateRepository } from './explicit-state-repository';
import { GitHubIngestionService, type IngestResult } from './github/ingestion';
import { HttpGitHubClient } from './github/http-client';
import type { GitHubClient, GitHubCredentials, RepositoryMetadata } from './github/port';
import type {
  CorrectionRecord,
  DurableIdentity,
  ExplicitNode,
  ExplicitState,
  GitHubConnection,
  PermanentIdentityView,
  Person,
  ProfessionalSource,
  ProvenanceRecord,
  ReconstructionJob,
  ReconstructionProposal,
  ReconstructionTrigger,
  RepositorySelection,
  ReviewRecord,
  SourceLifecycle,
  SourceVisibility,
  StatedContext,
} from './model';
import { projectPermanentIdentityView } from './projection';
import { composeProfileUnits, type ProfileUnitsView } from './profile-unit';
import { ReconstructionRunner, type ReconstructionRunResult } from './reconstruction';
import { IdentityRepository } from './repository';
import { ReviewService, type ConfirmReviewInput, type ConfirmReviewResult } from './review';
import { SourceCaptureService, type CaptureSourceInput, type CaptureSourceResult } from './source-capture';
import {
  StatedContextRepository,
  StatedContextService,
  type SetStatedContextInput,
} from './stated-context';

export interface IdentityServiceOptions {
  readonly db: Database;
  /** Defaults to OpenAI when `OPENAI_API_KEY` is set, otherwise the deterministic extractor. */
  readonly extractor?: CvExtractor;
  /**
   * Where inline handlers run after commit. Defaults to an empty inline dispatcher — nothing
   * subscribes to `IdentityUpdated` yet, and the durable outbox row is written regardless, so a
   * future subscriber gets the event through the worker.
   */
  readonly inlineDispatcher?: EventDispatcher;
  /** Defaults to the real HTTP client. Tests supply a deterministic one. */
  readonly githubClient?: GitHubClient;
  /**
   * Turns a rendered CV into PDF bytes. Optional: everything up to the LaTeX source works without a
   * toolchain, and a runtime without one reports that rather than degrading silently.
   */
}

/**
 * Choose an extractor.
 *
 * Falling back to the deterministic extractor rather than failing at startup keeps the whole flow
 * runnable with no API key. It is announced in the log, because silently degrading the product's
 * central capability would be worse than either alternative.
 */
export function defaultExtractor(env: NodeJS.ProcessEnv = process.env): CvExtractor {
  const apiKey = env.OPENAI_API_KEY;
  if (apiKey) {
    return new OpenAiCvExtractor({
      apiKey,
      ...(env.OPENAI_MODEL ? { model: env.OPENAI_MODEL } : {}),
    });
  }
  console.warn('[identity] OPENAI_API_KEY is not set — using the deterministic extractor.');
  return new DeterministicCvExtractor();
}

/**
 * `implements Identity` is load-bearing: the compiler now enforces that this class satisfies the
 * domain contract, so the two cannot drift apart silently.
 */
export class IdentityService implements DurableIdentityModule {
  readonly #repository: IdentityRepository;
  readonly #state: ExplicitStateRepository;
  readonly #capture: SourceCaptureService;
  readonly #runner: ReconstructionRunner;
  readonly #review: ReviewService;
  readonly #correction: CorrectionService;
  readonly #github: GitHubIngestionService;
  readonly #stated: StatedContextService;

  constructor(options: IdentityServiceOptions) {
    const extractor = options.extractor ?? defaultExtractor();
    this.#repository = new IdentityRepository(options.db);
    this.#state = new ExplicitStateRepository(options.db);
    this.#capture = new SourceCaptureService({ db: options.db, repository: this.#repository });
    this.#runner = new ReconstructionRunner({
      db: options.db,
      repository: this.#repository,
      stateRepository: this.#state,
      extractor,
    });

    const publisher = new TransactionalEventPublisher({
      outbox: new PostgresOutboxStore(),
      inline: options.inlineDispatcher ?? new InProcessEventDispatcher({ accepts: 'inline' }),
    });
    const shared = {
      db: options.db,
      identityRepository: this.#repository,
      stateRepository: this.#state,
      publisher,
    };
    this.#review = new ReviewService(shared);
    this.#correction = new CorrectionService(shared);
    this.#stated = new StatedContextService({
      db: options.db,
      repository: new StatedContextRepository(options.db),
      identityRepository: this.#repository,
      stateRepository: this.#state,
      publisher,
    });
    this.#github = new GitHubIngestionService({
      db: options.db,
      repository: this.#repository,
      client: options.githubClient ?? new HttpGitHubClient(),
    });

    // Identity Representation reaches canonical state through a two-method read port, not through
    // the repositories above. It is wired to this service's own read methods, so the projection it
    // shows is the same one Durable Identity exposes — one derivation, not two (ADR 0014).
  }

  /** Capture a professional source, creating the Person if this is their first (ADR 0010). */
  captureSource(input: CaptureSourceInput): Promise<CaptureSourceResult> {
    return this.#capture.capture(input);
  }

  getPerson(personId: string): Promise<Person | undefined> {
    return this.#repository.findPerson(personId);
  }

  /**
   * The lifecycle facts for one source, kept distinct.
   *
   * Captured, reconstructed and confirmed are three separate answers. Collapsing them into one
   * status is what makes it possible to mistake "we extracted something" for "this is true".
   */
  async getSourceLifecycle(sourceId: string): Promise<SourceLifecycle | undefined> {
    const source = await this.#repository.findSource(sourceId);
    if (!source) return undefined;

    const job = await this.#repository.findJobBySource(sourceId);
    if (!job) return undefined;

    const proposal = job.status === 'succeeded' ? await this.#repository.findProposalByJob(job.id) : undefined;
    const review = proposal ? await this.#state.findReviewByProposal(proposal.id) : undefined;

    return {
      source,
      captured: true,
      reconstruction: job,
      // Fact 3, and separate from fact 2 on purpose: a generated reconstruction is not a
      // confirmed one, and only a review makes it true about the person.
      confirmed: review !== undefined,
      ...(proposal ? { proposalId: proposal.id } : {}),
      ...(review ? { reviewId: review.id } : {}),
    };
  }

  getSource(sourceId: string): Promise<ProfessionalSource | undefined> {
    return this.#repository.findSource(sourceId);
  }

  getReconstructionJob(jobId: string): Promise<ReconstructionJob | undefined> {
    return this.#repository.findJob(jobId);
  }

  getProposal(proposalId: string): Promise<ReconstructionProposal | undefined> {
    return this.#repository.findProposal(proposalId);
  }

  listProposals(personId: string): Promise<readonly ReconstructionProposal[]> {
    return this.#repository.listProposals(personId);
  }

  /** Re-queue a failed reconstruction. The source was preserved, so this is always possible. */
  retryReconstruction(jobId: string): Promise<boolean> {
    return this.#repository.retryJob(jobId);
  }

  /** Run one batch of reconstruction work. Called by the worker loop. */
  runReconstruction(options?: { limit?: number }): Promise<ReconstructionRunResult> {
    return this.#runner.runOnce(options);
  }

  // --- Review and canonical Explicit State (UC04–UC07) -------------------------------------

  /**
   * Apply a reviewed reconstruction: exactly the retained set, atomically.
   *
   * Requires a decision for every proposed item — there is no bulk accept.
   */
  confirmReview(input: ConfirmReviewInput): Promise<ConfirmReviewResult> {
    return this.#review.confirm(input);
  }

  /** What was proposed, what the user did to it, and what it became. */
  getReview(proposalId: string): Promise<ReviewRecord | undefined> {
    return this.#review.getReview(proposalId);
  }

  /**
   * Canonical E = (R, X).
   *
   * Stated Context comes back empty-but-present until the person states something: a consumer must
   * see that X exists and is unset, rather than unsupported.
   */
  async getExplicitState(personId: string): Promise<ExplicitState | undefined> {
    const revision = await this.#state.getRevision(personId);
    if (revision === undefined) return undefined;

    return {
      reconstructed: await this.#state.getReconstructedState(personId),
      stated: await this.#stated.read(personId),
      revision,
    };
  }

  /**
   * Write what the person says about where they are going and what bounds them (UC-X, ADR 0017).
   *
   * The only path into X, and it is user-authored by construction: no AI, no inference, no default.
   * A condition Joby was not told is unknown, and unknown is a real answer.
   */
  setStatedContext(input: SetStatedContextInput): Promise<{ revision: number; stated: StatedContext }> {
    return this.#stated.set(input);
  }

  /**
   * Durable Identity's own governed components — `E` and `X`, and nothing else.
   *
   * No learned component is returned, because PCI is not Durable Identity's to hold. Memory / PCI
   * owns the learned relational model; this module answers what is professionally true.
   */
  async getDurableIdentity(personId: string): Promise<DurableIdentity | undefined> {
    const person = await this.#repository.findPerson(personId);
    if (!person) return undefined;

    const explicit = await this.getExplicitState(personId);
    if (!explicit) return undefined;

    return {
      personId: person.id,
      durableIdentityId: person.durableIdentityId,
      explicit,
    };
  }

  getNode(nodeId: string): Promise<ExplicitNode | undefined> {
    return this.#state.findNode(nodeId);
  }

  listOwnedCanonicalNodeIds(
    personId: string,
    nodeIds: readonly string[],
  ): Promise<readonly string[]> {
    return this.#state.listOwnedNodeIds(personId, nodeIds);
  }

  /** Where a confirmed fact came from. Identity-owned source provenance, not a Memory EvidenceItem. */
  getProvenance(subjectType: 'node' | 'relation', subjectId: string): Promise<readonly ProvenanceRecord[]> {
    return this.#state.findProvenance(subjectType, subjectId);
  }

  /** Correct a fact directly, without another reconstruction. Never touches Learned State. */
  correctNode(input: CorrectNodeInput): Promise<CorrectionResult> {
    return this.#correction.correctNode(input);
  }

  addNode(input: AddNodeInput): Promise<CorrectionResult> {
    return this.#correction.addNode(input);
  }

  removeNode(input: { nodeId: string; expectedRevision: number; correctedBy: string }): Promise<{ revision: number }> {
    return this.#correction.removeNode(input);
  }

  listCorrections(personId: string): Promise<readonly CorrectionRecord[]> {
    return this.#correction.listCorrections(personId);
  }

  // --- Professional sources beyond the CV (UC08–UC10) --------------------------------------

  connectGitHub(personId: string, accountLogin: string): Promise<GitHubConnection> {
    return this.#github.connect(personId, accountLogin);
  }

  getGitHubConnection(personId: string): Promise<GitHubConnection | undefined> {
    return this.#github.getConnection(personId);
  }

  /** What the user can choose from. Listing is not inspecting: no source is captured. */
  listAvailableRepositories(
    personId: string,
    credentials: GitHubCredentials,
  ): Promise<readonly RepositoryMetadata[]> {
    return this.#github.listAvailableRepositories(personId, credentials);
  }

  /** Record which repositories Joby may look at. This is the permission. */
  selectRepositories(
    personId: string,
    choices: readonly { fullName: string; selected: boolean; isPrivate?: boolean }[],
  ): Promise<readonly RepositorySelection[]> {
    return this.#github.selectRepositories(personId, choices);
  }

  listRepositorySelections(personId: string): Promise<readonly RepositorySelection[]> {
    return this.#github.listSelections(personId);
  }

  /** Capture the selected repositories. User-initiated; nothing here polls. */
  ingestSelectedRepositories(
    personId: string,
    credentials: GitHubCredentials,
    options?: { trigger?: ReconstructionTrigger; only?: readonly string[] },
  ): Promise<readonly IngestResult[]> {
    return this.#github.ingestSelected(personId, credentials, options);
  }

  /** Re-fetch one selected repository because the user asked. Unchanged material does no work. */
  refreshRepository(
    personId: string,
    credentials: GitHubCredentials,
    fullName: string,
  ): Promise<IngestResult> {
    return this.#github.refresh(personId, credentials, fullName);
  }

  // --- The Permanent Identity View (UC11) ---------------------------------------------------

  /**
   * Familiar sections, projected from current Reconstructed State at read time.
   *
   * Stores nothing. A fact is private unless every source behind it is public.
   */
  async getPermanentIdentityView(personId: string): Promise<PermanentIdentityView | undefined> {
    const revision = await this.#state.getRevision(personId);
    if (revision === undefined) return undefined;

    const state = await this.#state.getReconstructedState(personId);

    const provenance = new Map<string, readonly ProvenanceRecord[]>();
    const sourceIds = new Set<string>();
    for (const node of [...state.structure, ...state.activities]) {
      const records = await this.#state.findProvenance('node', node.id);
      provenance.set(node.id, records);
      for (const record of records) if (record.sourceId) sourceIds.add(record.sourceId);
    }

    const sourceVisibility: ReadonlyMap<string, SourceVisibility> =
      await this.#repository.findSourceVisibilities([...sourceIds]);

    return projectPermanentIdentityView({ personId, revision, state, provenance, sourceVisibility });
  }

  /**
   * The person's **Profile Units** — the canonical unit of professional truth (ADR 0031).
   *
   * `ProfileUnit = Context + Contribution + Capabilities + Consequence`, composed from current
   * canonical state at read time. There is no unit store: a unit's identity is its Activity node and
   * its Context is the Structure it occurred within, so a correction reaches every reading of it at
   * once with no refresh path.
   */
  async getProfileUnits(personId: string): Promise<ProfileUnitsView | undefined> {
    const revision = await this.#state.getRevision(personId);
    if (revision === undefined) return undefined;

    const state = await this.#state.getReconstructedState(personId);

    const provenance = new Map<string, readonly ProvenanceRecord[]>();
    const sourceIds = new Set<string>();
    for (const node of [...state.structure, ...state.activities]) {
      const records = await this.#state.findProvenance('node', node.id);
      provenance.set(node.id, records);
      for (const record of records) if (record.sourceId) sourceIds.add(record.sourceId);
    }

    const sourceVisibility: ReadonlyMap<string, SourceVisibility> =
      await this.#repository.findSourceVisibilities([...sourceIds]);

    return composeProfileUnits({ personId, revision, state, provenance, sourceVisibility });
  }

  // --- Identity Representations (ADR 0014) ---------------------------------------------------

  /**
   * Create a named reusable lens over this person's Durable Identity.
   *
   * Persistent, non-canonical, and not tied to an opportunity. Writes one row that holds a name and
   * a purpose — no fact, no revision of Explicit State, and no event: nothing became true about the
   * person because they decided to look at their history a particular way.
   */

  /**
   * One representation: the ungoverned canonical projection, and the lens applied over it.
   *
   * Hidden facts come back flagged rather than dropped — a lens is a positioning prior, not an
   * evidence boundary (ADR 0015).
   */

  /**
   * Position canonical facts in one lens: include/hide, rank, emphasise, reword.
   *
   * Guarded by the lens revision, and canonical state is untouched.
   */

  /** The reusable positioning themes this lens leads with. Choices, never claims. */

  /**
   * A lens as an optional positioning prior for Adaptation — `P_i` (ADR 0016).
   *
   * Preferences keyed by canonical node id, and no professional evidence: a consumer must still
   * read Durable Identity to know what any of it means.
   */

  // --- CV materialization (UC09) — a runtime capability, not a domain contract ----------------
  //
  // The only consumer is the HTTP surface, and PDF compilation is a composition choice, so this
  // stays on `/runtime` beside the model adapters rather than widening what every domain sees.

  /**
   * Render a lens as a general, reusable CV: the document and its LaTeX source.
   *
   * Not opportunity-specific, not an Application Record artifact, and not stored.
   */

  // --- Representation References (ADR 0021) --------------------------------------------------

  /**
   * Keep a piece of the person's own writing, so generation can sound like them.
   *
   * Nothing extracts from it, now or later: there is no reconstruction path from a reference into
   * Explicit State, which is what keeps a previous letter's claims out of the person's identity.
   */

  /** Compile rendered LaTeX to PDF bytes. Throws when no toolchain is configured. */
}
