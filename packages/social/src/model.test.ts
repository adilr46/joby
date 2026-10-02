import { describe, expect, it } from 'vitest';
import type { ApplicationRecord } from '@joby/application';
import { cohortIdentity, cohortLadder, deriveSignals } from './model';

const record: ApplicationRecord = {
  application: { id: 'a', personId: 'p', opportunityId: 'o', createdAt: '', updatedAt: '' },
  personState: { groundingProfileUnitIds: ['private'], identityRevision: 1 },
  opportunityState: { opportunityId: 'o', opportunityRevision: 1 },
  representation: {}, adaptation: { draftIds: [] },
  interaction: { timeline: [], interviewStages: [], communications: [] }, outcomes: [],
};
describe('social projection', () => {
  it('ignores drafts, submissions and private communication', () => {
    expect(deriveSignals({ ...record, submitted: { materials: [{ id: 'm', kind: 'cv', content: 'secret', editedFromSource: false }], submittedAt: '2026-01-01' } })).toEqual([]);
  });
  it('withdraws superseded facts and never exposes private notes', () => {
    const timeline = [
      { id: 't', stage: 'offer' as const, occurredAt: '2026-01-01', recordedAt: '', recordedBy: 'p', note: 'secret' },
      { id: 'correction', stage: 'under_review' as const, occurredAt: '2026-01-02', recordedAt: '', recordedBy: 'p', supersedes: 't' },
    ];
    const original = deriveSignals({ ...record, interaction: { ...record.interaction, timeline: timeline.slice(0, 1) } });
    expect(original[0]?.milestone).toBe('offer');
    expect(JSON.stringify(original)).not.toContain('secret');
    expect(deriveSignals({ ...record, interaction: { ...record.interaction, timeline } })).toEqual([]);
  });
  it('preserves meaningful offer-declined and hired semantics without publishing outcome notes', () => {
    const signals = deriveSignals({ ...record, outcomes: [
      { id: 'declined', kind: 'withdrawn', canonicalType: 'offer_declined', occurredAt: '2026-01-01', recordedAt: '', feedback: 'secret' },
      { id: 'hired', kind: 'offer', canonicalType: 'hired', occurredAt: '2026-02-01', recordedAt: '' },
    ] });
    expect(signals.map(signal => signal.milestone)).toEqual(['hired', 'offer']);
    expect(JSON.stringify(signals)).not.toContain('secret');
  });
  it('uses stable normalized cohorts and separates recruiting cycles', () => {
    const a = cohortIdentity({ university: ' Bath ', recruitingCycle: '2027' });
    expect(a.id).toBe(cohortIdentity({ recruitingCycle: '2027', university: 'bath' }).id);
    expect(a.id).not.toBe(cohortIdentity({ university: 'bath', recruitingCycle: '2028' }).id);
    expect(() => cohortIdentity({ recruitingCycle: '2027' })).toThrow();
  });
  it('widens through adjacent and broader relevant groups using supplied dimensions', () => {
    const scopes = cohortLadder({ university: 'Bath', degree: 'CS', careerTrack: 'SWE',
      country: 'UK', audience: 'students', recruitingCycle: '2027 internships' });
    expect(scopes.map(scope => scope.cohort)).toEqual([
      { university: 'bath', degree: 'cs', careerTrack: 'swe', recruitingCycle: '2027 internships', country: 'uk', audience: 'students' },
      { university: 'bath', degree: 'cs', recruitingCycle: '2027 internships' },
      { degree: 'cs', recruitingCycle: '2027 internships', country: 'uk' },
      { careerTrack: 'swe', country: 'uk', audience: 'students' },
      { careerTrack: 'swe', audience: 'students' },
    ]);
    expect(cohortLadder({ university: 'Bath', recruitingCycle: '2027' })).toHaveLength(1);
    expect(() => cohortIdentity({ audience: 'everyone' })).toThrow();
  });
});
