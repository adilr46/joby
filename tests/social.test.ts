import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApplication, type ApplicationModule } from '@joby/application';
import { createSocial, type SocialModule } from '@joby/social';
import type { Database } from '@joby/database';
import { connectTestDatabase, hasDatabase, truncateApplication } from './support/database';

if (!hasDatabase) console.warn('[tests] SKIPPING social integration tests: DATABASE_URL is not set.');
describe.skipIf(!hasDatabase)('Social atop Application', () => {
  let db: Database;
  let applications: ApplicationModule;
  let social: SocialModule;
  beforeAll(async () => {
    db = await connectTestDatabase();
    applications = createApplication({ db });
    social = createSocial({ db, applications, describeOpportunity: async () => ({ company: 'Acme', role: 'Engineer' }) });
  });
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.query('TRUNCATE social_link, social_interaction, social_share, social_membership');
    await truncateApplication(db);
  });
  async function setup() {
    const cohort = { university: 'Bath', careerTrack: 'engineering', recruitingCycle: '2027' };
    const { id: cohortId } = await social.join('alice', cohort);
    await social.join('bob', cohort);
    const app = await applications.createApplication({ personId: 'alice', opportunityId: 'opp',
      personState: { groundingProfileUnitIds: [], identityRevision: 1 },
      opportunityState: { opportunityId: 'opp', opportunityRevision: 1 }, createdBy: 'alice' });
    const progressed = await applications.appendTimelineEntry({ applicationId: app.application.id, stage: 'interviewing', occurredAt: '2026-09-01', recordedBy: 'alice', note: 'private note' });
    const signal = (await social.ownSignals('alice'))[0]!;
    return { cohortId, signal, progressed };
  }
  it('defaults private, restricts sharing to owner and reads to cohort members', async () => {
    const { cohortId, signal } = await setup();
    expect((await social.feed('bob', cohortId)).signals).toEqual([]);
    await expect(social.share('bob', signal.applicationId, signal.id, cohortId)).rejects.toThrow();
    await social.share('alice', signal.applicationId, signal.id, cohortId);
    await social.share('alice', signal.applicationId, signal.id, cohortId);
    const feed = await social.feed('bob', cohortId);
    expect(feed.signals).toHaveLength(1);
    expect(feed.participatingPeers).toBe(1);
    expect(feed.signals[0]?.company).toBe('Acme');
    expect(JSON.stringify(feed)).not.toContain('private note');
    await expect(social.feed('outsider', cohortId)).rejects.toThrow();
    expect((await social.feed('bob', cohortId, { company: 'Elsewhere' })).signals).toEqual([]);
  });
  it('reflects Application corrections immediately, with no event synchronization', async () => {
    const { cohortId, signal, progressed } = await setup();
    await social.share('alice', signal.applicationId, signal.id, cohortId);
    await applications.appendTimelineEntry({ applicationId: signal.applicationId, stage: 'under_review', occurredAt: '2026-09-02', recordedBy: 'alice', supersedes: progressed.interaction.timeline[0]!.id });
    expect((await social.feed('bob', cohortId)).signals).toEqual([]);
    await expect(social.link('bob', cohortId, signal.id)).rejects.toThrow();
  });
  it('revokes shares on leaving, and rejoining does not restore consent', async () => {
    const { cohortId, signal } = await setup();
    await social.share('alice', signal.applicationId, signal.id, cohortId);
    await social.leave('alice', cohortId);
    expect((await social.feed('bob', cohortId)).signals).toEqual([]);
    await social.join('alice', { university: 'Bath', careerTrack: 'engineering', recruitingCycle: '2027' });
    expect((await social.feed('bob', cohortId)).signals).toEqual([]);
  });
  it('counts total signal links, deduplicates clicks across cohorts, and supports unlink/hide', async () => {
    const { cohortId, signal } = await setup();
    await social.share('alice', signal.applicationId, signal.id, cohortId);
    await expect(social.link('alice', cohortId, signal.id)).rejects.toThrow();
    await expect(social.link('outsider', cohortId, signal.id)).rejects.toThrow();
    await Promise.all([social.link('bob', cohortId, signal.id), social.link('bob', cohortId, signal.id)]);
    expect((await social.profile('alice')).linkCount).toBe(1);
    await applications.recordOutcome({ applicationId: signal.applicationId, kind: 'offer', occurredAt: '2026-09-03' });
    const second = (await social.ownSignals('alice')).find(item => item.id !== signal.id)!;
    await social.share('alice', second.applicationId, second.id, cohortId);
    await social.link('bob', cohortId, second.id);
    expect((await social.profile('bob', 'alice')).linkCount).toBe(2);
    const alternate = { university: 'Bath', recruitingCycle: '2027' };
    const { id: alternateId } = await social.join('alice', alternate);
    await social.join('bob', alternate);
    await social.share('alice', second.applicationId, second.id, alternateId);
    await social.link('bob', alternateId, second.id);
    expect((await social.profile('alice')).linkCount).toBe(2);
    expect((await social.feed('bob', alternateId)).signals[0]?.linked).toBe(true);
    await social.unlink('bob', signal.id);
    expect((await social.profile('alice')).linkCount).toBe(1);
    await social.hide('alice', second.id);
    expect((await social.profile('alice')).linkCount).toBe(0);
  });
  it('allows explicit broader sharing but never widens a local grant automatically', async () => {
    const { signal } = await setup();
    const root = { university: 'Bath', degree: 'CS', country: 'UK', careerTrack: 'SWE', audience: 'students', recruitingCycle: '2027 internships' };
    const joined = await social.join('alice', root);
    await social.join('bob', root);
    const broad = joined.audiences.at(-1)!;
    await social.share('alice', signal.applicationId, signal.id, joined.id);
    expect((await social.feed('bob', broad.id)).signals).toEqual([]);
    await social.share('alice', signal.applicationId, signal.id, broad.id);
    expect((await social.feed('bob', broad.id)).signals).toHaveLength(1);
    await social.leave('alice', joined.id);
    expect((await social.feed('bob', broad.id)).signals).toEqual([]);
  });
  it('imports external applications once, shows owner progress, and exposes only shared milestones to peers', async () => {
    const cohort = { university: 'Bath', recruitingCycle: '2027' };
    const { id: cohortId } = await social.join('alice', cohort);
    await social.join('bob', cohort);
    const input = { personId: 'alice', company: 'External Co', role: 'Intern', stage: 'interviewing' as const,
      occurredAt: '2026-01-01', requestId: '62ebd82c-4c8c-4503-91b5-4c7600102061' };
    const [first, retry] = await Promise.all([applications.recordExternalApplication(input), applications.recordExternalApplication(input)]);
    expect(first.application.id).toBe(retry.application.id);
    expect(first.interaction.timeline).toHaveLength(1);
    expect(first.personState.identityRevision).toBeNull();
    expect(first.opportunityState.opportunityRevision).toBeNull();
    expect(first.submitted).toBeUndefined();
    expect(first.outcomes).toEqual([]);
    expect((await social.profile('alice')).applications[0]).toMatchObject({ company: 'External Co', role: 'Intern', stage: 'interviewing' });
    expect((await social.profile('bob', 'alice')).signals).toEqual([]);
    const signal = (await social.ownSignals('alice'))[0]!;
    await social.share('alice', first.application.id, signal.id, cohortId);
    await applications.recordOwnedProgress({ personId: 'alice', applicationId: first.application.id, stage: 'offer', occurredAt: '2026-02-01' });
    const peer = await social.profile('bob', 'alice');
    expect(peer.applications).toEqual([]);
    expect(peer.signals).toHaveLength(1);
    expect(peer.signals[0]).toMatchObject({ company: 'External Co', role: 'Intern', milestone: 'interview', source: 'user_reported' });
    expect((await social.profile('alice')).applications[0]?.stage).toBe('offer');
    await expect(applications.recordOwnedProgress({ personId: 'bob', applicationId: first.application.id, stage: 'rejected' })).rejects.toThrow();
  });
});

