/**
 * Review and confirmation: the gate between a proposal and the person's actual history.
 *
 * This is the only code in Joby that can turn model output into canonical Explicit State, and it
 * can only do so by being handed an explicit decision for **every** proposed item.
 *
 * That is the mechanical form of "reviewed-set confirmation, never bulk acceptance of the unseen".
 * A caller cannot say "accept all" — there is no such input. It must enumerate what it saw, which
 * means a UI cannot confirm items the user was never shown without lying in a way that is visible
 * in the recorded decision history.
 */

import { randomUUID } from 'node:crypto';

import type { Database, Transaction } from '@joby/database';
import { createEvent, type TransactionalEventPublisher } from '@joby/events';

import type {
  EpistemicStatus,
  ProposedActivity,
  ProposedRelation,
  ProposedStructure,
  ReviewRecord,
  SourceReference,
  StructureKind,
} from './model';
import { ConcurrencyError } from './concurrency';
import { ExplicitStateRepository } from './explicit-state-repository';
import type { IdentityRepository } from './repository';

/** Merge capability lists without duplicating what is already held. */
function union(held: readonly string[], incoming: readonly string[]): string[] {
  const seen = new Map(held.map((value) => [value.toLowerCase().trim(), value]));
  for (const value of incoming) {
    const key = value.toLowerCase().trim();
    if (!seen.has(key)) seen.set(key, value);
  }
  return [...seen.values()];
}

export class ProposalNotFoundError extends Error {
  constructor(proposalId: string) {
    super(`No proposal '${proposalId}'.`);
    this.name = 'ProposalNotFoundError';
  }
}

export class AlreadyConfirmedError extends Error {
  constructor(proposalId: string) {
    super(`Proposal '${proposalId}' has already been confirmed. Confirming twice would apply the same facts again.`);
    this.name = 'AlreadyConfirmedError';
  }
}

/**
 * Raised when a confirmation does not account for every proposed item.
 *
 * The doctrinal one: a caller that has not decided about an item cannot have shown it to the user,
 * so confirming would be a bulk accept of something unseen.
 */
export class IncompleteReviewError extends Error {
  constructor(readonly undecidedItemIds: readonly string[]) {
    super(
      `Cannot confirm: ${undecidedItemIds.length} proposed item(s) have no decision ` +
        `(${undecidedItemIds.slice(0, 5).join(', ')}${undecidedItemIds.length > 5 ? ', …' : ''}). ` +
        'Every proposed item must be retained, edited, excluded or rejected — there is no bulk accept.',
    );
    this.name = 'IncompleteReviewError';
  }
}

export class UnknownProposalItemError extends Error {
  constructor(readonly itemIds: readonly string[]) {
    super(`Decisions reference items that are not in this proposal: ${itemIds.join(', ')}.`);
    this.name = 'UnknownProposalItemError';
  }
}

/**
 * Raised when a retained relation depends on an item the user kept out.
 *
 * Deliberately an error rather than a silent drop: quietly discarding something the user retained
 * would mean the applied set is not the reviewed set.
 */
export class DanglingRelationError extends Error {
  constructor(readonly relationId: string, readonly missingItemId: string) {
    super(
      `Relation '${relationId}' was retained but its endpoint '${missingItemId}' was not. ` +
        'Exclude the relation too, or retain the endpoint.',
    );
    this.name = 'DanglingRelationError';
  }
}

// Lives in `concurrency.ts` and is re-exported here, where callers have always found it. The rule
// is shared by every mutable workflow, so it belongs to none of their write services in particular.
export { ConcurrencyError } from './concurrency';

/** What the user changed about a proposed item, or asserted from scratch. */
export interface ItemEdit {
  readonly label?: string;
  readonly startedAt?: string | null;
  readonly endedAt?: string | null;
  readonly contribution?: string | null;
  readonly capability?: readonly string[] | null;
  readonly consequence?: string | null;
  readonly epistemicStatus?: EpistemicStatus;
}

export interface ReviewDecisionInput {
  readonly itemId: string;
  readonly decision: 'retain' | 'edit' | 'exclude' | 'reject';
  /** Required for `edit`. */
  readonly edit?: ItemEdit;
}

/** A fact the user adds during review that the proposal never contained. */
export interface SupplementInput {
  readonly type: 'structure' | 'activity';
  readonly label: string;
  readonly kind?: StructureKind;
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly contribution?: string;
  readonly capability?: readonly string[];
  readonly consequence?: string;
}

export interface ConfirmReviewInput {
  readonly proposalId: string;
  /** The identity revision the user reviewed against. */
  readonly expectedRevision: number;
  readonly decisions: readonly ReviewDecisionInput[];
  readonly supplements?: readonly SupplementInput[];
  readonly confirmedBy: string;
}

export interface ConfirmReviewResult {
  readonly reviewId: string;
  readonly revision: number;
  readonly appliedNodeIds: readonly string[];
  readonly appliedRelationIds: readonly string[];
  /** Existing facts that gained resolution rather than being duplicated. */
  readonly enrichedNodeIds: readonly string[];
  readonly excludedItemIds: readonly string[];
  /** True when nothing was retained, so canonical Explicit State did not change. */
  readonly unchanged: boolean;
}

type AnyProposedItem = ProposedStructure | ProposedActivity | ProposedRelation;

export class ReviewService {
  readonly #db: Database;
  readonly #identity: IdentityRepository;
  readonly #state: ExplicitStateRepository;
  readonly #publisher: TransactionalEventPublisher;

  constructor(dependencies: {
    db: Database;
    identityRepository: IdentityRepository;
    stateRepository: ExplicitStateRepository;
    publisher: TransactionalEventPublisher;
  }) {
    this.#db = dependencies.db;
    this.#identity = dependencies.identityRepository;
    this.#state = dependencies.stateRepository;
    this.#publisher = dependencies.publisher;
  }

  async confirm(input: ConfirmReviewInput): Promise<ConfirmReviewResult> {
    const proposal = await this.#identity.findProposal(input.proposalId);
    if (!proposal) throw new ProposalNotFoundError(input.proposalId);
    if (proposal.status === 'confirmed') throw new AlreadyConfirmedError(input.proposalId);

    const { structure, activities, relations } = proposal.content;

    // Conflicts are informational annotations, not facts to apply, so they need no decision.
    const items = new Map<string, AnyProposedItem>();
    for (const item of [...structure, ...activities, ...relations]) items.set(item.id, item);

    const decisions = new Map<string, ReviewDecisionInput>();
    const unknown: string[] = [];
    for (const decision of input.decisions) {
      if (!items.has(decision.itemId)) unknown.push(decision.itemId);
      decisions.set(decision.itemId, decision);
    }
    if (unknown.length > 0) throw new UnknownProposalItemError(unknown);

    // The anti-bulk-accept guard.
    const undecided = [...items.keys()].filter((id) => !decisions.has(id));
    if (undecided.length > 0) throw new IncompleteReviewError(undecided);

    const retained = (id: string): boolean => {
      const decision = decisions.get(id)?.decision;
      return decision === 'retain' || decision === 'edit';
    };

    // An endpoint is usable if the user retained it, or if it already exists in Explicit State
    // (which is the normal case for enrichment: the fact is there, only the edge is new).
    const alreadyCanonical = new Set(
      [...structure, ...activities].filter((item) => item.delta?.matchedId).map((item) => item.id),
    );

    // A retained relation whose endpoint was kept out cannot be applied, and must not be dropped
    // behind the user's back.
    for (const relation of relations) {
      if (!retained(relation.id)) continue;
      for (const endpoint of [relation.fromId, relation.toId]) {
        if (!retained(endpoint) && !alreadyCanonical.has(endpoint)) {
          throw new DanglingRelationError(relation.id, endpoint);
        }
      }
    }

    const person = await this.#identity.findPerson(proposal.personId);
    if (!person) throw new Error(`Person '${proposal.personId}' disappeared`);

    const appliedNodeIds: string[] = [];
    const appliedRelationIds: string[] = [];
    /** Existing facts that gained something instead of being duplicated. */
    const enrichedNodeIds: string[] = [];
    const excludedItemIds = [...decisions.values()]
      .filter((d) => d.decision === 'exclude' || d.decision === 'reject')
      .map((d) => d.itemId);

    const supplements = input.supplements ?? [];
    const willChange =
      supplements.length > 0 || [...items.keys()].some((id) => retained(id));

    const result = await this.#db.transaction(async (tx) => {
      // Guard first: if someone else moved the identity on, nothing below should happen.
      let revision = input.expectedRevision;
      if (willChange) {
        const bumped = await this.#state.bumpRevision(tx, person.id, input.expectedRevision);
        if (bumped === undefined) {
          throw new ConcurrencyError(input.expectedRevision, await this.#state.getRevision(person.id));
        }
        revision = bumped;
      }

      const reviewId = randomUUID();
      await this.#state.insertReview(tx, {
        id: reviewId,
        personId: person.id,
        proposalId: proposal.id,
        revision,
        confirmedBy: input.confirmedBy,
      });

      // Proposal item id → canonical node id, so relations can be rewired to what was applied.
      const nodeIdFor = new Map<string, string>();

      const recordProvenance = async (
        subjectType: 'node' | 'relation',
        subjectId: string,
        sources: readonly SourceReference[],
      ): Promise<void> => {
        // One row per cited passage: that is what makes provenance atomic rather than a gesture
        // at the document as a whole.
        for (const reference of sources) {
          await this.#state.insertProvenance(tx, {
            id: randomUUID(),
            personId: person.id,
            subjectType,
            subjectId,
            origin: 'reconstruction',
            sourceId: reference.sourceId,
            proposalId: proposal.id,
            quote: reference.quote,
            recordedBy: input.confirmedBy,
            ...(reference.startOffset !== undefined ? { startOffset: reference.startOffset } : {}),
            ...(reference.endOffset !== undefined ? { endOffset: reference.endOffset } : {}),
          });
        }
      };

      // A candidate that matched an existing fact resolves to *that* node, so relations wire to
      // what is already there rather than to something newly duplicated.
      for (const item of [...structure, ...activities]) {
        if (item.delta?.matchedId) nodeIdFor.set(item.id, item.delta.matchedId);
      }

      for (const proposed of structure) {
        const decision = decisions.get(proposed.id)!;
        if (!retained(proposed.id)) {
          await this.#recordDecision(tx, reviewId, decision, proposed);
          continue;
        }

        const edit = decision.edit ?? {};
        const matchedId = proposed.delta?.matchedId;

        if (matchedId) {
          // Enrichment, clarification, duplicate or an accepted conflict resolution — all of them
          // change or corroborate an existing fact rather than adding a second one beside it.
          await this.#enrich(tx, matchedId, {
            ...pick('label', edit.label, undefined),
            ...pick('startedAt', edit.startedAt, proposed.startedAt),
            ...pick('endedAt', edit.endedAt, proposed.endedAt),
          });

          enrichedNodeIds.push(matchedId);
          await recordProvenance('node', matchedId, proposed.sources);
          await this.#recordDecision(tx, reviewId, decision, proposed, 'node', matchedId);
          continue;
        }

        const node = await this.#state.insertStructure(tx, {
          id: randomUUID(),
          personId: person.id,
          kind: proposed.kind,
          label: edit.label ?? proposed.label,
          epistemicStatus: edit.epistemicStatus ?? proposed.epistemicStatus,
          ...pick('startedAt', edit.startedAt, proposed.startedAt),
          ...pick('endedAt', edit.endedAt, proposed.endedAt),
        });

        nodeIdFor.set(proposed.id, node.id);
        appliedNodeIds.push(node.id);
        await recordProvenance('node', node.id, proposed.sources);
        await this.#recordDecision(tx, reviewId, decision, proposed, 'node', node.id);
      }

      for (const proposed of activities) {
        const decision = decisions.get(proposed.id)!;
        if (!retained(proposed.id)) {
          await this.#recordDecision(tx, reviewId, decision, proposed);
          continue;
        }

        const edit = decision.edit ?? {};
        const matchedId = proposed.delta?.matchedId;

        if (matchedId) {
          const existing = await this.#state.findNode(matchedId, tx);
          const heldCapability =
            existing && existing.type === 'activity' ? (existing.capability ?? []) : [];
          const incoming = edit.capability ?? proposed.capability;

          await this.#enrich(tx, matchedId, {
            ...pick('label', edit.label, undefined),
            ...pick('contribution', edit.contribution, proposed.contribution),
            ...pick('consequence', edit.consequence, proposed.consequence),
            // Capability is additive across sources: a second source naming another language adds
            // to what is held rather than replacing it.
            ...(incoming && incoming.length > 0
              ? { capability: union(heldCapability, incoming) }
              : {}),
          });

          enrichedNodeIds.push(matchedId);
          await recordProvenance('node', matchedId, proposed.sources);
          await this.#recordDecision(tx, reviewId, decision, proposed, 'node', matchedId);
          continue;
        }

        const node = await this.#state.insertActivity(tx, {
          id: randomUUID(),
          personId: person.id,
          label: edit.label ?? proposed.label,
          epistemicStatus: edit.epistemicStatus ?? proposed.epistemicStatus,
          // An edit may add a component the source lacked, or clear one — but nothing here
          // invents a value the user did not supply. Absence passes straight through.
          ...pick('contribution', edit.contribution, proposed.contribution),
          ...pick('consequence', edit.consequence, proposed.consequence),
          ...pick('capability', edit.capability, proposed.capability),
        });

        nodeIdFor.set(proposed.id, node.id);
        appliedNodeIds.push(node.id);
        await recordProvenance('node', node.id, proposed.sources);
        await this.#recordDecision(tx, reviewId, decision, proposed, 'node', node.id);
      }

      for (const proposed of relations) {
        const decision = decisions.get(proposed.id)!;
        if (!retained(proposed.id)) {
          await this.#recordDecision(tx, reviewId, decision, proposed);
          continue;
        }

        // The edge already exists between these two facts: a second source corroborating the same
        // connection records provenance, not a duplicate edge.
        const matchedRelationId = proposed.delta?.matchedId;
        if (matchedRelationId) {
          await recordProvenance('relation', matchedRelationId, proposed.sources);
          await this.#recordDecision(tx, reviewId, decision, proposed, 'relation', matchedRelationId);
          continue;
        }

        const relation = await this.#state.insertRelation(tx, {
          id: randomUUID(),
          personId: person.id,
          kind: proposed.kind,
          fromNodeId: nodeIdFor.get(proposed.fromId)!,
          toNodeId: nodeIdFor.get(proposed.toId)!,
          epistemicStatus: decision.edit?.epistemicStatus ?? proposed.epistemicStatus,
        });

        appliedRelationIds.push(relation.id);
        await recordProvenance('relation', relation.id, proposed.sources);
        await this.#recordDecision(tx, reviewId, decision, proposed, 'relation', relation.id);
      }

      // Supplements: the user's own facts, carrying no source quote because no source said them.
      for (const supplement of supplements) {
        const node =
          supplement.type === 'structure'
            ? await this.#state.insertStructure(tx, {
                id: randomUUID(),
                personId: person.id,
                kind: supplement.kind ?? 'organisation',
                label: supplement.label,
                epistemicStatus: 'observed',
                ...(supplement.startedAt ? { startedAt: supplement.startedAt } : {}),
                ...(supplement.endedAt ? { endedAt: supplement.endedAt } : {}),
              })
            : await this.#state.insertActivity(tx, {
                id: randomUUID(),
                personId: person.id,
                label: supplement.label,
                epistemicStatus: 'observed',
                ...(supplement.contribution ? { contribution: supplement.contribution } : {}),
                ...(supplement.consequence ? { consequence: supplement.consequence } : {}),
                ...(supplement.capability ? { capability: supplement.capability } : {}),
              });

        appliedNodeIds.push(node.id);
        await this.#state.insertProvenance(tx, {
          id: randomUUID(),
          personId: person.id,
          subjectType: 'node',
          subjectId: node.id,
          origin: 'user_supplement',
          recordedBy: input.confirmedBy,
        });
        await this.#state.insertReviewDecision(tx, {
          id: randomUUID(),
          reviewId,
          decision: 'supplement',
          edited: supplement,
        });
      }

      await this.#state.markProposalConfirmed(tx, proposal.id);

      // IdentityUpdated means a confirmed change to canonical Explicit State. A review that
      // retained nothing changed nothing, so it publishes nothing.
      const event = willChange
        ? createEvent('IdentityUpdated', {
            personId: person.id,
            payload: {
              identityId: person.durableIdentityId,
              changedFields: changedFields(appliedNodeIds.length, appliedRelationIds.length),
              revision,
              userConfirmed: true,
            },
            metadata: { source: 'api', actor: { kind: 'user', userId: input.confirmedBy } },
          })
        : undefined;

      // Recorded inside the transaction, so the fact and its announcement commit together.
      if (event) await this.#publisher.recordDurable(tx, event);

      return { reviewId, revision, event };
    });

    if (result.event) await this.#publisher.publishCommitted(result.event);

    return {
      reviewId: result.reviewId,
      revision: result.revision,
      appliedNodeIds,
      appliedRelationIds,
      enrichedNodeIds,
      excludedItemIds,
      unchanged: !willChange,
    };
  }

  async getReview(proposalId: string): Promise<ReviewRecord | undefined> {
    return this.#state.findReviewByProposal(proposalId);
  }

  /**
   * Apply an enrichment to an existing fact.
   *
   * Read-then-update inside the confirmation transaction, using the node's current revision: the
   * identity-level guard has already been taken, so nothing else can be mid-flight here.
   */
  async #enrich(
    tx: Transaction,
    nodeId: string,
    changes: Parameters<ExplicitStateRepository['updateNode']>[3],
  ): Promise<void> {
    if (Object.keys(changes).length === 0) return;

    const existing = await this.#state.findNode(nodeId, tx);
    if (!existing) throw new Error(`Matched node '${nodeId}' no longer exists`);

    await this.#state.updateNode(tx, nodeId, existing.revision, changes);
  }

  async #recordDecision(
    tx: Transaction,
    reviewId: string,
    decision: ReviewDecisionInput,
    proposed: AnyProposedItem,
    appliedType?: 'node' | 'relation',
    appliedId?: string,
  ): Promise<void> {
    await this.#state.insertReviewDecision(tx, {
      id: randomUUID(),
      reviewId,
      proposalItemId: decision.itemId,
      decision: decision.decision,
      // Freezing what was proposed is what lets someone later ask "what did the model actually
      // say, and what did I change?" — the question the review history exists to answer.
      proposed,
      ...(decision.edit ? { edited: decision.edit } : {}),
      ...(appliedType ? { appliedType } : {}),
      ...(appliedId ? { appliedId } : {}),
    });
  }
}

function changedFields(nodes: number, relations: number): string[] {
  const fields: string[] = [];
  if (nodes > 0) fields.push('reconstructed.nodes');
  if (relations > 0) fields.push('reconstructed.relations');
  return fields;
}

/**
 * Choose the edited value over the proposed one, treating `null` as "clear this" and `undefined`
 * as "leave it as proposed".
 *
 * The distinction matters: a user removing an invented consequence is different from a user not
 * mentioning it, and collapsing them would silently keep something they deleted.
 */
function pick<K extends string, V>(
  key: K,
  edited: V | null | undefined,
  proposed: V | undefined,
): Partial<Record<K, V>> {
  if (edited === null) return {};
  if (edited !== undefined) return { [key]: edited } as Record<K, V>;
  return proposed === undefined ? {} : ({ [key]: proposed } as Record<K, V>);
}
