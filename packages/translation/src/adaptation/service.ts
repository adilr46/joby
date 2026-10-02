/**
 * Adaptation Module 1 — Context Interpretation (UC01–UC04).
 *
 *   P_i(E_t) + C_opportunity + C_user  ->  a legible adaptation context
 *
 * This module makes one opportunity **understandable**. It does not adapt professional identity:
 * no selection, no interpretation of evidence, no composition, no representation. Module 2 does
 * that, and this slice deliberately stops before it.
 *
 * What it may hold (ADRs 0012, 0013): the assembled Adaptation Context and the informational
 * conflicts derived from it. What it may never do: write `R`, `X` or `L`, own or score an
 * opportunity, decide whether to pursue one, or gate anything at all.
 */

import { randomUUID } from 'node:crypto';

import type { Database, Queryable } from '@joby/database';

import type {
  AdaptationContext,
  AdaptationContextView,
  CreateAdaptationContextInput,
} from './model';
import type { AdaptedState } from './adapted-state';
import { arrangeOpportunity, arrangeUser, intersectContext } from './mapping';
import {
  assessRepresentation,
  composeElements,
  recoverEvidence,
  requiresCanonicalEvidence,
} from './adaptation';
import {
  ProvisionalCvRoutingPolicy,
  type CvPathDecision,
  type CvRoutingPolicy,
} from './cv-path';
import { WrittenRepresentationRepository, type RepresentationDraft } from './drafts';
import type {
  AdaptationDurableIdentityReader,
  AdaptationRepresentationReader,
  OpportunityUnderstandingPort,
} from './ports';
import { validateDraft } from './validate-draft';
import {
  ProvisionalReferenceSelection,
  ProvisionalSatisfactionGate,
  type ApplicationInput,
  type ApplicationInputKind,
  type DraftSegment,
  type ReadinessAssessment,
  type ReferenceSelectionPolicy,
  type RepresentationSurface,
  type RepresentationWriter,
  type SatisfactionGate,
  type SurfaceConstraints,
} from './writing';
import type { GenerationOutcome } from './contract';

/**
 * What a generation request produced: a draft, or the questions standing between Joby and one.
 *
 * `needs_input` is a designed outcome, not an error. Returning questions instead of prose is the
 * behaviour the whole doctrine turns on.
 */
export class AdaptationContextNotFoundError extends Error {
  constructor(contextId: string) {
    super(`No Adaptation Context '${contextId}'.`);
    this.name = 'AdaptationContextNotFoundError';
  }
}

export class OpportunityNotUnderstoodError extends Error {
  constructor(opportunityId: string) {
    super(
      `No opportunity understanding for '${opportunityId}'. ` +
        'Opportunity Intelligence supplies it; Adaptation does not read a job description itself.',
    );
    this.name = 'OpportunityNotUnderstoodError';
  }
}

export class InvalidAdaptationContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAdaptationContextError';
  }
}

export class AdaptationConcurrencyError extends Error {
  constructor(expected: number, actual: number | undefined) {
    super(`Revision ${expected} is stale (current: ${actual ?? 'unknown'}). Re-read the draft and re-apply the edit.`);
    this.name = 'AdaptationConcurrencyError';
  }
}

interface ContextRow extends Record<string, unknown> {
  id: string;
  person_id: string;
  representation_id: string | null;
  opportunity_id: string;
  opportunity_revision: number;
  identity_revision: number;
  created_at: Date | string;
  created_by: string;
}

const COLUMNS = `id, person_id, representation_id, opportunity_id, opportunity_revision,
                 identity_revision, created_at, created_by`;

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

function toContext(row: ContextRow): AdaptationContext {
  return {
    id: row.id,
    personId: row.person_id,
    opportunityId: row.opportunity_id,
    opportunityRevision: row.opportunity_revision,
    identityRevision: row.identity_revision,
    createdAt: iso(row.created_at),
    createdBy: row.created_by,
    ...(row.representation_id === null ? {} : { representationId: row.representation_id }),
  };
}

/**
 * Persistence for the Adaptation Context.
 *
 * **One table, `adaptation_context`, holding references and revisions.** It names no Identity table
 * and copies no fact — everything the context shows is derived at read time from whoever owns it.
 */
export class AdaptationContextRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async insert(
    input: {
      id: string;
      personId: string;
      representationId?: string;
      opportunityId: string;
      opportunityRevision: number;
      identityRevision: number;
      createdBy: string;
    },
    runner: Queryable = this.#db,
  ): Promise<AdaptationContext> {
    const { rows } = await runner.query<ContextRow>(
      `INSERT INTO adaptation_context
         (id, person_id, representation_id, opportunity_id, opportunity_revision,
          identity_revision, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (person_id, opportunity_id) DO UPDATE SET
         representation_id    = EXCLUDED.representation_id,
         opportunity_revision = EXCLUDED.opportunity_revision,
         identity_revision    = EXCLUDED.identity_revision
       RETURNING ${COLUMNS}`,
      [
        input.id,
        input.personId,
        input.representationId ?? null,
        input.opportunityId,
        input.opportunityRevision,
        input.identityRevision,
        input.createdBy,
      ],
    );
    return toContext(rows[0]!);
  }

  async find(id: string, runner: Queryable = this.#db): Promise<AdaptationContext | undefined> {
    const { rows } = await runner.query<ContextRow>(
      `SELECT ${COLUMNS} FROM adaptation_context WHERE id = $1`,
      [id],
    );
    return rows[0] ? toContext(rows[0]) : undefined;
  }

  async listForPerson(
    personId: string,
    runner: Queryable = this.#db,
  ): Promise<readonly AdaptationContext[]> {
    const { rows } = await runner.query<ContextRow>(
      `SELECT ${COLUMNS} FROM adaptation_context WHERE person_id = $1 ORDER BY created_at, id`,
      [personId],
    );
    return rows.map(toContext);
  }
}

export class AdaptationService {
  readonly #repository: AdaptationContextRepository;
  readonly #identity: AdaptationDurableIdentityReader;
  readonly #representations: AdaptationRepresentationReader;
  readonly #opportunities: OpportunityUnderstandingPort;
  /** UC09's seam. Provisional until the routing policy is decided; replaceable by construction. */
  readonly #cvRouting: CvRoutingPolicy;
  readonly #db: Database;
  readonly #written: WrittenRepresentationRepository;
  readonly #writer: RepresentationWriter;
  /** `SatisfactionGate(...)` — provisional and replaceable (ADR 0022). */
  readonly #gate: SatisfactionGate;
  /** `ResolveReferenceConflict(...)` — provisional and replaceable (ADR 0021). */
  readonly #references: ReferenceSelectionPolicy;

  constructor(dependencies: {
    db: Database;
    repository: AdaptationContextRepository;
    identity: AdaptationDurableIdentityReader;
    representations: AdaptationRepresentationReader;
    opportunities: OpportunityUnderstandingPort;
    writer: RepresentationWriter;
    cvRouting?: CvRoutingPolicy;
    satisfactionGate?: SatisfactionGate;
    referenceSelection?: ReferenceSelectionPolicy;
  }) {
    this.#db = dependencies.db;
    this.#repository = dependencies.repository;
    this.#identity = dependencies.identity;
    this.#representations = dependencies.representations;
    this.#opportunities = dependencies.opportunities;
    this.#writer = dependencies.writer;
    this.#written = new WrittenRepresentationRepository(dependencies.db);
    this.#cvRouting = dependencies.cvRouting ?? new ProvisionalCvRoutingPolicy();
    this.#gate = dependencies.satisfactionGate ?? new ProvisionalSatisfactionGate();
    this.#references = dependencies.referenceSelection ?? new ProvisionalReferenceSelection();
  }

  /**
   * UC01 — create the temporary scope for one opportunity.
   *
   * Establishes which lens, which opportunity and which identity revision this adaptation is
   * against. **It does not adapt professional identity**: nothing is selected, interpreted or
   * composed here, and re-creating a context for the same opportunity re-points it rather than
   * accumulating a second scope.
   */
  async createContext(input: CreateAdaptationContextInput): Promise<AdaptationContextView> {
    if (!(await this.#identity.personExists(input.personId))) {
      throw new InvalidAdaptationContextError(`No person '${input.personId}'.`);
    }

    // Establishing a scope needs to know *which revision* it is against, not the whole person.
    const identityRevision = await this.#identity.readIdentityRevision(input.personId);
    if (identityRevision === undefined) {
      throw new InvalidAdaptationContextError(`No Durable Identity for '${input.personId}'.`);
    }
    const stated = await this.#identity.readStatedContext(input.personId);
    const understanding = await this.#opportunities.getUnderstanding(input.opportunityId);
    if (!understanding) throw new OpportunityNotUnderstoodError(input.opportunityId);

    if (input.representationId) {
      const prior = await this.#representations.getRepresentationPrior(input.representationId);
      if (!prior || prior.personId !== input.personId) {
        throw new InvalidAdaptationContextError(
          `No Identity Representation '${input.representationId}' for this person.`,
        );
      }
    }

    const context = await this.#repository.insert({
      id: randomUUID(),
      personId: input.personId,
      opportunityId: input.opportunityId,
      opportunityRevision: understanding.revision,
      identityRevision,
      createdBy: input.createdBy,
      ...(input.representationId ? { representationId: input.representationId } : {}),
    });

    return this.#assemble(context);
  }

  /**
   * Read a context, re-deriving everything it shows.
   *
   * The opportunity understanding, the person's conditions and the intersection are **derived on
   * every read** from their owners. Nothing was copied, so nothing can go stale — and a condition
   * the person edits shows up here immediately, without any refresh path.
   */
  async getContext(contextId: string): Promise<AdaptationContextView | undefined> {
    const context = await this.#repository.find(contextId);
    if (!context) return undefined;
    return this.#assemble(context);
  }

  listContexts(personId: string): Promise<readonly AdaptationContext[]> {
    return this.#repository.listForPerson(personId);
  }

  // --- Module 2: Context Adaptation (UC05–UC08, ADR 0019) ------------------------------------

  /**
   * Adapt this person's positioning to one opportunity.
   *
   *   P_i(E_t) -> Assess -> Recover(E_t, C) [optional] -> A^C
   *
   * **Representation-first.** The selected lens is the default adaptation surface; Durable Identity
   * is consulted only where the lens does not expose something the posting asks for. Adaptation does
   * not re-solve the whole identity per opportunity — the lens is what the person maintains, and
   * overruling it by default would make maintaining it pointless.
   *
   * Composed on request and **stored nowhere**: every element is derived from the lens, the canonical
   * snapshot and the interpreted context, so nothing can drift and ADR 0013 §10's retention and
   * versioning questions stay deferred until user edits (UC12) make persistence necessary.
   *
   * Writes nothing. Not Durable Identity, not the lens, not Learned State.
   */
  async composeAdaptedState(contextId: string): Promise<AdaptedState | undefined> {
    const context = await this.#repository.find(contextId);
    if (!context) return undefined;

    const view = await this.#assemble(context);

    // UC05 — load the selected persistent Representation, through its public boundary. **This comes
    // first**: it is the normal person-side prior, and what it already covers determines whether the
    // canonical reservoir is needed at all.
    const representation = context.representationId
      ? await this.#representations.getRepresentation(context.representationId)
      : undefined;

    // The lens's exposed set is the baseline. What it hides stays canonical and recoverable below:
    // hiding is a positioning prior, never an evidence boundary (ADR 0015).
    const baseline = (representation?.positioning.evidence ?? []).filter((entry) => entry.included);

    // **Durable Identity is retrieved on demand, not by default.** Authority over canonical truth
    // does not mean every adaptation must load the whole person: where the lens already speaks to
    // everything this posting asks about, the reservoir would be fetched and never read. When
    // anything is uncovered it is fetched in full, because `HiddenInRepresentation` must never
    // become `UnavailableToAdaptation`.
    const needsReservoir = requiresCanonicalEvidence(baseline, view.opportunity);
    const canonical = needsReservoir
      ? await this.#identity.projectIdentity(context.personId)
      : undefined;
    if (needsReservoir && !canonical) return undefined;

    const identityRevision = canonical?.revision ?? context.identityRevision;

    // UC06 — assess the representation against this context. Representational, never a score.
    const assessment = assessRepresentation(
      context.representationId ?? '',
      baseline,
      canonical,
      view.opportunity,
    );

    // UC07 — recover canonical evidence, only for the gaps the assessment actually found.
    const recovered = recoverEvidence(assessment, canonical, view.opportunity);

    // UC08 — one coherent temporary state. No document is rendered here; that is Module 3.
    const elements = composeElements(baseline, assessment, recovered, view.opportunity);

    return {
      contextId: context.id,
      personId: context.personId,
      opportunityId: context.opportunityId,
      identityRevision,
      opportunityRevision: view.opportunity.revision,
      composedAt: new Date().toISOString(),
      elements,
      assessment,
      recoveryUsed: recovered.length > 0,
      opportunity: view.opportunity,
      user: view.user,
      ...(context.representationId ? { representationId: context.representationId } : {}),
    };
  }

  // --- Module 3: written representation (UC10, UC11, ADR 0022) -------------------------------

  /**
   * Is there enough to write this without inventing?
   *
   * Two different kinds of "no", and conflating them would be the whole failure: **meaning** the
   * person has and Joby does not (ask them), and **professional claims** nothing confirmed supports
   * (say so; do not ask, because being told in a chat box is not confirmation).
   *
   * The gate behind this is provisional and replaceable (ADR 0022). Callers may answer, reassess and
   * be asked again — there is no cap on the loop.
   */
  async assessReadiness(input: {
    contextId: string;
    surface: RepresentationSurface;
    question?: string;
    constraints?: SurfaceConstraints;
  }): Promise<{ readiness: ReadinessAssessment; provided: readonly ApplicationInput[] } | undefined> {
    const adapted = await this.composeAdaptedState(input.contextId);
    if (!adapted) return undefined;

    const provided = await this.#written.listInput(input.contextId);
    const readiness = this.#gate.assess({
      surface: input.surface,
      adapted,
      constraints: input.constraints ?? {},
      provided,
      ...(input.question ? { question: input.question } : {}),
    });

    return { readiness, provided };
  }

  /**
   * Record what the person told Joby for this opportunity.
   *
   * Context-scoped, so an answer and a cover letter for the same opportunity share it — asking
   * someone twice why they want the same job is a product failure, and two generators inventing
   * separate motivations is worse.
   *
   * Operational and contextual. It never becomes Explicit State or PCI on its own: if something said
   * here is durable truth about the person, it enters `E` the ordinary way, confirmed.
   */
  async provideApplicationInput(input: {
    contextId: string;
    kind: ApplicationInputKind;
    prompt: string;
    answer: string;
    providedBy: string;
  }): Promise<readonly ApplicationInput[]> {
    const context = await this.#repository.find(input.contextId);
    if (!context) throw new AdaptationContextNotFoundError(input.contextId);

    const answer = input.answer?.trim() ?? '';
    if (answer.length === 0) {
      throw new InvalidAdaptationContextError('An application input needs an answer.');
    }

    await this.#written.upsertInput({
      id: randomUUID(),
      contextId: input.contextId,
      kind: input.kind,
      prompt: input.prompt,
      answer,
      providedBy: input.providedBy,
    });
    return this.#written.listInput(input.contextId);
  }

  /**
   * UC10 / UC11 — generate a grounded draft.
   *
   * Refuses rather than invents. If the gate says meaning is missing, this returns the questions
   * instead of a draft; **it does not write around the gap**. Writer output is then validated before
   * it is stored, so a segment citing a fact this person has not confirmed, or a motivation they
   * never gave, cannot reach them.
   *
   * Generation is not submission. Nothing here creates an Application Record.
   */
  async generateRepresentation(input: {
    contextId: string;
    surface: RepresentationSurface;
    question?: string;
    constraints?: SurfaceConstraints;
    generatedBy: string;
  }): Promise<GenerationOutcome | undefined> {
    const adapted = await this.composeAdaptedState(input.contextId);
    if (!adapted) return undefined;

    const constraints = input.constraints ?? {};
    const provided = await this.#written.listInput(input.contextId);
    const readiness = this.#gate.assess({
      surface: input.surface,
      adapted,
      constraints,
      provided,
      ...(input.question ? { question: input.question } : {}),
    });

    if (!readiness.ready) {
      // The honest outcome, and a designed one: Joby has questions, not a draft.
      return { status: 'needs_input', readiness, provided };
    }

    const references = await this.#representations.listRepresentationReferences(adapted.personId);
    const selection = this.#references.select(references, input.surface);

    const written = await this.#writer.write({
      surface: input.surface,
      adapted,
      constraints,
      references: selection.selected,
      provided,
      ...(input.question ? { question: input.question } : {}),
    });

    // Writer output is untrusted input, exactly as extractor output is.
    const segments = validateDraft({ segments: written.segments, adapted, provided, constraints });

    const draft = await this.#written.upsertDraft({
      id: randomUUID(),
      contextId: input.contextId,
      surface: input.surface,
      constraints,
      segments,
      writer: this.#writer.name,
      model: written.model,
      generatedBy: input.generatedBy,
      ...(input.question ? { question: input.question } : {}),
    });

    return {
      status: 'generated',
      draft,
      readiness,
      provided,
      references: {
        used: selection.selected.map((reference) => reference.id),
        provisional: selection.provisional,
        note: selection.note,
      },
    };
  }

  listDrafts(contextId: string): Promise<readonly RepresentationDraft[]> {
    return this.#written.listDrafts(contextId);
  }

  getDraft(draftId: string): Promise<RepresentationDraft | undefined> {
    return this.#written.findDraft(draftId);
  }

  /**
   * Apply the person's edit to a draft.
   *
   * Their words replace Joby's, and the generated version is kept beside them — "what Joby wrote"
   * and "what the person decided" must stay distinguishable for the later record.
   *
   * The edit is validated on the same terms as generated text: a person may say anything in their
   * own document, but Joby may not *store it as grounded* in a fact that does not exist. Nothing
   * here touches Explicit State or PCI, and no learning happens from an edit.
   */
  async editDraft(input: {
    draftId: string;
    expectedRevision: number;
    segments: readonly DraftSegment[];
    editedBy: string;
  }): Promise<RepresentationDraft> {
    const draft = await this.#written.findDraft(input.draftId);
    if (!draft) throw new InvalidAdaptationContextError(`No draft '${input.draftId}'.`);

    const adapted = await this.composeAdaptedState(draft.contextId);
    if (!adapted) throw new InvalidAdaptationContextError(`No context for draft '${input.draftId}'.`);

    const provided = await this.#written.listInput(draft.contextId);
    const segments = validateDraft({
      segments: input.segments,
      adapted,
      provided,
      constraints: draft.constraints,
    });

    return this.#db.transaction(async (tx) => {
      const edited = await this.#written.applyEdit(tx, {
        id: input.draftId,
        expectedRevision: input.expectedRevision,
        segments,
        editedBy: input.editedBy,
      });
      if (!edited) {
        const current = await this.#written.findDraft(input.draftId);
        throw new AdaptationConcurrencyError(input.expectedRevision, current?.revision);
      }
      return edited;
    });
  }

  /**
   * UC09 — which CV representation path this opportunity should take.
   *
   * Deliberately **not** part of Adapted State: routing is an open product decision, and a future
   * policy must be addable without redesigning `A^C` or the rest of Context Representation. Asking
   * the seam separately is what keeps that true.
   *
   * The default answer is provisional and says so in the decision itself.
   */
  async resolveCvPath(contextId: string): Promise<CvPathDecision | undefined> {
    const adapted = await this.composeAdaptedState(contextId);
    if (!adapted) return undefined;
    return this.#cvRouting.resolve(adapted);
  }

  /** UC02 + UC03 + UC04, over the references one context holds. */
  async #assemble(context: AdaptationContext): Promise<AdaptationContextView> {
    // Re-deriving the view needs current Stated Context and the current revision — not a projection
    // of the whole person, which nothing here reads.
    const [stated, currentRevision] = await Promise.all([
      this.#identity.readStatedContext(context.personId),
      this.#identity.readIdentityRevision(context.personId),
    ]);

    const understanding = await this.#opportunities.getUnderstanding(context.opportunityId);
    if (!understanding) throw new OpportunityNotUnderstoodError(context.opportunityId);

    // Person x world contextual interpretation happens here, from Opportunity's understanding and
    // the person's own stated conditions. Both are re-read every time, so nothing goes stale.
    const opportunity = arrangeOpportunity(understanding);
    const user = arrangeUser({
      personId: context.personId,
      identityRevision: currentRevision ?? context.identityRevision,
      stated: stated ?? {},
    });

    const prior = context.representationId
      ? await this.#representations.getRepresentationPrior(context.representationId)
      : undefined;

    return {
      context,
      opportunity,
      user,
      intersection: intersectContext(opportunity, user),
      ...(prior ? { prior } : {}),
    };
  }
}
