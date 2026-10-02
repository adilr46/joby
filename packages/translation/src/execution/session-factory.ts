import type { Database } from '@joby/database';

import type { ApplicationSessionModule } from './session-contract';
import { ApplicationSessionRepository } from './session-repository';
import { ApplicationSessionService } from './session-service';

export function createApplicationSessionModule(options: { db: Database }): ApplicationSessionModule {
  return new ApplicationSessionService({
    db: options.db,
    repository: new ApplicationSessionRepository(options.db),
  });
}
