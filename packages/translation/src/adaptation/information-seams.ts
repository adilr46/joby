import type { DraftSegment, RepresentationSurface } from './writing';

/**
 * Adaptation → Execution: the representation Joby currently intends to submit.
 *
 * This is an intention snapshot, not proof of submission and not an Application Record.
 */
export interface ApplicationIntent {
  readonly personId: string;
  readonly opportunityId: string;
  readonly adaptationContextId: string;
  readonly representation: {
    readonly draftId: string;
    readonly revision: number;
    readonly surface: RepresentationSurface;
    readonly content: readonly DraftSegment[];
  };
}

/** Execution → Adaptation: semantic feedback routed to the affected adaptation context. */
export interface FastFeedback {
  readonly personId: string;
  readonly opportunityId: string;
  readonly adaptationContextId: string;
  readonly observedAt: string;
  readonly observation: string;
}
