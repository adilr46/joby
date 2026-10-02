/** The three stages of interview work (ADR 0031). Vocabulary only — no behaviour is decided. */
export type InterviewStage = 'understand' | 'prepare' | 'rehearse';

/**
 * What one piece of interview work is *about*.
 *
 * References and revisions, never copies. The opportunity belongs to Opportunity, the application to
 * Application, the evidence to Identity — this records which of each the work was done against, so
 * it can be traced and rebuilt rather than going stale.
 */
export interface InterviewContext {
  readonly personId: string;
  readonly applicationId: string;
  readonly opportunityId: string;
  readonly opportunityRevision: number;
  readonly stage: InterviewStage;
}
