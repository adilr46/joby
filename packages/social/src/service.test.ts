import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationRecord } from '@joby/application';
import type { Database } from '@joby/database';
import { SocialRepository } from './repository';
import { SocialService } from './service';
import { cohortIdentity, cohortLadder, deriveSignals } from './model';

const cohort = { university: 'Bath', recruitingCycle: '2027' };
const cohortId = cohortIdentity(cohort).id;
const record: ApplicationRecord = {
  application: { id: 'app', personId: 'alice', opportunityId: 'opp', createdAt: '', updatedAt: '' },
  personState: { groundingProfileUnitIds: [], identityRevision: 1 },
  opportunityState: { opportunityId: 'opp', opportunityRevision: 7 }, representation: {}, adaptation: { draftIds: [] },
  interaction: { timeline: [], communications: [], interviewStages: [] },
  outcomes: [
    { id: 'o1', kind: 'offer', occurredAt: '2026-01-01', recordedAt: '', feedback: 'private' },
    { id: 'o2', kind: 'offer', occurredAt: '2026-01-02', recordedAt: '', feedback: 'private' },
  ],
};
afterEach(() => vi.restoreAllMocks());
function setup() {
  const getApplication = vi.fn(async () => record as ApplicationRecord | undefined);
  const describeOpportunity = vi.fn(async () => ({ company: 'Acme', role: 'Engineer' }));
  const service = new SocialService({ db: {} as Database,
    applications: { getApplication, listApplications: async () => [record] }, describeOpportunity });
  vi.spyOn(SocialRepository.prototype, 'memberships').mockResolvedValue([{ id: cohortId, cohort: { university: 'Bath', recruitingCycle: '2027' } }]);
  vi.spyOn(SocialRepository.prototype, 'linkedSignals').mockResolvedValue([]);
  const shares = vi.spyOn(SocialRepository.prototype, 'shares').mockResolvedValue(
    deriveSignals(record).map(signal => ({ signalId: signal.id, applicationId: 'app', personId: 'alice' })));
  return { service, getApplication, describeOpportunity, shares };
}
describe('Social read authorization and context', () => {
  it('deduplicates peers, reuses application reads, and resolves recorded Opportunity revision', async () => {
    const { service, getApplication, describeOpportunity } = setup();
    const feed = await service.feed('bob', cohortId);
    expect(feed.signals).toHaveLength(2);
    expect(feed.participatingPeers).toBe(1);
    expect(feed.signals[0]?.peerContext.peersSharingMilestone).toBe(1);
    expect(feed.signals[0]?.peerContext.peersSharingCompanyProcess).toBe(1);
    expect(getApplication).toHaveBeenCalledTimes(1);
    expect(describeOpportunity).toHaveBeenCalledWith('opp', 7);
    expect(JSON.stringify(feed)).not.toContain('private');
  });
  it('does not read source records for private applications or unauthorized cohorts', async () => {
    const { service, shares, getApplication } = setup();
    await expect(service.feed('bob', 'another-cohort')).rejects.toThrow('Cohort not found');
    expect(shares).not.toHaveBeenCalled();
    shares.mockResolvedValue([]);
    expect((await service.feed('bob', cohortId)).participatingPeers).toBe(0);
    expect(getApplication).not.toHaveBeenCalled();
  });
  it('withdraws stale source references on every feed and link write', async () => {
    const { service, getApplication } = setup();
    const signalId = deriveSignals(record)[0]!.id;
    getApplication.mockResolvedValue({ ...record, outcomes: [] });
    expect((await service.feed('bob', cohortId)).signals).toEqual([]);
    const link = vi.spyOn(SocialRepository.prototype, 'link');
    await expect(service.link('bob', cohortId, signalId)).rejects.toThrow('Signal not found');
    expect(link).not.toHaveBeenCalled();
    getApplication.mockResolvedValue(undefined);
    expect((await service.feed('bob', cohortId)).signals).toEqual([]);
  });
  it('rejects forged ownership and nonexistent source signals before any share write', async () => {
    const { service } = setup();
    const share = vi.spyOn(SocialRepository.prototype, 'share');
    await expect(service.share('bob', 'app', deriveSignals(record)[0]!.id, cohortId)).rejects.toThrow();
    await expect(service.share('alice', 'app', 'invented', cohortId)).rejects.toThrow();
    expect(share).not.toHaveBeenCalled();
  });
  it('counts multiple signals from the same linker and excludes corrected source facts', async () => {
    const { service, getApplication } = setup();
    vi.spyOn(SocialRepository.prototype, 'receivedLinks').mockResolvedValue(deriveSignals(record).map(signal => ({ personId: 'bob', signalId: signal.id, applicationId: 'app' })));
    expect((await service.profile('alice')).linkCount).toBe(2);
    getApplication.mockResolvedValue({ ...record, outcomes: [] });
    expect((await service.profile('alice')).linkCount).toBe(0);
  });
  it('shows manual labels on the owner profile but never leaks a newer private stage to peers', async () => {
    setup();
    const external: ApplicationRecord = { ...record,
      application: { ...record.application, externalDetails: { company: 'Manual Co', role: 'Intern' } },
      opportunityState: { opportunityId: 'external:request', opportunityRevision: null }, outcomes: [],
      interaction: { ...record.interaction, timeline: [
        { id: 'interview', stage: 'interviewing', occurredAt: '2026-01-01', recordedAt: '2026-01-01', recordedBy: 'alice' },
        { id: 'offer', stage: 'offer', occurredAt: '2026-02-01', recordedAt: '2026-02-01', recordedBy: 'alice' },
      ] } };
    const describeOpportunity = vi.fn(async () => undefined);
    const service = new SocialService({ db: {} as Database, describeOpportunity,
      applications: { getApplication: async () => external, listApplications: async () => [external] } });
    vi.spyOn(SocialRepository.prototype, 'receivedLinks').mockResolvedValue([]);
    vi.mocked(SocialRepository.prototype.shares).mockResolvedValue([{ signalId: 'app:timeline:interview', applicationId: 'app', personId: 'alice' }]);
    const own = await service.profile('alice');
    expect(own.applications[0]).toMatchObject({ company: 'Manual Co', role: 'Intern', stage: 'offer', source: 'user_reported' });
    const peer = await service.profile('bob', 'alice');
    expect(peer.applications).toEqual([]);
    expect(peer.signals).toHaveLength(1);
    expect(peer.signals[0]).toMatchObject({ company: 'Manual Co', role: 'Intern', milestone: 'interview' });
    expect(JSON.stringify(peer)).not.toContain('offer');
    expect(describeOpportunity).not.toHaveBeenCalled();
  });
});

describe('adaptive cohort feed', () => {
  const root = { university: 'Bath', degree: 'CS', country: 'UK', careerTrack: 'SWE', audience: 'students', recruitingCycle: '2027 internships' };
  const ladder = cohortLadder(root);
  function adaptive(populations: Record<string, number>) {
    const records = new Map<string, ApplicationRecord>();
    const membership = cohortIdentity(root);
    vi.spyOn(SocialRepository.prototype, 'memberships').mockResolvedValue([membership]);
    vi.spyOn(SocialRepository.prototype, 'linkedSignals').mockResolvedValue([]);
    vi.spyOn(SocialRepository.prototype, 'shares').mockImplementation(async id => {
      return Array.from({ length: populations[id] ?? 0 }, (_, index) => {
        const appId = `app-${index}`;
        const item = { ...record, application: { ...record.application, id: appId, personId: `peer-${index}` } };
        records.set(appId, item);
        return { signalId: deriveSignals(item)[0]!.id, applicationId: appId, personId: item.application.personId };
      });
    });
    return new SocialService({ db: {} as Database, minimumFeedPeers: 3,
      applications: { getApplication: async id => records.get(id), listApplications: async () => [] },
      describeOpportunity: async () => ({ company: 'Acme', role: 'Engineer' }) });
  }
  it('keeps rivalry local when the closest cohort is sufficiently populated', async () => {
    const service = adaptive(Object.fromEntries(ladder.map(candidate => [candidate.id, 3])));
    const feed = await service.selectFeed('viewer');
    expect(feed.cohortId).toBe(ladder[0]!.id);
    expect(feed.selection.reason).toBe('sufficient_density');
  });
  it('widens past sparse groups to the closest sufficiently populated adjacent group', async () => {
    const service = adaptive({ [ladder[0]!.id]: 1, [ladder[2]!.id]: 3, [ladder.at(-1)!.id]: 5 });
    const feed = await service.selectFeed('viewer');
    expect(feed.cohortId).toBe(ladder[2]!.id);
    expect(feed.signals[0]?.peerContext.cohortId).toBe(ladder[2]!.id);
  });
  it('keeps a sparse relevant fallback and returns empty for an unrelated company', async () => {
    const service = adaptive({ [ladder[0]!.id]: 1, [ladder.at(-1)!.id]: 2 });
    expect((await service.selectFeed('viewer')).cohortId).toBe(ladder.at(-1)!.id);
    const empty = await service.selectFeed('viewer', { company: 'Unrelated' });
    expect(empty.signals).toEqual([]);
    expect(empty.selection.reason).toBe('sparse_relevant_fallback');
  });
  it('supports overlapping memberships without letting a global membership outrank local density', async () => {
    const service = adaptive(Object.fromEntries(ladder.map(candidate => [candidate.id, 3])));
    vi.mocked(SocialRepository.prototype.memberships).mockResolvedValue([cohortIdentity({ careerTrack: 'SWE', audience: 'students' }), cohortIdentity(root)]);
    expect((await service.selectFeed('viewer')).cohortId).toBe(ladder[0]!.id);
  });
  it('does not invent a worldwide feed without memberships', async () => {
    const service = adaptive({});
    vi.mocked(SocialRepository.prototype.memberships).mockResolvedValue([]);
    expect(await service.selectFeed('viewer')).toMatchObject({ signals: [], selection: { reason: 'no_memberships' } });
  });
});

