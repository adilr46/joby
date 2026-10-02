import { describe, expect, it } from 'vitest';

import { parseInterviewInvite } from './invite';
import { createDebriefDraft, createInterviewIntelligence, InterviewContextError } from './service';

const intelligence = createInterviewIntelligence({
  opportunities: {
    getUnderstanding: async () => ({
      opportunityId: 'opportunity-1', revision: 4, company: 'Acme', role: 'Platform Engineer',
      requiredCapabilities: ['TypeScript', 'distributed systems'],
      applicationQuestions: ['Why Acme?'],
    }),
  },
  applications: {
    getCurrentStage: async () => ({ applicationId: 'application-1', personId: 'person-1', opportunityId: 'opportunity-1', stage: 'interviewing' }),
  },
  evidence: {
    getProfileUnits: async () => ({
      revision: 7,
      units: [{ nodeId: 'unit-1', title: 'Gateway migration', contribution: 'Built the migration', capabilities: ['TypeScript'], consequence: 'Removed a deployment bottleneck' }],
    }),
  },
  priors: { prepareHints: async () => ['Prior similar roles favoured concise technical examples.'] },
});

describe('InterviewIntelligence', () => {
  it('parses invite facts without advancing an application or guessing HireVue modality', () => {
    expect(parseInterviewInvite('Interview with Acme for req #ENG-42: https://hirevue.com/session')).toEqual({
      company: 'Acme', requisitionId: 'ENG-42',
      brief: { platform: { value: 'HireVue', source: 'invite' }, requisitionId: { value: 'ENG-42', source: 'invite' }, hireVueModalityUnconfirmed: true },
    });
    expect(parseInterviewInvite('Join https://alex.ai/interview')).toMatchObject({
      brief: { platform: { value: 'Alex', source: 'invite' }, aiInterviewer: true },
    });
  });

  it('prepares from confirmed Profile Units and surfaces unsupported requirements as gaps', async () => {
    const packet = await intelligence.prepare(
      { personId: 'person-1', applicationId: 'application-1', opportunityId: 'opportunity-1', opportunityRevision: 4 },
      { platform: { value: 'HireVue', source: 'invite' }, hireVueModalityUnconfirmed: true },
    );

    expect(packet.generatedFrom).toEqual({ opportunityRevision: 4, evidenceRevision: 7, applicationStage: 'interviewing' });
    expect(packet.requirements).toEqual([
      { requirement: 'TypeScript', supportingProfileUnitIds: ['unit-1'] },
      { requirement: 'distributed systems', supportingProfileUnitIds: [] },
    ]);
    expect(packet.gaps).toEqual([{ requirement: 'distributed systems', reason: 'no_confirmed_profile_unit' }]);
    expect(packet.likelyQuestions.find((question) => question.theme === 'Why Acme?')?.confidence).toBe('observed');
    expect(packet.likelyQuestions.find((question) => question.theme.includes('distributed systems'))?.confidence).toBe('inferred');
    expect(packet.simulationBrief.mode).toBe('asynchronous_video');
  });

  it('rehearses and coaches without producing a score or upgrading unsupported evidence', async () => {
    const packet = await intelligence.prepare(
      { personId: 'person-1', applicationId: 'application-1', opportunityId: 'opportunity-1', opportunityRevision: 4 },
    );
    const question = packet.likelyQuestions.find((entry) => entry.theme.includes('distributed systems'))!;
    const coaching = intelligence.coach('I am a strong engineer.', question, packet);

    expect(intelligence.rehearse(packet, 'mixed_panel').turns).not.toHaveLength(0);
    expect(coaching.unresolvedGaps).toEqual(['distributed systems']);
    expect(coaching.suggestions).toContain('Do not fill the unsupported requirement gap with an invented example or metric.');
    expect(coaching).not.toHaveProperty('score');
  });

  it('requires a factual observation in a debrief draft', () => {
    expect(() => createDebriefDraft({ kind: 'video', observations: ['  '], reflection: 'It went well.' })).toThrow(InterviewContextError);
    expect(createDebriefDraft({ kind: 'video', observations: ['A system-design question was asked.'], reflection: 'I want to explain the trade-off more clearly.' }))
      .toEqual({ kind: 'video', observations: ['A system-design question was asked.'], reflection: 'I want to explain the trade-off more clearly.' });
  });
});
