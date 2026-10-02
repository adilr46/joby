/**
 * The pure functions Application derives its two "computed" facts from — current stage and whether
 * a Representation choice was overridden. Both exist to be *derived*, never stored twice, so most of
 * what matters is that a correction genuinely replaces what it corrects.
 */

import { describe, expect, it } from 'vitest';

import {
  canonicalApplicationOutcome,
  classifyApplicationOutcome,
  deriveCurrentState,
  outcomeKindFor,
  representationOverridden,
  type TimelineEntry,
} from './model';

const entry = (partial: Partial<TimelineEntry> & Pick<TimelineEntry, 'id' | 'stage' | 'occurredAt'>): TimelineEntry => ({
  recordedAt: partial.occurredAt,
  recordedBy: 'user-1',
  ...partial,
});

describe('deriving current state from the timeline', () => {
  it('is undefined for an empty timeline', () => {
    expect(deriveCurrentState([])).toBeUndefined();
  });

  it('is the chronologically latest entry, not the last one appended', () => {
    // Entries may arrive out of order (a backfilled communication, a corrected date). Chronology
    // governs, not insertion order.
    const timeline = [
      entry({ id: 'e2', stage: 'interviewing', occurredAt: '2026-02-01' }),
      entry({ id: 'e1', stage: 'submitted', occurredAt: '2026-01-01' }),
    ];
    expect(deriveCurrentState(timeline)).toBe('interviewing');
  });

  it('excludes a superseded entry, so a correction genuinely replaces it', () => {
    const timeline = [
      entry({ id: 'e1', stage: 'rejected', occurredAt: '2026-01-01' }),
      entry({ id: 'e2', stage: 'interviewing', occurredAt: '2026-01-02', supersedes: 'e1' }),
    ];
    // The correction says "we were wrong, they are still interviewing" — the superseded belief
    // must not win merely because its date happens to be earliest or latest.
    expect(deriveCurrentState(timeline)).toBe('interviewing');
  });

  it('breaks a same-instant tie by which was recorded later', () => {
    const timeline = [
      entry({ id: 'e1', stage: 'submitted', occurredAt: '2026-01-01T00:00:00Z', recordedAt: '2026-01-01T00:00:00Z' }),
      entry({ id: 'e2', stage: 'under_review', occurredAt: '2026-01-01T00:00:00Z', recordedAt: '2026-01-02T00:00:00Z' }),
    ];
    expect(deriveCurrentState(timeline)).toBe('under_review');
  });

  it('never lets a superseded entry linger in the derived state, even across several corrections', () => {
    const timeline = [
      entry({ id: 'e1', stage: 'submitted', occurredAt: '2026-01-01' }),
      entry({ id: 'e2', stage: 'rejected', occurredAt: '2026-01-05', supersedes: 'e1' }),
      entry({ id: 'e3', stage: 'interviewing', occurredAt: '2026-01-03', supersedes: 'e2' }),
    ];
    expect(deriveCurrentState(timeline)).toBe('interviewing');
  });
});

describe('representationOverridden', () => {
  it('is false when nothing was recommended and nothing was selected', () => {
    expect(representationOverridden({})).toBe(false);
  });

  it('is false when the person kept no representation and none was recommended either', () => {
    expect(representationOverridden({ selectedRepresentationId: undefined })).toBe(false);
  });

  it('is false when the selected representation matches what was recommended', () => {
    expect(
      representationOverridden({
        recommendedRepresentationId: 'rep-1',
        selectedRepresentationId: 'rep-1',
      }),
    ).toBe(false);
  });

  it('is true when the person chose a different representation than Router recommended', () => {
    expect(
      representationOverridden({
        recommendedRepresentationId: 'rep-1',
        selectedRepresentationId: 'rep-2',
      }),
    ).toBe(true);
  });

  it('is false when only one side is known — nothing to compare an override against', () => {
    expect(representationOverridden({ recommendedRepresentationId: 'rep-1' })).toBe(false);
    expect(representationOverridden({ selectedRepresentationId: 'rep-2' })).toBe(false);
  });
});

describe('canonical application outcomes', () => {
  it('normalises every accepted career-ops spelling to one canonical meaning', () => {
    expect(canonicalApplicationOutcome('stage-reached')).toBe('interview_progress');
    expect(canonicalApplicationOutcome('interview')).toBe('interview_progress');
    expect(canonicalApplicationOutcome('offer')).toBe('offer_received');
    expect(canonicalApplicationOutcome('accepted')).toBe('hired');
    expect(canonicalApplicationOutcome('declined')).toBe('offer_declined');
    expect(canonicalApplicationOutcome('rejection')).toBe('rejected');
    expect(canonicalApplicationOutcome('ghosted')).toBe('no_response');
  });

  it('maps precise outcome meaning to the coarse world-response bucket', () => {
    expect(outcomeKindFor('interview_progress')).toBe('progressed');
    expect(outcomeKindFor('interview_only')).toBe('progressed');
    expect(outcomeKindFor('offer_received')).toBe('offer');
    expect(outcomeKindFor('hired')).toBe('offer');
    expect(outcomeKindFor('offer_declined')).toBe('withdrawn');
    expect(outcomeKindFor('rejected')).toBe('rejection');
    expect(outcomeKindFor('no_response')).toBe('no_response');
  });

  it('classifies progression separately from terminal state', () => {
    expect(classifyApplicationOutcome('interview_progress')).toEqual({
      reachedInterview: true,
      reachedOffer: false,
      terminal: false,
    });
    expect(classifyApplicationOutcome('offer_declined')).toMatchObject({
      reachedInterview: true,
      reachedOffer: true,
      terminal: true,
      terminalPolarity: 'neutral',
    });
    expect(classifyApplicationOutcome('no_response')).toMatchObject({
      reachedInterview: false,
      reachedOffer: false,
      terminal: true,
      terminalPolarity: 'negative',
    });
  });

  it('returns undefined for an unknown latest outcome instead of guessing', () => {
    expect(canonicalApplicationOutcome('withdrawn_by_employer')).toBeUndefined();
  });
});
