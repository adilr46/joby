import type { Database } from '@joby/database';

import type { OpportunityModule } from './contract';
import { OpportunityService } from './service';

export function createOpportunity(options: { db: Database }): OpportunityModule {
  return new OpportunityService(options);
}
