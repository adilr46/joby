/**
 * **Interview Intelligence** — the third Translation module (ADR 0031).
 *
 * ```text
 * Understand  ->  Prepare  ->  Rehearse
 * ```
 *
 * Immediate contextual action on a live Application, not a separate lifecycle. It consumes four
 * things and owns none of them:
 *
 * | Input | Owner | Consumed as |
 * |---|---|---|
 * | The opportunity | Opportunity | attributed understanding |
 * | Where the application actually is | Application | the live stage, never inferred |
 * | Professional evidence | Identity | Profile Units, selectively |
 * | Learned priors | PCI | hints, never authority |
 *
 * It produces a reviewable preparation packet and temporary rehearsal coaching. Question
 * predictions are explicitly inferred, evidence comes only from confirmed Profile Units, and a
 * rehearsal is never persisted or scored as a trait.
 *
 * **Hard boundary:** Interview Intelligence writes nothing. An interview *happened* is Application's
 * record; a rehearsal is a temporary contextual act. `createDebriefDraft` only normalises a draft;
 * an Application caller must explicitly persist the factual observation and user reflection.
 */

export { parseInterviewInvite } from './invite';
export { createDebriefDraft, createInterviewIntelligence, InterviewContextError, InterviewIntelligence } from './service';
export type { InterviewStage, InterviewContext } from './contract';
export type {
  InterviewApplicationReader,
  InterviewEvidenceReader,
  InterviewOpportunityReader,
  InterviewPriorSource,
} from './ports';
export type {
  DebriefDraft,
  EvidenceGap,
  EvidenceStoryPrompt,
  InterviewBrief,
  InterviewFact,
  PreparationPacket,
  PreparationQuestion,
  QuestionAudience,
  QuestionConfidence,
  RehearsalCoaching,
  RehearsalSession,
  RehearsalTurn,
} from './model';
export type { ParsedInterviewInvite } from './invite';
