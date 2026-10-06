/**
 * PCI's contract, and the invariants that must survive every stage of its implementation.
 *
 * There is no learning yet. These assertions are about the shape of the authority — that an empty
 * prior is an honest answer rather than a gap, and that the interface offers no way to write
 * anything upstream.
 */

import { describe, expect, it } from 'vitest';

import { NoLearnedPci, SlowLearningPci, type CareerObservation, type ResolvedApplicationEvidence } from './index';

const evidence: ResolvedApplicationEvidence = {
  applicationId: 'app-1',
  personId: 'person-1',
  opportunityId: 'opp-1',
  representationId: 'rep-1',
  resolvedAt: '2026-01-01T00:00:00.000Z',
  progression: {
    reachedInterview: true,
    reachedOffer: false,
    terminal: false,
  },
  signals: [
    { family: 'user_response', observation: 'Rewrote the opening line', observedAt: '2026-01-01T00:00:00.000Z' },
    { family: 'world_response', observation: 'Progressed to interview', observedAt: '2026-01-02T00:00:00.000Z' },
  ],
};

describe('the current model has learned nothing, and says so', () => {
  const pci = new NoLearnedPci();

  it('returns empty priors with zero support rather than inventing a starting belief', async () => {
    // At the Baseline there is almost nothing to learn from, and that is correct. A plausible
    // default here would be a learned belief nobody chose, applied to someone's career.
    const person = await pci.personSidePrior('person-1');
    const context = await pci.contextSidePrior({ personId: 'person-1', opportunityId: 'opp-1' });
    const routing = await pci.routingPrior({
      personId: 'person-1',
      opportunityId: 'opp-1',
      representationIds: ['rep-1'],
    });

    expect(person).toEqual({
      personId: 'person-1',
      observations: [],
      supportingApplications: 0,
      sharedSupport: 0,
      basis: 'personal',
    });
    expect(context.observations).toEqual([]);
    expect(context.supportingApplications).toBe(0);
    expect(context.sharedSupport).toBe(0);
    expect(context.basis).toBe('personal');
    expect(routing.weights.size).toBe(0);
  });

  it('accepts resolved evidence without retaining a second copy of it', async () => {
    // Application is the durable record. Storing evidence here before the model that would use it
    // exists is persistence ahead of a decision.
    await expect(pci.observe(evidence)).resolves.toBeUndefined();
    expect((await pci.personSidePrior('person-1')).supportingApplications).toBe(0);
  });

  it('is idempotent: observing the same application twice changes nothing', async () => {
    await pci.observe(evidence);
    await pci.observe(evidence);
    expect((await pci.personSidePrior('person-1')).supportingApplications).toBe(0);
  });
});

describe('the two signal families stay distinct', () => {
  it('keeps user response and world response separately typed', () => {
    // `user preference != external effectiveness`. A shared shape with a generic handler is how
    // "you liked this" and "this worked" become one undifferentiated signal.
    const families = evidence.signals.map((signal) => signal.family).sort();
    expect(families).toEqual(['user_response', 'world_response']);
  });
});

describe('what PCI cannot do', () => {
  it('offers no capability that writes an upstream authority', () => {
    const surface = Object.getOwnPropertyNames(NoLearnedPci.prototype).filter((k) => k !== 'constructor');

    expect(surface.sort()).toEqual([
      'contextSidePrior',
      'observe',
      'personSidePrior',
      'routingPrior',
    ]);
    // Priors out, resolved evidence in. Nothing that could rewrite Identity, Opportunity,
    // Adaptation or a historical Application.
    for (const forbidden of ['write', 'update', 'apply', 'mutate', 'confirm']) {
      expect(surface.some((k) => k.toLowerCase().includes(forbidden)), forbidden).toBe(false);
    }
  });
});

describe('prior basis is always declared so consumers can present priors honestly', () => {
  it('basis is present on person-side priors', async () => {
    // A prior with basis: "shared" must never be presented as personal insight (ADR 0040, JOBY_MEMORY §7).
    // NoLearnedPci has no shared model yet, so it returns basis: "personal" with zero support —
    // the honest answer when nothing has been learned from either layer.
    const pci = new NoLearnedPci();
    const person = await pci.personSidePrior('person-1');
    expect(person.basis).toBeDefined();
    expect(['personal', 'shared', 'both']).toContain(person.basis);
  });

  it('basis is present on context-side priors', async () => {
    const pci = new NoLearnedPci();
    const context = await pci.contextSidePrior({ personId: 'person-1', opportunityId: 'opp-1' });
    expect(context.basis).toBeDefined();
    expect(['personal', 'shared', 'both']).toContain(context.basis);
  });
});

describe('the slow learning PCI implementation', () => {
  const observation: CareerObservation = {
    observationId: 'obs-1',
    personId: 'person-1',
    personStateRef: 'identity-rev-1',
    opportunityId: 'opp-1',
    opportunitySnapshot: 'opp-rev-1',
    evaluationSnapshot: 'eval-1',
    decision: 'chose to apply',
    representationTrack: 'SWE',
    representationUsed: 'rep-1',
    applicationTrajectory: ['submitted', 'interviewing'],
    worldOutcome: 'progressed to interview',
    feedback: ['Strong technical project work'],
    inferredExplanation: 'Interview progression is useful but not complete causal proof.',
    attributionConfidence: 0.6,
    evidenceStrength: 'moderate',
  };

  it('turns one resolved career observation into small distinct PCI signal updates', async () => {
    const pci = new SlowLearningPci();
    await pci.observeCareerObservation!(observation);
    await pci.observeCareerObservation!(observation);

    const state = pci.state();
    expect(state.evidenceCounts.get('preference')).toBe(1);
    expect(state.evidenceCounts.get('accessibility')).toBe(1);
    expect(state.evidenceCounts.get('calibration')).toBe(1);
    expect(state.byRepresentationTrack.get('SWE')!.confidence).toBeGreaterThan(0);
    expect(state.byRepresentationTrack.get('SWE')!.confidence).toBeLessThan(0.2);
  });

  it('exposes basis and sharedSupport on priors after personal evidence is observed', async () => {
    const pci = new SlowLearningPci();
    await pci.observeCareerObservation!(observation);

    const person = await pci.personSidePrior('person-1');
    // SlowLearningPci has no shared layer yet, so sharedSupport is 0 and basis is personal.
    expect(person.sharedSupport).toBe(0);
    expect(person.basis).toBe('personal');
    expect(person.supportingApplications).toBeGreaterThan(0);

    const context = await pci.contextSidePrior({ personId: 'person-1', opportunityId: 'opp-1' });
    expect(context.sharedSupport).toBe(0);
    expect(context.basis).toBe('personal');
  });
});
