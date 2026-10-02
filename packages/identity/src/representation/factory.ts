import { PostgresOutboxStore, type Database } from '@joby/database';
import { InProcessEventDispatcher, TransactionalEventPublisher } from '@joby/events';

import type { DurableIdentityReader } from '@joby/identity';
import {
  RepresentationReferenceRepository,
  RepresentationReferenceService,
} from './reference';
import type { IdentityRepresentationModule } from './contract';
import { IdentityRepresentationFacade } from './facade';
import { RepresentationRepository } from './repository';
import { RepresentationService } from './service';

export function createIdentityRepresentation(
  db: Database,
  identity: Pick<
    DurableIdentityReader,
    'getPerson' | 'getPermanentIdentityView' | 'listOwnedCanonicalNodeIds'
  >,
): IdentityRepresentationModule {
  const service = new RepresentationService({
    db,
    repository: new RepresentationRepository(db),
    publisher: new TransactionalEventPublisher({
      outbox: new PostgresOutboxStore(),
      inline: new InProcessEventDispatcher({ accepts: 'inline' }),
    }),
    identity: {
        findIdentity: async (personId) => {
          const person = await identity.getPerson(personId);
          return person
            ? { personId: person.id, durableIdentityId: person.durableIdentityId }
            : undefined;
        },
      projectIdentity: (personId) => identity.getPermanentIdentityView(personId),
      listOwnedCanonicalNodeIds: (personId, nodeIds) =>
        identity.listOwnedCanonicalNodeIds(personId, nodeIds),
    },
  });
  const references = new RepresentationReferenceService({
    repository: new RepresentationReferenceRepository(db),
    identity: {
      personExists: async (personId) => (await identity.getPerson(personId)) !== undefined,
    },
  });
  return new IdentityRepresentationFacade(service, references);
}
