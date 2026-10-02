/**
 * The resolved-evidence projection — Application's output toward PCI, and nothing else.
 *
 * The two things that must hold: nothing crosses until the application has actually resolved, and
 * the two signal families never blur into one undifferentiated observation.
 */

import { describe, expect, it } from 'vitest';

import type { ApplicationRecord } from './model';
import { isResolved, projectResolvedEvidence } from './resolved-evidence';

function record(overrides: Partial<ApplicationRecord> = {}): ApplicationRecord {
  return {
    application: {
      id: 'app-1',
      personId: 'person-1',
      opportunityId: 'opp-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    personState: { groundingProfileUnitIds: [], identityRevision: 1 },
    opportunityState: { opportunityId: 'opp-1', opportunityRevision: 1 },
    representation: {},
    adaptation: { draftIds: [] },
    interaction: { timeline: [], communications: [], interviewStages: [] },
    outcomes: [],
    ...overrides,
  };
}

describe('isResolved', () => {
  it('is false with no outcome recorded, whatever else has happened', () => {
    const inProgress = record({
      interaction: {
        timeline: [
          { id: 't1', stage: 'interviewing', occurredAt: '2026-01-05', recordedAt: '2026-01-05', recordedBy: 'u' },
        ],
        communications: [],
        interviewStages: [],
      },
    });
    expect(isResolved(inProgress)).toBe(false);
  });

  it('is true once at least one outcome exists', () => {
    const resolved = record({
      outcomes: [{ id: 'o1', kind: 'offer', occurredAt: '2026-02-01', recordedAt: '2026-02-01' }],
    });
    expect(isResolved(resolved)).toBe(true);
  });
});

describe('projecting resolved evidence', () => {
  it('returns undefined for an application still in progress', () => {
    // Nothing for PCI to learn from yet, and returning nothing is the honest answer.
    expect(projectResolvedEvidence(record())).toBeUndefined();
  });

  it('carries identifiers and the resolution time once resolved', () => {
    const resolved = record({
      representation: { selectedRepresentationId: 'rep-1' },
      outcomes: [{ id: 'o1', kind: 'rejection', canonicalType: 'rejected', occurredAt: '2026-02-01T00:00:00.000Z', recordedAt: '2026-02-01' }],
    });
    const evidence = projectResolvedEvidence(resolved)!;

    expect(evidence.applicationId).toBe('app-1');
    expect(evidence.personId).toBe('person-1');
    expect(evidence.opportunityId).toBe('opp-1');
    expect(evidence.representationId).toBe('rep-1');
    expect(evidence.resolvedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(evidence.progression).toEqual({
      reachedInterview: false,
      reachedOffer: false,
      terminal: true,
      terminalPolarity: 'negative',
    });
  });

  it('uses the latest outcome as the resolution time when several were recorded', () => {
    const resolved = record({
      outcomes: [
        { id: 'o1', kind: 'progressed', occurredAt: '2026-01-10T00:00:00.000Z', recordedAt: '2026-01-10' },
        { id: 'o2', kind: 'offer', occurredAt: '2026-02-01T00:00:00.000Z', recordedAt: '2026-02-01' },
      ],
    });
    expect(projectResolvedEvidence(resolved)!.resolvedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('lets the latest canonical outcome drive progression, while timeline preserves stages reached', () => {
    const resolved = record({
      interaction: {
        timeline: [
          { id: 't1', stage: 'interviewing', occurredAt: '2026-01-05', recordedAt: '2026-01-05', recordedBy: 'u' },
        ],
        communications: [],
        interviewStages: [],
      },
      outcomes: [
        { id: 'o1', kind: 'progressed', canonicalType: 'interview_progress', occurredAt: '2026-01-10', recordedAt: '2026-01-10' },
        { id: 'o2', kind: 'rejection', canonicalType: 'rejected', occurredAt: '2026-02-01', recordedAt: '2026-02-01' },
      ],
    });

    expect(projectResolvedEvidence(resolved)!.progression).toEqual({
      reachedInterview: true,
      reachedOffer: false,
      terminal: true,
      terminalPolarity: 'negative',
    });
  });

  it('carries verbatim feedback as world-response evidence', () => {
    const resolved = record({
      outcomes: [
        {
          id: 'o1',
          kind: 'rejection',
          canonicalType: 'rejected',
          occurredAt: '2026-02-01',
          recordedAt: '2026-02-01',
          feedback: 'We chose a candidate with more exchange connectivity experience.',
        },
      ],
    });

    const evidence = projectResolvedEvidence(resolved)!;
    expect(evidence.signals).toContainEqual({
      family: 'world_response',
      observation: 'Verbatim feedback: We chose a candidate with more exchange connectivity experience.',
      observedAt: '2026-02-01',
    });
  });

  it('keeps the two signal families distinct', () => {
    const resolved = record({
      representation: { recommendedRepresentationId: 'rep-1', selectedRepresentationId: 'rep-2' },
      interaction: {
        timeline: [
          { id: 't1', stage: 'interviewing', occurredAt: '2026-01-05', recordedAt: '2026-01-05', recordedBy: 'u' },
        ],
        communications: [],
        interviewStages: [
          {
            id: 'i1',
            kind: 'video',
            observations: ['45 minutes, two interviewers'],
            reflection: 'Felt it went well, especially the systems design part',
            recordedAt: '2026-01-06',
          },
        ],
      },
      outcomes: [{ id: 'o1', kind: 'offer', occurredAt: '2026-02-01', recordedAt: '2026-02-01' }],
    });

    const evidence = projectResolvedEvidence(resolved)!;
    const userSignals = evidence.signals.filter((s) => s.family === 'user_response');
    const worldSignals = evidence.signals.filter((s) => s.family === 'world_response');

    // user_response: the override, and the person's own reflection — never a system-generated score.
    expect(userSignals.some((s) => s.observation.includes('rep-2'))).toBe(true);
    expect(userSignals.some((s) => s.observation.includes('systems design'))).toBe(true);

    // world_response: the timeline stage reached and the outcome — facts about the world, not the person.
    expect(worldSignals.some((s) => s.observation.includes('interviewing'))).toBe(true);
    expect(worldSignals.some((s) => s.observation.includes('offer'))).toBe(true);

    // Nothing appears in both.
    expect(userSignals.every((s) => !worldSignals.includes(s))).toBe(true);
  });

  it('says nothing about a representation override when only one side is known', () => {
    const resolved = record({
      representation: { selectedRepresentationId: 'rep-2' },
      outcomes: [{ id: 'o1', kind: 'offer', occurredAt: '2026-02-01', recordedAt: '2026-02-01' }],
    });
    const evidence = projectResolvedEvidence(resolved)!;
    expect(evidence.signals.some((s) => s.observation.includes('recommended'))).toBe(false);
  });

  it('produces no signal at all from an interview stage with no reflection', () => {
    // An observation with no reflection is a fact about the stage, not a user-response signal —
    // there is nothing here to say about the person's own account, because they gave none.
    const resolved = record({
      interaction: {
        timeline: [],
        communications: [],
        interviewStages: [
          { id: 'i1', kind: 'phone', observations: ['15 minute screen'], recordedAt: '2026-01-04' },
        ],
      },
      outcomes: [{ id: 'o1', kind: 'progressed', occurredAt: '2026-02-01', recordedAt: '2026-02-01' }],
    });
    const evidence = projectResolvedEvidence(resolved)!;
    expect(evidence.signals.filter((s) => s.family === 'user_response')).toEqual([]);
  });

  it('excludes mechanical execution detail because there is no field for it to occupy', () => {
    // Application never stored a retry, selector or captcha in the first place, so the projection
    // has nothing of that shape to filter — it is structurally excluded, not merely undesired.
    const resolved = record({
      outcomes: [{ id: 'o1', kind: 'offer', occurredAt: '2026-02-01', recordedAt: '2026-02-01' }],
    });
    const evidence = projectResolvedEvidence(resolved)!;
    const serialised = JSON.stringify(evidence).toLowerCase();
    for (const mechanical of ['retry', 'selector', 'captcha', 'httpstatus']) {
      expect(serialised, mechanical).not.toContain(mechanical);
    }
  });
});
