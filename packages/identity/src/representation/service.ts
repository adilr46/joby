/**
 * Identity Representation — a persistent, reusable, non-canonical positioning lens.
 *
 *   V_i = P_i(E_t)          the lens (slice 1)
 *   E_t + Decisions_i -> V_i  the lens applied (slice 2)
 *
 * Four rules this file exists to hold (ADRs 0014, 0015):
 *
 *  - **It persists a lens and decisions, never a fact.** The stored rows are a name, a purpose,
 *    positioning themes, and choices keyed by canonical node id. Content is derived from
 *    Reconstructed State at read time, through the read port below.
 *  - **It writes nothing canonical.** This service holds no canonical repository — it *cannot*
 *    write R, X or L, rather than being trusted not to. Its only transaction touches its own tables.
 *  - **It cannot invent professional reality.** Content is a function of R, and a decision cannot
 *    exist without the canonical node it is about.
 *  - **Hiding is a prior, not a boundary.** A hidden fact stays canonical, stays in the read model
 *    flagged rather than dropped, and stays available to a later Adaptation that needs it.
 */

import { randomUUID } from 'node:crypto';

import type { Database } from '@joby/database';
import { createEvent, type TransactionalEventPublisher } from '@joby/events';

import { ConcurrencyError, type PermanentIdentityView } from '@joby/identity';
import { buildCvDocument, type CvDocument, type CvHeader } from './cv-document';
import { CvCompilerUnavailableError, type CvCompiler } from './compiler';
import { renderCvLatex } from './latex';
import { buildRepresentationPrior, type RepresentationPrior } from './prior';
import type {
  ApplyRepresentationDecisionsInput,
  CreateRepresentationInput,
  IdentityRepresentation,
  IdentityRepresentationView,
  PositioningTheme,
  RepresentationDecision,
  SetPositioningInput,
} from './model';
import { positionProjection } from './positioning';
import type { RepresentationRepository } from './repository';

const MAX_NAME_LENGTH = 80;
const MAX_PURPOSE_LENGTH = 2000;
const MAX_FRAMING_LENGTH = 600;
const MAX_THEME_LENGTH = 120;
const MAX_THEMES = 12;

export class RepresentationNotFoundError extends Error {
  constructor(representationId: string) {
    super(`No Identity Representation '${representationId}'.`);
    this.name = 'RepresentationNotFoundError';
  }
}

export class DuplicateRepresentationError extends Error {
  constructor(name: string) {
    super(`This person already has an Identity Representation named '${name}'.`);
    this.name = 'DuplicateRepresentationError';
  }
}

export class InvalidRepresentationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRepresentationError';
  }
}

/**
 * The read-only window onto Durable Identity.
 *
 * Deliberately two methods wide. Identity Representation is not part of Durable Identity, so it
 * reaches canonical state the same way any other non-canonical consumer does: through a narrow
 * read interface, never a repository and never a table (ADR 0014, and the same rule ADR 0012 sets
 * for Adaptation).
 */
export interface CanonicalIdentityReader {
  findIdentity(personId: string): Promise<{
    readonly personId: string;
    readonly durableIdentityId: string;
  } | undefined>;
  /** Familiar sections derived from R at read time, carrying the identity revision. */
  projectIdentity(personId: string): Promise<PermanentIdentityView | undefined>;
  listOwnedCanonicalNodeIds(
    personId: string,
    nodeIds: readonly string[],
  ): Promise<readonly string[]>;
}

/** Postgres unique violation — the index is the real guard against a duplicate name. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}

export class RepresentationService {
  readonly #db: Database;
  readonly #repository: RepresentationRepository;
  readonly #identity: CanonicalIdentityReader;
  readonly #publisher: TransactionalEventPublisher;

  /** Absent until a runtime supplies one: everything up to the `.tex` works without a toolchain. */
  readonly #compiler: CvCompiler | undefined;

  constructor(dependencies: {
    db: Database;
    repository: RepresentationRepository;
    identity: CanonicalIdentityReader;
    publisher: TransactionalEventPublisher;
    compiler?: CvCompiler;
  }) {
    this.#db = dependencies.db;
    this.#repository = dependencies.repository;
    this.#identity = dependencies.identity;
    this.#publisher = dependencies.publisher;
    this.#compiler = dependencies.compiler;
  }

  /**
   * Create a named lens over an existing Durable Identity.
   *
   * Creating one asserts nothing about the person and changes nothing about them: no node, no
   * revision, no provenance, no event. It records that they want to look at their history this way.
   */
  async create(input: CreateRepresentationInput): Promise<IdentityRepresentation> {
    const name = input.name?.trim() ?? '';
    if (name.length === 0) {
      throw new InvalidRepresentationError('An Identity Representation needs a name.');
    }
    if (name.length > MAX_NAME_LENGTH) {
      throw new InvalidRepresentationError(`A name may be at most ${MAX_NAME_LENGTH} characters.`);
    }

    const purpose = input.purpose?.trim();
    if (purpose !== undefined && purpose.length > MAX_PURPOSE_LENGTH) {
      throw new InvalidRepresentationError(
        `A purpose may be at most ${MAX_PURPOSE_LENGTH} characters.`,
      );
    }

    // A representation is a lens over a person's identity. Without the identity there is nothing to
    // project, and an orphan lens would be a profile with no history behind it.
    if (!(await this.#identity.findIdentity(input.personId))) {
      throw new RepresentationNotFoundError(input.personId);
    }

    const existing = await this.#repository.listForPerson(input.personId);
    if (existing.some((held) => held.name.toLowerCase() === name.toLowerCase())) {
      throw new DuplicateRepresentationError(name);
    }

    try {
      return await this.#repository.insert({
        id: randomUUID(),
        personId: input.personId,
        name,
        createdBy: input.createdBy,
        ...(purpose ? { purpose } : {}),
      });
    } catch (error) {
      // The check above races; the unique index does not.
      if (isUniqueViolation(error)) throw new DuplicateRepresentationError(name);
      throw error;
    }
  }

  list(personId: string): Promise<readonly IdentityRepresentation[]> {
    return this.#repository.listForPerson(personId);
  }

  /**
   * Read one representation, deriving its content from **current** Durable Identity.
   *
   * Nothing is refreshed, invalidated or synchronised, because nothing was stored: a correction to
   * Explicit State simply shows up here the next time it is read. That is what keeps this a
   * projection rather than a competing profile.
   */
  async get(representationId: string): Promise<IdentityRepresentationView | undefined> {
    const representation = await this.#repository.find(representationId);
    if (!representation) return undefined;

    const identity = await this.#identity.findIdentity(representation.personId);
    const projection = await this.#identity.projectIdentity(representation.personId);
    // The lens outlives any single read, but it cannot be read without the identity it points at.
    if (!identity || !projection) return undefined;

    const [heldDecisions, themes] = await Promise.all([
      this.#repository.listDecisions(representation.id),
      this.#repository.listThemes(representation.id),
    ]);
    const owned = new Set(
      await this.#identity.listOwnedCanonicalNodeIds(
        representation.personId,
        heldDecisions.map((decision) => decision.nodeId),
      ),
    );
    const decisions = heldDecisions.filter((decision) => owned.has(decision.nodeId));

    return {
      representation,
      derivedFrom: {
        personId: identity.personId,
        durableIdentityId: identity.durableIdentityId,
        identityRevision: projection.revision,
        derivedAt: new Date().toISOString(),
      },
      // Ungoverned by the lens, deliberately: this is what Durable Identity says, in full.
      projection,
      positioning: {
        themes,
        decisions,
        // …and this is what the lens does with it. Nothing is dropped, only ordered and flagged.
        evidence: positionProjection(projection, decisions),
      },
    };
  }

  // --- The positioning decision layer (UC05–UC08, ADR 0015) -----------------------------------

  /**
   * Apply positioning decisions to canonical facts, in one lens, atomically.
   *
   * UC05 include/hide, UC06 priority, UC07 per-fact emphasis, UC08 context-independent framing.
   * Every decision names a canonical node that must exist and belong to this person; a decision
   * about anything else is refused rather than stored as an orphan opinion.
   *
   * Guarded by the lens revision, so two people repositioning the same lens cannot silently
   * overwrite one another. Canonical state is untouched: a person deciding not to lead with a
   * project has not changed the fact that they did it.
   */
  async applyDecisions(
    input: ApplyRepresentationDecisionsInput,
  ): Promise<{ revision: number; decisions: readonly RepresentationDecision[] }> {
    const representation = await this.#repository.find(input.representationId);
    if (!representation) throw new RepresentationNotFoundError(input.representationId);

    if (input.decisions.length === 0) {
      throw new InvalidRepresentationError('No positioning decisions were supplied.');
    }

    const seen = new Set<string>();
    for (const decision of input.decisions) {
      if (!decision.nodeId) {
        throw new InvalidRepresentationError('Every positioning decision names a canonical fact.');
      }
      // Two decisions about one fact in one call are two answers to the same question.
      if (seen.has(decision.nodeId)) {
        throw new InvalidRepresentationError(
          `More than one decision for canonical fact '${decision.nodeId}'.`,
        );
      }
      seen.add(decision.nodeId);

      if (decision.priority !== undefined && decision.priority !== null && decision.priority < 0) {
        throw new InvalidRepresentationError('Priority is a rank: it cannot be negative.');
      }
      if (
        decision.framing !== undefined &&
        decision.framing !== null &&
        decision.framing.trim().length > MAX_FRAMING_LENGTH
      ) {
        throw new InvalidRepresentationError(
          `Framing may be at most ${MAX_FRAMING_LENGTH} characters.`,
        );
      }
    }

    // Grounding, checked before anything is written: a lens positions its own person's canonical
    // facts, and nothing else.
    const owned = new Set(
      await this.#identity.listOwnedCanonicalNodeIds(representation.personId, [...seen]),
    );
    const ungrounded = [...seen].filter((nodeId) => !owned.has(nodeId));
    if (ungrounded.length > 0) {
      throw new InvalidRepresentationError(
        `No canonical fact of this person's for: ${ungrounded.join(', ')}. ` +
          'A representation positions Explicit State; it cannot hold anything else.',
      );
    }

    const result = await this.#db.transaction(async (tx) => {
      // The revision moves first: if the lens has changed under the caller, nothing is applied.
      const revision = await this.#repository.bumpRevision(
        tx,
        input.representationId,
        input.expectedRevision,
      );
      if (revision === undefined) {
        const current = await this.#repository.find(input.representationId, tx);
        throw new ConcurrencyError(input.expectedRevision, current?.revision);
      }

      const applied: RepresentationDecision[] = [];
      for (const decision of input.decisions) {
        applied.push(
          await this.#repository.upsertDecision(tx, {
            id: randomUUID(),
            representationId: input.representationId,
            nodeId: decision.nodeId,
            decidedBy: input.decidedBy,
            // Omitted stays as it was; null clears it. Passed through as-is so the repository can
            // tell the two apart.
            ...(decision.included === undefined ? {} : { included: decision.included }),
            ...(decision.priority === undefined ? {} : { priority: decision.priority }),
            ...(decision.emphasis === undefined ? {} : { emphasis: decision.emphasis }),
            ...(decision.framing === undefined
              ? {}
              : { framing: decision.framing === null ? null : decision.framing.trim() }),
          }),
        );
      }

      const event = createEvent('IdentityRepresentationRevised', {
        personId: representation.personId,
        payload: {
          representationId: representation.id,
          revision,
          changedFields: ['decisions'],
        },
        metadata: { source: 'api', actor: { kind: 'user', userId: input.decidedBy } },
      });
      await this.#publisher.recordDurable(tx, event);
      return { revision, decisions: applied, event };
    });
    await this.#publisher.publishCommitted(result.event);
    return { revision: result.revision, decisions: result.decisions };
  }

  // --- Materialization and the Adaptation prior (UC09, UC10, ADR 0016) -----------------------

  /**
   * Render this lens as a general CV (UC09).
   *
   *   Identity Representation -> CVDocument -> LaTeX -> PDF
   *
   * **General to the lens, never to an opportunity.** Nothing here takes a JD, employer or posting:
   * a tailored CV is Adapted State, and what is actually submitted is Execution's Application
   * Record. This is a reusable artifact the person can send anywhere in the domain.
   *
   * Nothing is stored. Every render is derived from current Explicit State plus the lens, so a
   * correction reaches the next CV with nothing to invalidate — and so Joby never holds a stale
   * parallel copy of someone's history in a PDF.
   */
  async renderCv(
    representationId: string,
    header?: CvHeader,
  ): Promise<{ document: CvDocument; latex: string } | undefined> {
    const view = await this.get(representationId);
    if (!view) return undefined;

    const document = buildCvDocument({
      representation: view.representation,
      grounding: view.derivedFrom,
      positioning: view.positioning,
      projection: view.projection,
      ...(header ? { header } : {}),
    });

    return { document, latex: renderCvLatex(document) };
  }

  /**
   * Compile a rendered CV to PDF.
   *
   * Requires a runtime-supplied compiler. Absent one this reports itself rather than degrading
   * silently — the document and its LaTeX are still available, and a missing toolchain is an
   * operational fact, not a product answer.
   */
  async compileCv(latex: string): Promise<Uint8Array> {
    if (!this.#compiler) {
      throw new CvCompilerUnavailableError('none configured');
    }
    return this.#compiler.compile(latex);
  }

  /**
   * The lens as an optional positioning prior for Adaptation (UC10).
   *
   * `P_i` in `A^C = T(E_t, L_t, C, P_i)`. Carries preferences keyed by canonical node id and no
   * professional evidence at all, so a consumer cannot use it *instead of* Durable Identity — and
   * states hiding as a preference rather than an absence, so it can never act as an evidence
   * whitelist.
   */
  async getPrior(representationId: string): Promise<RepresentationPrior | undefined> {
    const representation = await this.#repository.find(representationId);
    if (!representation) return undefined;

    const projection = await this.#identity.projectIdentity(representation.personId);
    if (!projection) return undefined;

    const [heldDecisions, themes] = await Promise.all([
      this.#repository.listDecisions(representation.id),
      this.#repository.listThemes(representation.id),
    ]);
    const owned = new Set(
      await this.#identity.listOwnedCanonicalNodeIds(
        representation.personId,
        heldDecisions.map((decision) => decision.nodeId),
      ),
    );
    const decisions = heldDecisions.filter((decision) => owned.has(decision.nodeId));

    return buildRepresentationPrior({
      representation,
      decisions,
      themes,
      identityRevision: projection.revision,
    });
  }

  /**
   * Set the lens's reusable positioning themes — what this representation generally leads with.
   *
   * The whole ordered list is replaced, because it is an arrangement rather than a set. A theme is a
   * positioning choice, never a claim: "quantitative reasoning" says what this lens foregrounds, not
   * that the person is good at it. Claims still come from canonical facts and their provenance.
   */
  async setPositioning(
    input: SetPositioningInput,
  ): Promise<{ revision: number; themes: readonly PositioningTheme[] }> {
    const representation = await this.#repository.find(input.representationId);
    if (!representation) throw new RepresentationNotFoundError(input.representationId);

    const labels = input.themes.map((theme) => theme.trim()).filter((theme) => theme.length > 0);
    if (labels.length > MAX_THEMES) {
      throw new InvalidRepresentationError(
        `A lens may lead with at most ${MAX_THEMES} positioning themes.`,
      );
    }
    for (const label of labels) {
      if (label.length > MAX_THEME_LENGTH) {
        throw new InvalidRepresentationError(
          `A positioning theme may be at most ${MAX_THEME_LENGTH} characters.`,
        );
      }
    }
    if (new Set(labels.map((label) => label.toLowerCase())).size !== labels.length) {
      throw new InvalidRepresentationError('A positioning theme is listed more than once.');
    }

    const result = await this.#db.transaction(async (tx) => {
      const revision = await this.#repository.bumpRevision(
        tx,
        input.representationId,
        input.expectedRevision,
      );
      if (revision === undefined) {
        const current = await this.#repository.find(input.representationId, tx);
        throw new ConcurrencyError(input.expectedRevision, current?.revision);
      }

      const themes = await this.#repository.replaceThemes(
        tx,
        input.representationId,
        labels.map((label) => ({ id: randomUUID(), label })),
      );
      const event = createEvent('IdentityRepresentationRevised', {
        personId: representation.personId,
        payload: {
          representationId: representation.id,
          revision,
          changedFields: ['themes'],
        },
        metadata: { source: 'api', actor: { kind: 'user', userId: input.setBy } },
      });
      await this.#publisher.recordDurable(tx, event);
      return { revision, themes, event };
    });
    await this.#publisher.publishCommitted(result.event);
    return { revision: result.revision, themes: result.themes };
  }
}
