import type { InterviewContext } from './contract';
import type {
  InterviewApplicationReader,
  InterviewEvidenceReader,
  InterviewOpportunityReader,
  InterviewPriorSource,
} from './ports';
import type {
  DebriefDraft,
  EvidenceGap,
  EvidenceStoryPrompt,
  InterviewBrief,
  PreparationPacket,
  PreparationQuestion,
  QuestionAudience,
  RehearsalCoaching,
  RehearsalSession,
} from './model';

export class InterviewContextError extends Error {}

const normalize = (value: string) => value.trim().toLocaleLowerCase();

function audienceFor(brief: InterviewBrief): QuestionAudience {
  const description = [brief.round?.value, brief.interviewerRole?.value, brief.format?.value]
    .filter((value): value is string => value !== undefined)
    .join(' ')
    .toLocaleLowerCase();
  if (/recruit|talent|human resources|\bhr\b/.test(description)) return 'recruiter_screen';
  if (/hiring manager|manager|leadership|director|head of/.test(description)) return 'hiring_manager';
  if (/technical|engineer|coding|system design|take.?home/.test(description)) return 'peer_technical';
  return 'mixed_panel';
}

function simulationFor(brief: InterviewBrief): PreparationPacket['simulationBrief'] {
  if (brief.aiInterviewer) {
    return {
      mode: 'ai_interviewer',
      guidance: [
        'Use specific, evidence-grounded answers; literal follow-ups often probe vague claims.',
        'Keep a steady pace and speak to the camera rather than reading a script.',
        'A transcription or looping problem is process context, not evidence about your performance.',
      ],
    };
  }
  if (brief.hireVueModalityUnconfirmed) {
    return {
      mode: 'asynchronous_video',
      guidance: [
        'Confirm whether this HireVue round is recorded, live human-led, or AI-led before the call.',
        'Prepare concise first-pass answers and check camera, lighting, sound, and background.',
      ],
    };
  }
  return {
    mode: 'standard',
    guidance: ['Start with the outcome, explain the trade-off, then describe your concrete contribution.'],
  };
}

export function createDebriefDraft(input: DebriefDraft): DebriefDraft {
  const observations = input.observations.map((observation) => observation.trim()).filter(Boolean);
  if (observations.length === 0) throw new InterviewContextError('A debrief needs at least one factual observation.');
  return {
    kind: input.kind,
    observations,
    ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    ...(input.reflection?.trim() ? { reflection: input.reflection.trim() } : {}),
  };
}

/**
 * Joby's native counterpart to career-ops interview-prep/plan/practice.
 * It is all read-only: the caller may render a packet or rehearse from it, but neither changes
 * Identity, Application, Opportunity, or PCI.
 */
export class InterviewIntelligence {
  readonly #opportunities: InterviewOpportunityReader;
  readonly #applications: InterviewApplicationReader;
  readonly #evidence: InterviewEvidenceReader;
  readonly #priors: InterviewPriorSource;

  constructor(dependencies: {
    opportunities: InterviewOpportunityReader;
    applications: InterviewApplicationReader;
    evidence: InterviewEvidenceReader;
    priors?: InterviewPriorSource;
  }) {
    this.#opportunities = dependencies.opportunities;
    this.#applications = dependencies.applications;
    this.#evidence = dependencies.evidence;
    this.#priors = dependencies.priors ?? { prepareHints: async () => [] };
  }

  async prepare(context: Omit<InterviewContext, 'stage'>, brief: InterviewBrief = {}): Promise<PreparationPacket> {
    const [opportunity, application, profile, hints] = await Promise.all([
      this.#opportunities.getUnderstanding(context.opportunityId),
      this.#applications.getCurrentStage(context.applicationId),
      this.#evidence.getProfileUnits(context.personId),
      this.#priors.prepareHints({ personId: context.personId, opportunityId: context.opportunityId }),
    ]);
    if (!opportunity || opportunity.revision !== context.opportunityRevision) {
      throw new InterviewContextError('The opportunity is missing or no longer at the requested revision.');
    }
    if (!application || application.personId !== context.personId || application.opportunityId !== context.opportunityId) {
      throw new InterviewContextError('The application does not belong to this person and opportunity.');
    }
    if (!profile) throw new InterviewContextError('No confirmed Profile Units are available for interview preparation.');

    const units = profile.units;
    const requirements = opportunity.requiredCapabilities ?? [];
    const mapped = requirements.map((requirement) => ({
      requirement,
      supportingProfileUnitIds: units
        .filter((unit) => unit.capabilities.some((capability) => normalize(capability) === normalize(requirement)))
        .map((unit) => unit.nodeId),
    }));
    const gaps: EvidenceGap[] = mapped
      .filter((entry) => entry.supportingProfileUnitIds.length === 0)
      .map((entry) => ({ requirement: entry.requirement, reason: 'no_confirmed_profile_unit' }));
    const audience = audienceFor(brief);
    const knownQuestions: PreparationQuestion[] = (opportunity.applicationQuestions ?? []).map((theme) => ({
      theme,
      audience,
      confidence: 'observed',
      source: { value: theme, source: 'job_description' },
      supportingProfileUnitIds: units.map((unit) => unit.nodeId),
      gaps: [],
    }));
    const inferredQuestions: PreparationQuestion[] = mapped.map((entry) => ({
      theme: `Describe your experience with ${entry.requirement}.`,
      audience,
      confidence: 'inferred',
      source: { value: entry.requirement, source: 'job_description' },
      supportingProfileUnitIds: entry.supportingProfileUnitIds,
      gaps: entry.supportingProfileUnitIds.length === 0 ? [entry.requirement] : [],
    }));
    const storyMap: EvidenceStoryPrompt[] = units.map((unit) => ({
      profileUnitId: unit.nodeId,
      title: unit.title,
      ...(unit.contribution ? { contribution: unit.contribution } : {}),
      ...(unit.consequence ? { consequence: unit.consequence } : {}),
      demonstratedCapabilities: unit.capabilities,
      bestQuestionThemes: mapped
        .filter((entry) => entry.supportingProfileUnitIds.includes(unit.nodeId))
        .map((entry) => entry.requirement),
      gapsToVerify: unit.contribution && unit.consequence ? [] : ['Verify context, contribution, and consequence before making a complete STAR claim.'],
    }));

    return {
      context: { ...context, stage: 'prepare' },
      generatedFrom: { opportunityRevision: opportunity.revision, evidenceRevision: profile.revision, applicationStage: application.stage },
      ...(opportunity.company ? { company: opportunity.company } : {}),
      ...(opportunity.role ? { role: opportunity.role } : {}),
      brief,
      requirements: mapped,
      likelyQuestions: [...knownQuestions, ...inferredQuestions],
      storyMap,
      gaps,
      preparationHints: hints,
      simulationBrief: simulationFor(brief),
    };
  }

  rehearse(packet: PreparationPacket, audience: QuestionAudience): RehearsalSession {
    const turns = packet.likelyQuestions
      .filter((question) => question.audience === audience || audience === 'mixed_panel')
      .map((question) => ({
        question,
        guidance: [
          'Lead with the result or decision.',
          'Explain the effect and the trade-off.',
          question.supportingProfileUnitIds.length > 0
            ? `Ground the answer in Profile Unit ${question.supportingProfileUnitIds.join(', ')}.`
            : 'State the evidence gap plainly; do not invent a comparable metric or ownership claim.',
        ],
      }));
    return { packet, audience, turns };
  }

  coach(answer: string, question: PreparationQuestion, packet: PreparationPacket): RehearsalCoaching {
    const normalizedAnswer = normalize(answer);
    const storyEvidence = packet.storyMap.filter((story) =>
      [story.title, story.contribution, story.consequence, ...story.demonstratedCapabilities]
        .filter((value): value is string => value !== undefined)
        .some((value) => normalizedAnswer.includes(normalize(value))),
    );
    const evidenceMentioned = storyEvidence.map((story) => story.profileUnitId);
    const evidenceStillUseful = question.supportingProfileUnitIds.filter((id) => !evidenceMentioned.includes(id));
    const suggestions = [
      ...(answer.trim() ? [] : ['Give your answer in your own words before asking for coaching.']),
      ...(evidenceMentioned.length > 0 ? [] : ['Name a confirmed project, contribution, or consequence instead of a general capability.']),
      ...(question.gaps.length > 0 ? ['Do not fill the unsupported requirement gap with an invented example or metric.'] : []),
    ];
    return { answer, evidenceMentioned, evidenceStillUseful, unresolvedGaps: question.gaps, suggestions };
  }
}

export function createInterviewIntelligence(dependencies: ConstructorParameters<typeof InterviewIntelligence>[0]) {
  return new InterviewIntelligence(dependencies);
}
