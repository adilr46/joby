import type { Database } from '@joby/database';
import { PostgresOutboxStore } from '@joby/database';
import { InProcessEventDispatcher, TransactionalEventPublisher } from '@joby/events';

import type { ApplicationModule } from './contract';
import { ApplicationRepository } from './repository';
import { ApplicationService } from './service';

export function createApplication(options: { db: Database }): ApplicationModule {
  return new ApplicationService({
    db: options.db,
    repository: new ApplicationRepository(options.db),
    publisher: new TransactionalEventPublisher({
      outbox: new PostgresOutboxStore(),
      inline: new InProcessEventDispatcher({ accepts: 'inline' }),
    }),
  });
}
