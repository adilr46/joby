import type { Database } from '@joby/database';
import {
  createEvent,
  type EventHandler,
  type JobyEvent,
  type TransactionalEventPublisher,
} from '@joby/events';

import type { RepresentationRepository } from './repository';

/** Owner-controlled reconciliation of stable canonical IDs after Durable Identity removes one. */
export class CanonicalFactRemovalReconciler {
  constructor(
    private readonly db: Database,
    private readonly repository: RepresentationRepository,
    private readonly publisher: TransactionalEventPublisher,
  ) {}

  async reconcile(event: JobyEvent<'CanonicalFactRemoved'>): Promise<void> {
    const representationIds = await this.repository.listRepresentationIdsForNode(
      event.payload.nodeId,
    );

    for (const representationId of representationIds) {
      const result = await this.db.transaction(async (tx) => {
        const representation = await this.repository.find(representationId, tx);
        if (!representation) return undefined;

        const removed = await this.repository.deleteDecision(
          tx,
          representationId,
          event.payload.nodeId,
        );
        if (!removed) return undefined;

        const revision = await this.repository.incrementRevision(tx, representationId);
        const revised = createEvent('IdentityRepresentationRevised', {
          personId: representation.personId,
          payload: { representationId, revision, changedFields: ['decisions'] },
          metadata: {
            source: 'worker',
            actor: { kind: 'system', component: 'identity-representation-reconciliation' },
            causationId: event.id,
            ...(event.metadata.correlationId
              ? { correlationId: event.metadata.correlationId }
              : {}),
          },
        });
        await this.publisher.recordDurable(tx, revised);
        return revised;
      });

      if (result) await this.publisher.publishCommitted(result);
    }
  }
}

export function canonicalFactRemovedHandler(
  reconciler: CanonicalFactRemovalReconciler,
): EventHandler<'CanonicalFactRemoved'> {
  return {
    id: 'identity-representation.reconcile-canonical-fact-removal',
    module: 'identity_representation',
    handles: 'CanonicalFactRemoved',
    delivery: 'deferrable',
    handle: (event) => reconciler.reconcile(event),
  };
}
