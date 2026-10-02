/**
 * `@joby/opportunity/runtime` — composition, for Joby's own runtimes.
 *
 * There is nothing here another module should reach; it exists so the split by *who is asking*
 * matches the rest of Joby rather than being a special case for this module.
 */

export { createOpportunity as createOpportunityRuntime } from './factory';
export type { OpportunityModule as OpportunityRuntime } from './contract';
