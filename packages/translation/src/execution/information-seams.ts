/** Adaptation → Execution: the consumer view of what is intended for submission. */
export interface ApplicationIntent {
  readonly personId: string;
  readonly opportunityId: string;
  readonly adaptationContextId: string;
  readonly representation: {
    readonly draftId: string;
    readonly revision: number;
    readonly surface: 'application_answer' | 'cover_letter';
    readonly content: readonly {
      readonly text: string;
      readonly groundedInNodeIds: readonly string[];
      readonly groundedInInput: readonly ('motivation' | 'timing' | 'disclosure' | 'context')[];
    }[];
  };
}

/**
 * Execution → Opportunity and/or Adaptation: an external semantic observation.
 *
 * Mechanical feedback has no field here and remains private to Execution.
 */
export interface FastFeedback {
  readonly personId: string;
  readonly opportunityId: string;
  readonly adaptationContextId?: string;
  readonly observedAt: string;
  readonly observation: string;
}
