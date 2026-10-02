/**
 * Constructing an `Identity`.
 *
 * Consumers get the contract, never the implementing class. That is what makes the boundary
 * stable: `IdentityService` can be split, renamed or rewritten without any downstream domain
 * noticing, as long as the contract holds.
 */

import type { Database } from '@joby/database';

import type { DurableIdentityModule } from './durable-contract';
import { IdentityService, type IdentityServiceOptions } from './service';

export type CreateIdentityOptions = Omit<IdentityServiceOptions, 'db'>;

/**
 * Build the Identity contract over a database connection.
 *
 * A domain that needs Identity takes this from its composition root; it does not construct one per
 * call, because the service holds pooled resources.
 */
export function createIdentity(db: Database, options: CreateIdentityOptions = {}): DurableIdentityModule {
  return new IdentityService({ db, ...options });
}
