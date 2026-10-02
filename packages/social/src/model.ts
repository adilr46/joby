import { createHash } from 'node:crypto';
import { classifyApplicationOutcome, classifyOutcomeKind, type ApplicationRecord } from '@joby/application';

export class SocialInputError extends Error {}
export class SocialNotFoundError extends Error {}

/** Self-declared peer grouping, not a verified education claim or an Identity update. */
export interface Cohort {
  university?: string;
  degree?: string;
  careerTrack?: string;
  recruitingCycle?: string;
  country?: string;
  audience?: string;
}
export function cohortIdentity(input: Cohort): { id: string; cohort: Cohort } {
  const cohort: Record<string, string> = {};
  for (const key of ['university', 'degree', 'careerTrack', 'recruitingCycle', 'country', 'audience'] as const) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !value.trim() || value.length > 160) throw new SocialInputError('Invalid cohort field.');
    cohort[key] = value.trim().normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
  }
  if (!(cohort.university || cohort.degree || cohort.careerTrack) ||
      !(cohort.recruitingCycle || (cohort.careerTrack && cohort.audience))) {
    throw new SocialInputError('A peer grouping with a recruiting cycle, or a career track with an audience, is required.');
  }
  return { id: createHash('sha256').update(JSON.stringify(cohort)).digest('hex'), cohort: cohort as unknown as Cohort };
}

export interface Signal {
  id: string;
  applicationId: string;
  personId: string;
  opportunityId: string;
  milestone: 'screening' | 'interview' | 'offer' | 'hired';
  occurredAt: string;
}

/** A read projection only. Private notes, materials, reflections and feedback never cross. */
export function deriveSignals(record: ApplicationRecord): Signal[] {
  const signals: Signal[] = [];
  const add = (source: string, milestone: Signal['milestone'], occurredAt: string) => signals.push({
    id: `${record.application.id}:${source}`, applicationId: record.application.id,
    personId: record.application.personId, opportunityId: record.application.opportunityId, milestone, occurredAt,
  });
  const superseded = new Set(record.interaction.timeline.map(entry => entry.supersedes));
  for (const entry of record.interaction.timeline) {
    if (superseded.has(entry.id)) continue;
    const milestone = entry.stage === 'interviewing' ? 'interview' : entry.stage;
    if (milestone === 'screening' || milestone === 'interview' || milestone === 'offer') add(`timeline:${entry.id}`, milestone, entry.occurredAt);
  }
  for (const stage of record.interaction.interviewStages) {
    if (stage.occurredAt) add(`interview:${stage.id}`, 'interview', stage.occurredAt);
  }
  for (const outcome of record.outcomes) {
    const progress = outcome.canonicalType ? classifyApplicationOutcome(outcome.canonicalType) : classifyOutcomeKind(outcome.kind);
    if (outcome.canonicalType === 'hired') add(`outcome:${outcome.id}`, 'hired', outcome.occurredAt);
    else if (progress.reachedOffer) add(`outcome:${outcome.id}`, 'offer', outcome.occurredAt);
    else if (progress.reachedInterview) add(`outcome:${outcome.id}`, 'interview', outcome.occurredAt);
  }
  return signals.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id));
}

export interface CohortCandidate {
  id: string;
  cohort: Cohort;
  distance: number;
  sourceCohortId: string;
}

/** Widen only along supplied relevant dimensions; never invent geography or fall back to everyone. */
export function cohortLadder(input: Cohort): CohortCandidate[] {
  const root = cohortIdentity(input);
  const c = root.cohort;
  const options: Cohort[] = [c];
  if (c.university && c.degree && c.recruitingCycle) {
    options.push({ university: c.university, degree: c.degree, recruitingCycle: c.recruitingCycle });
  }
  if (c.country && c.degree && c.recruitingCycle) {
    options.push({ country: c.country, degree: c.degree, recruitingCycle: c.recruitingCycle });
  }
  if (c.country && c.careerTrack && c.audience) {
    options.push({ country: c.country, careerTrack: c.careerTrack, audience: c.audience });
  }
  if (c.careerTrack && c.audience) options.push({ careerTrack: c.careerTrack, audience: c.audience });
  const seen = new Set<string>();
  return options.map((cohort, distance) => ({ ...cohortIdentity(cohort), distance, sourceCohortId: root.id }))
    .filter(candidate => {
      if (seen.has(candidate.id)) return false;
      seen.add(candidate.id);
      return true;
    });
}
