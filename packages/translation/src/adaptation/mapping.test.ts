/**
 * Person × world condition interpretation, as pure functions.
 *
 * Moved here from the former Intelligence partition with Opportunity's understanding: comparing what
 * a posting states against what the person has stated is contextual interpretation, and Adaptation
 * owns it (ADR 0031). The behaviour is unchanged, and these assertions exist to prove that.
 *
 * The invariant the whole file defends:
 *
 *     ConstraintConflict ≠ ApplicationBlock
 */

import { describe, expect, it } from 'vitest';

import type { StatedContext } from '@joby/identity';

import { arrangeOpportunity, arrangeUser, intersectContext } from './mapping';
import type { OpportunityUnderstandingView } from './ports';

const understanding = (
  conditions: Record<string, readonly string[]> = {},
  extra: Partial<OpportunityUnderstandingView> = {},
): OpportunityUnderstandingView => ({
  opportunityId: 'opp-1',
  revision: 1,
  role: 'Markets Placement',
  company: 'A Bank',
  conditions,
  ...extra,
});

const stated = (partial: Partial<StatedContext> = {}): StatedContext => partial as StatedContext;

const intersect = (
  opportunityConditions: Record<string, readonly string[]>,
  personStated: Partial<StatedContext>,
  extra: Partial<OpportunityUnderstandingView> = {},
) =>
  intersectContext(
    arrangeOpportunity(understanding(opportunityConditions, extra)),
    arrangeUser({ personId: 'p-1', identityRevision: 3, stated: stated(personStated) }),
  );

describe('arranging the opportunity', () => {
  it('fills absent lists but leaves absent role and company absent', () => {
    const arranged = arrangeOpportunity({ opportunityId: 'opp-1', revision: 2 });

    expect(arranged.requiredCapabilities).toEqual([]);
    expect(arranged.uncertainty).toEqual([]);
    // An empty string would read downstream as a stated blank rather than as "nobody said".
    expect('role' in arranged).toBe(false);
    expect('company' in arranged).toBe(false);
    expect(arranged.revision).toBe(2);
  });

  it('drops blank condition values rather than comparing whitespace', () => {
    expect(arrangeOpportunity(understanding({ location: ['  ', ''] })).conditions.location).toBeUndefined();
  });

  it('carries the posting\'s own uncertainty through verbatim', () => {
    const arranged = arrangeOpportunity(
      understanding({}, { uncertainty: ['Sponsorship policy is not stated'] }),
    );
    expect(arranged.uncertainty).toEqual(['Sponsorship policy is not stated']);
  });
});

describe('arranging the person', () => {
  it('reads conditions, notes, constraints and direction from Stated Context', () => {
    const user = arrangeUser({
      personId: 'p-1',
      identityRevision: 7,
      stated: stated({
        conditions: [{ kind: 'location', values: ['London'], note: 'family reasons' }],
        constraints: ['No relocation before September'],
        preferences: ['Small teams'],
        careerDirection: 'Quantitative research',
      } as never),
    });

    expect(user.conditions.location).toEqual(['London']);
    expect(user.notes.location).toBe('family reasons');
    expect(user.otherConstraints).toEqual(['No relocation before September']);
    expect(user.preferences).toEqual(['Small teams']);
    expect(user.careerDirection).toBe('Quantitative research');
    expect(user.identityRevision).toBe(7);
  });

  it('leaves an unstated direction absent rather than blank', () => {
    const user = arrangeUser({ personId: 'p-1', identityRevision: 1, stated: stated({}) });
    expect('careerDirection' in user).toBe(false);
    expect(user.conditions).toEqual({});
  });
});

describe('the four outcomes', () => {
  it('aligns when both state it and something matches', () => {
    const result = intersect(
      { location: ['London'] },
      { conditions: [{ kind: 'location', values: ['London'] }] } as never,
    );

    expect(result.aligned.map((c) => c.kind)).toEqual(['location']);
    expect(result.aligned[0]!.summary).toBe('Location: London.');
  });

  it('conflicts when both state it and nothing matches, showing both sides', () => {
    const result = intersect(
      { location: ['Frankfurt'] },
      { conditions: [{ kind: 'location', values: ['London'] }] } as never,
    );

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.opportunity).toEqual(['Frankfurt']);
    expect(result.conflicts[0]!.user).toEqual(['London']);
    expect(result.conflicts[0]!.summary).toContain('the posting says Frankfurt; you have said London');
  });

  it('is uncertain when the person stated a condition and the posting did not answer it', () => {
    // The actionable unknown: something they care about that nobody has told them.
    const result = intersect({}, { conditions: [{ kind: 'sponsorship', values: ['Required'] }] } as never);

    expect(result.uncertain.map((c) => c.kind)).toEqual(['sponsorship']);
    expect(result.uncertain[0]!.summary).toContain('the posting does not state it');
  });

  it('is neutral when the posting states something the person has no view on', () => {
    // Their silence is information about the role, not a requirement invented for them.
    const result = intersect({ duration: ['12 months'] }, {});

    expect(result.neutral.map((c) => c.kind)).toEqual(['duration']);
    expect(result.conflicts).toEqual([]);
  });

  it('keeps the two silences apart', () => {
    const result = intersect(
      { duration: ['12 months'] },
      { conditions: [{ kind: 'sponsorship', values: ['Required'] }] } as never,
    );

    // Merging these would either bury the question worth asking, or make every unmentioned detail
    // look like a problem.
    expect(result.neutral.map((c) => c.kind)).toEqual(['duration']);
    expect(result.uncertain.map((c) => c.kind)).toEqual(['sponsorship']);
  });

  it('omits kinds neither side mentioned', () => {
    const result = intersect({}, {});
    const all = [...result.aligned, ...result.conflicts, ...result.uncertain, ...result.neutral];
    expect(all).toEqual([]);
  });
});

describe('how matching works, and does not', () => {
  it('matches on normalised text, ignoring case and spacing', () => {
    const result = intersect(
      { work_arrangement: ['  HYBRID  '] },
      { conditions: [{ kind: 'work_arrangement', values: ['hybrid'] }] } as never,
    );
    expect(result.aligned).toHaveLength(1);
  });

  it('does not let a near-miss pass as a match', () => {
    // "Greater London" does not silently satisfy "London": a wrong match is invisible to the person
    // it misleads, so it stays a conflict.
    const result = intersect(
      { location: ['Greater London'] },
      { conditions: [{ kind: 'location', values: ['London'] }] } as never,
    );
    expect(result.conflicts).toHaveLength(1);
    expect(result.aligned).toEqual([]);
  });

  it('aligns when any one stated value matches', () => {
    const result = intersect(
      { location: ['Leeds', 'London'] },
      { conditions: [{ kind: 'location', values: ['London', 'Bristol'] }] } as never,
    );
    expect(result.aligned[0]!.summary).toBe('Location: London.');
  });

  it("carries the person's note on a condition through to the comparison", () => {
    const result = intersect(
      { location: ['Frankfurt'] },
      { conditions: [{ kind: 'location', values: ['London'], note: 'family reasons' }] } as never,
    );
    expect(result.conflicts[0]!.note).toBe('family reasons');
  });
});

describe('what the intersection refuses to do', () => {
  it('never blocks an application, whatever it found', () => {
    const result = intersect(
      { location: ['Frankfurt'], sponsorship: ['Not offered'] },
      {
        conditions: [
          { kind: 'location', values: ['London'] },
          { kind: 'sponsorship', values: ['Required'] },
        ],
      } as never,
    );

    // Two hard conflicts, and the decision to pursue still belongs entirely to the person.
    expect(result.conflicts).toHaveLength(2);
    expect(result.blocksApplication).toBe(false);
  });

  it('surfaces free-text constraints beside the comparison without comparing them', () => {
    const result = intersect({ location: ['London'] }, {
      constraints: ['Cannot start before September'],
    } as never);

    expect(result.otherConstraints).toEqual(['Cannot start before September']);
    const compared = [...result.aligned, ...result.conflicts, ...result.uncertain, ...result.neutral];
    expect(compared.every((c) => c.kind !== ('Cannot start before September' as never))).toBe(true);
  });

  it("keeps the posting's own uncertainty beside the comparisons rather than folded into a kind", () => {
    const result = intersect({}, {}, { uncertainty: ['Sponsorship policy is not stated'] });
    expect(result.postingUncertainty).toEqual(['Sponsorship policy is not stated']);
  });

  it('produces no score, rank or verdict', () => {
    const result = intersect({ location: ['London'] }, {});
    expect(Object.keys(result).sort()).toEqual([
      'aligned',
      'blocksApplication',
      'conflicts',
      'neutral',
      'otherConstraints',
      'postingUncertainty',
      'uncertain',
    ]);
  });
});
