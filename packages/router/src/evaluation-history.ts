import type { OpportunityEvaluation } from './opportunity-decisioning';

export interface OpportunityEvaluationRun {
  readonly evaluationId: string;
  readonly personId: string;
  readonly opportunityId: string;
  readonly representationId?: string;
  readonly dimensions: OpportunityEvaluation['dimensions'];
  readonly weightsUsed: OpportunityEvaluation['weightsUsed'];
  readonly rawEvaluationScore: number;
  readonly calibratedScore?: number;
  readonly evaluationScore: number;
  readonly label: OpportunityEvaluation['label'];
  readonly confidence: number;
  readonly modelVersion: string;
  readonly evaluatedAt: string;
}

export interface OpportunityEvaluationHistoryStore {
  record(run: OpportunityEvaluationRun): Promise<void>;
  listForApplication(input: {
    readonly personId: string;
    readonly opportunityId: string;
  }): Promise<readonly OpportunityEvaluationRun[]>;
}

export class InMemoryOpportunityEvaluationHistoryStore implements OpportunityEvaluationHistoryStore {
  readonly #runs: OpportunityEvaluationRun[] = [];

  async record(run: OpportunityEvaluationRun): Promise<void> {
    this.#runs.push(run);
  }

  async listForApplication(input: {
    readonly personId: string;
    readonly opportunityId: string;
  }): Promise<readonly OpportunityEvaluationRun[]> {
    return this.#runs.filter(
      (run) => run.personId === input.personId && run.opportunityId === input.opportunityId,
    );
  }
}
