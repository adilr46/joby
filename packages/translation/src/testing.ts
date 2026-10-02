/** Test-only composition helpers for Translation's public module boundaries. */
import type {
  OpportunityUnderstandingPort,
  OpportunityUnderstandingView,
} from './adaptation/index';

/**
 * Supplies Opportunity's understanding without an Opportunity package or database.
 *
 * Adaptation still never reads a job description: this hands over *structured* understanding, which
 * is the only thing the port accepts.
 */
export class FakeOpportunityUnderstandingPort implements OpportunityUnderstandingPort {
  readonly #understandings = new Map<string, OpportunityUnderstandingView>();

  constructor(understandings: readonly OpportunityUnderstandingView[] = []) {
    for (const understanding of understandings) this.set(understanding);
  }

  set(understanding: OpportunityUnderstandingView): void {
    this.#understandings.set(understanding.opportunityId, understanding);
  }

  async getUnderstanding(opportunityId: string): Promise<OpportunityUnderstandingView | undefined> {
    return this.#understandings.get(opportunityId);
  }
}

/** Compatibility name for existing consumers. */
export { FakeOpportunityUnderstandingPort as FakeOpportunityIntelligencePort };
