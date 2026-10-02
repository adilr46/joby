import type { InterviewContext } from './contract';

/** A fact supplied by an invite, a candidate report, or a first-party source. */
export interface InterviewFact {
  readonly value: string;
  readonly source: 'invite' | 'candidate_report' | 'company_source' | 'job_description';
  readonly reference?: string;
}

/**
 * Process facts are observations.  They deliberately do not turn a platform or a round into an
 * Application stage: an invite can describe a call without proving that it happened.
 */
export interface InterviewBrief {
  readonly round?: InterviewFact;
  readonly date?: InterviewFact;
  readonly platform?: InterviewFact;
  readonly interviewerRole?: InterviewFact;
  readonly format?: InterviewFact;
  readonly requisitionId?: InterviewFact;
  readonly aiInterviewer?: boolean;
  /** HireVue is multi-modal; detecting it is not evidence of an AI-led interview. */
  readonly hireVueModalityUnconfirmed?: boolean;
  readonly processFacts?: readonly InterviewFact[];
}

export type QuestionConfidence = 'observed' | 'inferred';
export type QuestionAudience = 'recruiter_screen' | 'hiring_manager' | 'peer_technical' | 'mixed_panel';

export interface PreparationQuestion {
  readonly theme: string;
  readonly audience: QuestionAudience;
  readonly confidence: QuestionConfidence;
  readonly source?: InterviewFact;
  readonly supportingProfileUnitIds: readonly string[];
  readonly gaps: readonly string[];
}

export interface EvidenceStoryPrompt {
  readonly profileUnitId: string;
  readonly title: string;
  readonly contribution?: string;
  readonly consequence?: string;
  readonly demonstratedCapabilities: readonly string[];
  readonly bestQuestionThemes: readonly string[];
  readonly gapsToVerify: readonly string[];
}

export interface EvidenceGap {
  readonly requirement: string;
  readonly reason: 'no_confirmed_profile_unit';
}

/** Disposable and rebuildable — never an Application or Identity record. */
export interface PreparationPacket {
  readonly context: InterviewContext;
  readonly generatedFrom: {
    readonly opportunityRevision: number;
    readonly evidenceRevision: number;
    readonly applicationStage: string;
  };
  readonly company?: string;
  readonly role?: string;
  readonly brief: InterviewBrief;
  readonly requirements: readonly {
    readonly requirement: string;
    readonly supportingProfileUnitIds: readonly string[];
  }[];
  readonly likelyQuestions: readonly PreparationQuestion[];
  readonly storyMap: readonly EvidenceStoryPrompt[];
  readonly gaps: readonly EvidenceGap[];
  /** PCI suggestions are visible as hints and never asserted as professional evidence. */
  readonly preparationHints: readonly string[];
  readonly simulationBrief: {
    readonly mode: 'standard' | 'asynchronous_video' | 'ai_interviewer';
    readonly guidance: readonly string[];
  };
}

export interface RehearsalTurn {
  readonly question: PreparationQuestion;
  readonly guidance: readonly string[];
}

export interface RehearsalSession {
  readonly packet: PreparationPacket;
  readonly audience: QuestionAudience;
  readonly turns: readonly RehearsalTurn[];
}

/** Coaching is temporary feedback, not a score or a fact about the person. */
export interface RehearsalCoaching {
  readonly answer: string;
  readonly evidenceMentioned: readonly string[];
  readonly evidenceStillUseful: readonly string[];
  readonly unresolvedGaps: readonly string[];
  readonly suggestions: readonly string[];
}

/** A draft debrief awaiting the person's approval before Application is called. */
export interface DebriefDraft {
  readonly kind: 'phone' | 'video' | 'in_person' | 'assessment_centre' | 'take_home';
  readonly occurredAt?: string;
  readonly observations: readonly string[];
  readonly reflection?: string;
}
