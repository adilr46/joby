/**
 * Direct user corrections to canonical Explicit State.
 *
 * UC07: the person can fix what Joby holds about them **without going through another
 * reconstruction**. Requiring one would mean the only way to fix a wrong fact is to re-run the
 * thing that got it wrong.
 *
 * Two rules this file exists to hold:
 *
 *  - **Corrections change R and nothing else.** Not Stated Context, and never Learned State/PCI —
 *    a person fixing a job title has not taught Joby anything about who they are, and the Slower
 *    Learning Loop is the only path to L (ADR 0006, ADR 0011 invariant 6).
 *  - **A correction is guarded by the revision of the fact being corrected**, so two people (or
 *    two tabs) cannot silently overwrite each other.
 */

import { randomUUID } from 'node:crypto';

import type { Database, Transaction } from '@joby/database';
import { createEvent, type TransactionalEventPublisher } from '@joby/events';

import type { CorrectionRecord, EpistemicStatus, ExplicitNode, StructureKind } from './model';
import { ConcurrencyError } from './review';
import { ExplicitStateRepository } from './explicit-state-repository';
import type { IdentityRepository } from './repository';

export class NodeNotFoundError extends Error {
  constructor(nodeId: string) {
    super(`No canonical node '${nodeId}'.`);
    this.name = 'NodeNotFoundError';
  }
}

export class InvalidCorrectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCorrectionError';
  }
}

export interface CorrectNodeInput {
  readonly nodeId: string;
  /** The revision the user read. Stale means someone else changed this fact first. */
  readonly expectedRevision: number;
  readonly correctedBy: string;
  readonly changes: {
    readonly label?: string;
    /** `null` clears the component; omitting it leaves it alone. */
    readonly startedAt?: string | null;
    readonly endedAt?: string | null;
    readonly contribution?: string | null;
    readonly capability?: readonly string[] | null;
    readonly consequence?: string | null;
    readonly epistemicStatus?: EpistemicStatus;
  };
}

export interface AddNodeInput {
  readonly personId: string;
  readonly type: 'structure' | 'activity';
  readonly label: string;
  readonly kind?: StructureKind;
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly contribution?: string;
  readonly capability?: readonly string[];
  readonly consequence?: string;
  readonly correctedBy: string;
}

export interface CorrectionResult {
  readonly node?: ExplicitNode;
  readonly revision: number;
}

export class CorrectionService {
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

  async correctNode(input: CorrectNodeInput): Promise<CorrectionResult> {
    const before = await this.#state.findNode(input.nodeId);
    if (!before) throw new NodeNotFoundError(input.nodeId);

    if (before.type === 'structure') {
      const activityFields = ['contribution', 'capability', 'consequence'] as const;
      for (const field of activityFields) {
        if (input.changes[field] !== undefined) {
          throw new InvalidCorrectionError(`Structure has no '${field}'. Structure says where, not what was done.`);
        }
      }
    } else {
      // Clearing every component would leave an activity asserting nothing. The database CHECK
      // would reject it anyway; catching it here gives the user a sentence instead of a constraint.
      const after = {
        contribution: input.changes.contribution === undefined ? before.contribution : input.changes.contribution,
        capability: input.changes.capability === undefined ? before.capability : input.changes.capability,
        consequence: input.changes.consequence === undefined ? before.consequence : input.changes.consequence,
      };
      const empty =
        !after.contribution && !after.consequence && (!after.capability || after.capability.length === 0);
      if (empty) {
        throw new InvalidCorrectionError(
          'An activity must keep at least one of contribution, capability or consequence. ' +
            'To remove it entirely, delete the activity.',
        );
      }
    }

    const personId = await this.#state.findNodeOwner(input.nodeId);
    if (!personId) throw new NodeNotFoundError(input.nodeId);

    const result = await this.#db.transaction(async (tx) => {
      const updated = await this.#state.updateNode(tx, input.nodeId, input.expectedRevision, input.changes);
      if (!updated) {
        const current = await this.#state.findNode(input.nodeId, tx);
        throw new ConcurrencyError(input.expectedRevision, current?.revision);
      }

      await this.#state.insertCorrection(tx, {
        id: randomUUID(),
        personId,
        subjectType: 'node',
        subjectId: input.nodeId,
        operation: 'update',
        // Before and after, so the change is explainable later — including to the person.
        before,
        after: updated,
        correctedBy: input.correctedBy,
      });

      // The corrected fact is now user-asserted as well as source-derived. The original
      // reconstruction provenance is left in place: it still records where the fact came from,
      // and deleting it would erase the history the correction is a change to.
      await this.#state.insertProvenance(tx, {
        id: randomUUID(),
        personId,
        subjectType: 'node',
        subjectId: input.nodeId,
        origin: 'user_correction',
        recordedBy: input.correctedBy,
      });

      const recorded = await this.#record(tx, personId, ['reconstructed.nodes'], input.correctedBy);
      return { node: updated, revision: recorded.revision, event: recorded.event };
    });

    await this.#publisher.publishCommitted(result.event);
    return { node: result.node, revision: result.revision };
  }

  async addNode(input: AddNodeInput): Promise<CorrectionResult> {
    const person = await this.#identity.findPerson(input.personId);
    if (!person) throw new NodeNotFoundError(input.personId);

    if (input.type === 'activity' && !input.contribution && !input.consequence && !input.capability?.length) {
      throw new InvalidCorrectionError(
        'An activity needs at least one of contribution, capability or consequence.',
      );
    }

    const result = await this.#db.transaction(async (tx) => {
      const node =
        input.type === 'structure'
          ? await this.#state.insertStructure(tx, {
              id: randomUUID(),
              personId: input.personId,
              kind: input.kind ?? 'organisation',
              label: input.label,
              // The user said it, so it is observed — not inferred, and certainly not hypothesized.
              epistemicStatus: 'observed',
              ...(input.startedAt ? { startedAt: input.startedAt } : {}),
              ...(input.endedAt ? { endedAt: input.endedAt } : {}),
            })
          : await this.#state.insertActivity(tx, {
              id: randomUUID(),
              personId: input.personId,
              label: input.label,
              epistemicStatus: 'observed',
              ...(input.contribution ? { contribution: input.contribution } : {}),
              ...(input.consequence ? { consequence: input.consequence } : {}),
              ...(input.capability ? { capability: input.capability } : {}),
            });

      await this.#state.insertCorrection(tx, {
        id: randomUUID(),
        personId: input.personId,
        subjectType: 'node',
        subjectId: node.id,
        operation: 'add',
        after: node,
        correctedBy: input.correctedBy,
      });

      await this.#state.insertProvenance(tx, {
        id: randomUUID(),
        personId: input.personId,
        subjectType: 'node',
        subjectId: node.id,
        origin: 'user_supplement',
        recordedBy: input.correctedBy,
      });

      const recorded = await this.#record(tx, input.personId, ['reconstructed.nodes'], input.correctedBy);
      return { node, revision: recorded.revision, event: recorded.event };
    });

    await this.#publisher.publishCommitted(result.event);
    return { node: result.node, revision: result.revision };
  }

  async removeNode(input: {
    nodeId: string;
    expectedRevision: number;
    correctedBy: string;
  }): Promise<{ revision: number }> {
    const before = await this.#state.findNode(input.nodeId);
    if (!before) throw new NodeNotFoundError(input.nodeId);

    const personId = await this.#state.findNodeOwner(input.nodeId);
    if (!personId) throw new NodeNotFoundError(input.nodeId);

    // Recorded before deletion: the relations disappear with the node, and the history should say
    // what went with it rather than leaving an unexplained gap.
    const relations = await this.#state.findRelationsFor(input.nodeId);

    const result = await this.#db.transaction(async (tx) => {
      const deleted = await this.#state.deleteNode(tx, input.nodeId, input.expectedRevision);
      if (!deleted) {
        const current = await this.#state.findNode(input.nodeId, tx);
        throw new ConcurrencyError(input.expectedRevision, current?.revision);
      }

      await this.#state.insertCorrection(tx, {
        id: randomUUID(),
        personId,
        subjectType: 'node',
        subjectId: input.nodeId,
        operation: 'remove',
        before: { node: before, cascadedRelations: relations },
        correctedBy: input.correctedBy,
      });

      const recorded = await this.#record(tx, personId, ['reconstructed.nodes'], input.correctedBy);
      const removed = createEvent('CanonicalFactRemoved', {
        personId,
        payload: {
          identityId: recorded.identityId,
          nodeId: input.nodeId,
          revision: recorded.revision,
        },
        metadata: { source: 'api', actor: { kind: 'user', userId: input.correctedBy } },
      });
      await this.#publisher.recordDurable(tx, removed);
      return { revision: recorded.revision, event: recorded.event, removed };
    });

    await this.#publisher.publishCommitted(result.event);
    await this.#publisher.publishCommitted(result.removed);
    return { revision: result.revision };
  }

  listCorrections(personId: string): Promise<readonly CorrectionRecord[]> {
    return this.#state.listCorrections(personId);
  }

  /**
   * Bump the identity revision and record `IdentityUpdated` inside the caller's transaction.
   *
   * The event is returned rather than stashed on the instance: two concurrent corrections share
   * this service, and instance state would let one overwrite the other's event before it was
   * published.
   */
  async #record(
    tx: Transaction,
    personId: string,
    changedFields: readonly string[],
    actorId: string,
  ): Promise<{ revision: number; identityId: string; event: AnyIdentityEvent }> {
    const person = await this.#identity.findPerson(personId, tx);
    if (!person) throw new NodeNotFoundError(personId);

    const revision = await this.#state.incrementRevision(tx, personId);

    const event = createEvent('IdentityUpdated', {
      personId,
      payload: {
        identityId: person.durableIdentityId,
        changedFields: [...changedFields],
        revision,
        // A correction is the user acting directly. Nothing here originates from AI.
        userConfirmed: true,
      },
      metadata: { source: 'api', actor: { kind: 'user', userId: actorId } },
    });

    await this.#publisher.recordDurable(tx, event);
    return { revision, identityId: person.durableIdentityId, event };
  }
}

type AnyIdentityEvent = ReturnType<typeof createEvent<'IdentityUpdated'>>;
