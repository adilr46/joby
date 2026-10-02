import { currentState, type ApplicationModule, type ApplicationRecord } from '@joby/application';
import type { Database } from '@joby/database';
import { cohortIdentity, cohortLadder, deriveSignals, SocialInputError, SocialNotFoundError, type Cohort, type CohortCandidate, type Signal } from './model';
import { SocialRepository } from './repository';

export interface SocialDependencies {
  db: Database;
  applications: Pick<ApplicationModule, 'getApplication' | 'listApplications'>;
  describeOpportunity: (id: string, revision: number) => Promise<{ company?: string; role?: string } | undefined>;
  /** Distinct other people with visible relevant signals, not registrations or clicks. */
  minimumFeedPeers?: number;
}
export interface FeedFilter { company?: string; milestone?: string }
type SourceCache = Map<string, ApplicationRecord | undefined>;

export class SocialService {
  private readonly repository: SocialRepository;
  private readonly minimumFeedPeers: number;
  constructor(private readonly dependencies: SocialDependencies) {
    this.repository = new SocialRepository(dependencies.db);
    this.minimumFeedPeers = dependencies.minimumFeedPeers ?? 5;
    if (!Number.isInteger(this.minimumFeedPeers) || this.minimumFeedPeers < 1) throw new SocialInputError('minimumFeedPeers must be a positive integer.');
  }
  memberships(personId: string) { return this.repository.memberships(personId); }
  async join(personId: string, cohort: Cohort) {
    const value = cohortIdentity(cohort);
    await this.repository.join(personId, value.id, value.cohort);
    return { ...value, audiences: cohortLadder(value.cohort) };
  }
  leave(personId: string, cohortId: string) { return this.repository.leave(personId, cohortId); }
  async audiences(personId: string) { return this.candidates(await this.repository.memberships(personId)); }
  async ownSignals(personId: string) {
    return (await this.dependencies.applications.listApplications(personId)).flatMap(deriveSignals);
  }
  async share(personId: string, applicationId: string, signalId: string, cohortId: string) {
    const record = await this.dependencies.applications.getApplication(applicationId);
    if (!record || record.application.personId !== personId || !deriveSignals(record).some(signal => signal.id === signalId)) throw new SocialNotFoundError('Signal not found.');
    await this.dependencies.db.transaction(async tx => {
      const repository = new SocialRepository(tx);
      const scope = await this.requireMembership(repository, personId, cohortId);
      await repository.share(personId, applicationId, signalId, cohortId, scope.sourceCohortId);
    });
  }
  hide(personId: string, signalId: string) { return this.repository.hide(personId, signalId); }

  /** Explicit cohort reads are also the authorization primitive for Link. */
  async feed(personId: string, cohortId: string, filter: FeedFilter = {}) {
    await this.requireMembership(this.repository, personId, cohortId);
    return this.projectFeed(personId, cohortId, filter, new Map());
  }

  /** Closest sufficiently populated relevant group across overlapping memberships. */
  async selectFeed(personId: string, filter: FeedFilter = {}) {
    const cache: SourceCache = new Map();
    const evaluated: { candidate: CohortCandidate; feed: Awaited<ReturnType<SocialService['projectFeed']>> }[] = [];
    for (const candidate of await this.audiences(personId)) {
      evaluated.push({ candidate, feed: await this.projectFeed(personId, candidate.id, filter, cache) });
    }
    const sufficient = evaluated.find(item => item.feed.participatingPeers >= this.minimumFeedPeers);
    const selected = sufficient ?? [...evaluated].reverse().find(item => item.feed.participatingPeers > 0) ?? evaluated[0];
    if (!selected) return { cohortId: undefined, signals: [], participatingPeers: 0,
      selection: { reason: 'no_memberships' as const, minimumPeers: this.minimumFeedPeers } };
    const signals = selected.feed.signals.map(signal => {
      // A signal may have a closer company/process reference group than the feed as a whole.
      const local = evaluated.find(item => item.feed.signals.some(peer => peer.id === signal.id) &&
        new Set(item.feed.signals.filter(peer => peer.personId !== personId && peer.milestone === signal.milestone &&
          (!signal.company || peer.company === signal.company)).map(peer => peer.personId)).size >= this.minimumFeedPeers);
      const reference = local ?? selected;
      const contextualSignal = reference.feed.signals.find(peer => peer.id === signal.id)!;
      return { ...signal, peerContext: { ...contextualSignal.peerContext, cohort: reference.candidate.cohort } };
    });
    return { ...selected.feed, signals, selection: {
      reason: sufficient ? 'sufficient_density' as const : 'sparse_relevant_fallback' as const,
      minimumPeers: this.minimumFeedPeers, cohort: selected.candidate.cohort, distance: selected.candidate.distance,
    } };
  }

  async link(personId: string, cohortId: string, signalId: string) {
    const signal = (await this.feed(personId, cohortId)).signals.find(item => item.id === signalId);
    if (!signal) throw new SocialNotFoundError('Signal not found.');
    if (signal.personId === personId) throw new SocialInputError('You cannot link your own signal.');
    await this.dependencies.db.transaction(async tx => {
      const repository = new SocialRepository(tx);
      const scope = await this.requireMembership(repository, personId, cohortId);
      if (!await repository.lockAudience(personId, scope.sourceCohortId, signalId, cohortId)) throw new SocialNotFoundError('Signal not found.');
      await repository.link(personId, signal.personId, signalId, cohortId);
    });
    return { linked: true };
  }
  unlink(personId: string, signalId: string) { return this.repository.unlink(personId, signalId); }

  async profile(personId: string, targetPersonId = personId) {
    if (targetPersonId !== personId) {
      const mine = new Set((await this.audiences(personId)).map(candidate => candidate.id));
      if (!(await this.audiences(targetPersonId)).some(candidate => mine.has(candidate.id))) throw new SocialNotFoundError('Profile not found.');
    }
    const cache: SourceCache = new Map();
    let linkCount = 0;
    for (const link of await this.repository.receivedLinks(targetPersonId)) {
      const record = await this.source(link.applicationId, cache);
      if (record?.application.personId === targetPersonId && deriveSignals(record).some(signal => signal.id === link.signalId)) linkCount++;
    }
    if (personId === targetPersonId) {
      const applications = await Promise.all((await this.dependencies.applications.listApplications(personId)).map(async record => ({
        applicationId: record.application.id, ...await this.description(record), stage: currentState(record),
        source: record.application.externalDetails ? 'user_reported' as const : 'joby' as const,
      })));
      return { personId: targetPersonId, linkCount, applications, signals: [] };
    }
    // Only the exact shared observations cross to peers, never the private current stage.
    const visible = new Map<string, Awaited<ReturnType<SocialService['projectFeed']>>['signals'][number]>();
    for (const audience of await this.audiences(personId)) {
      for (const signal of (await this.projectFeed(personId, audience.id, {}, cache)).signals) {
        if (signal.personId === targetPersonId) visible.set(signal.id, signal);
      }
    }
    return { personId: targetPersonId, linkCount, applications: [], signals: [...visible.values()] };
  }

  private async projectFeed(personId: string, cohortId: string, filter: FeedFilter, cache: SourceCache) {
    const shares = await this.repository.shares(cohortId);
    const linked = new Set(await this.repository.linkedSignals(personId, cohortId));
    const signals: (Signal & { company?: string; role?: string; linked: boolean; source: 'user_reported' | 'joby' })[] = [];
    for (const share of shares) {
      const record = await this.source(share.applicationId, cache);
      if (!record || record.application.personId !== share.personId) continue;
      const signal = deriveSignals(record).find(item => item.id === share.signalId);
      if (!signal) continue;
      const description = await this.description(record);
      if (filter.company && description?.company?.toLowerCase() !== filter.company.toLowerCase()) continue;
      if (filter.milestone && signal.milestone !== filter.milestone) continue;
      signals.push({ ...signal, ...description, linked: linked.has(signal.id), source: record.application.externalDetails ? 'user_reported' : 'joby' });
    }
    const contextualized = signals.map(signal => ({ ...signal, peerContext: {
      cohortId,
      peersSharingMilestone: new Set(signals.filter(peer => peer.milestone === signal.milestone).map(peer => peer.personId)).size,
      peersSharingCompanyProcess: new Set(signals.filter(peer => peer.company && peer.company === signal.company && peer.milestone === signal.milestone).map(peer => peer.personId)).size,
      basis: 'explicitly_shared' as const,
    } }));
    return { cohortId, signals: contextualized.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id)),
      participatingPeers: new Set(signals.filter(signal => signal.personId !== personId).map(signal => signal.personId)).size };
  }
  private async source(applicationId: string, cache: SourceCache) {
    if (!cache.has(applicationId)) cache.set(applicationId, await this.dependencies.applications.getApplication(applicationId));
    return cache.get(applicationId);
  }
  private async description(record: ApplicationRecord) {
    if (record.application.externalDetails) return record.application.externalDetails;
    const revision = record.opportunityState.opportunityRevision;
    return revision === null ? undefined : this.dependencies.describeOpportunity(record.application.opportunityId, revision);
  }
  private candidates(memberships: readonly { id: string; cohort: Cohort }[]): CohortCandidate[] {
    const candidates = memberships.flatMap(member => cohortLadder(member.cohort).map(candidate => ({ ...candidate, sourceCohortId: member.id })));
    const specificity = (c: Cohort) => c.university ? 0 : c.degree && c.recruitingCycle ? 1 : c.country ? 2 : 3;
    candidates.sort((a, b) => specificity(a.cohort) - specificity(b.cohort) || a.distance - b.distance || a.id.localeCompare(b.id));
    return candidates.filter((candidate, index) => candidates.findIndex(other => other.id === candidate.id) === index);
  }
  private async requireMembership(repository: SocialRepository, personId: string, cohortId: string) {
    const scope = this.candidates(await repository.memberships(personId)).find(candidate => candidate.id === cohortId);
    if (!scope) throw new SocialNotFoundError('Cohort not found.');
    return scope;
  }
}
