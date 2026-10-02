/**
 * Router — selecting a starting prior, and refusing to do more than that.
 *
 * Most of these exist to fail if Router grows into something else: a fit score, a recommendation to
 * apply, a lens that filters evidence, or a learned prior that outvotes what the posting says.
 */

import { describe, expect, it } from 'vitest';

import {
  createRouter,
  OpportunityNotRoutableError,
  type RoutableOpportunity,
  type RoutableRepresentation,
  type RouterPriorSource,
} from './index';

const lens = (id: string, name: string, capabilities: readonly string[]): RoutableRepresentation => ({
  representationId: id,
  name,
  exposedCapabilities: capabilities,
});

const opportunity = (
  required: readonly string[],
  preferred: readonly string[] = [],
): RoutableOpportunity => ({
  opportunityId: 'opp-1',
  revision: 2,
  requiredCapabilities: required,
  preferredCapabilities: preferred,
});

/** `null` means Opportunity has produced no understanding yet — distinct from "not supplied". */
function router(
  representations: readonly RoutableRepresentation[],
  situation: RoutableOpportunity | null = opportunity(['Python']),
  priors?: RouterPriorSource,
) {
  return createRouter({
    identity: { listRoutableRepresentations: async () => representations },
    opportunities: { getRoutableOpportunity: async () => situation ?? undefined },
    ...(priors ? { priors } : {}),
  });
}

const route = (r: ReturnType<typeof router>) =>
  r.recommendRepresentation({ personId: 'person-1', opportunityId: 'opp-1' });

describe('choosing a starting prior', () => {
  it('picks the lens that already speaks to most of what the posting asks', async () => {
    const result = await route(
      router(
        [lens('r1', 'Markets', ['Excel']), lens('r2', 'Software Engineering', ['Python', 'Go'])],
        opportunity(['Python', 'Go']),
      ),
    );

    expect(result.selected!.representationId).toBe('r2');
    expect(result.selected!.covers).toEqual(['Python', 'Go']);
    expect(result.reason).toBe("'Software Engineering' already speaks to Python, Go.");
  });

  it('counts preferred capabilities as well as required ones', async () => {
    const result = await route(
      router([lens('r1', 'A', ['Python']), lens('r2', 'B', ['Python', 'Rust'])], opportunity(['Python'], ['Rust'])),
    );
    expect(result.selected!.representationId).toBe('r2');
  });

  it('reports what the chosen lens does not cover, without disqualifying it', async () => {
    const result = await route(router([lens('r1', 'Markets', ['Excel'])], opportunity(['Python', 'Excel'])));

    // Uncovered asks are Adaptation's recovery problem, not a reason to withhold a starting point.
    expect(result.selected!.covers).toEqual(['Excel']);
    expect(result.selected!.uncovered).toEqual(['Python']);
  });

  it('matches on normalised capability equality and nothing cleverer', async () => {
    const result = await route(router([lens('r1', 'A', ['  PYTHON '])], opportunity(['python'])));
    expect(result.selected!.coverage).toBe(1);
  });

  it('does not treat a near-miss as a match', async () => {
    // A guess here sends someone into an application on the wrong footing.
    const result = await route(router([lens('r1', 'A', ['Python 3'])], opportunity(['Python'])));
    expect(result.selected!.coverage).toBe(0);
    expect(result.selected!.uncovered).toEqual(['Python']);
  });

  it('shows every lens it considered, best first', async () => {
    const result = await route(
      router([lens('r1', 'A', []), lens('r2', 'B', ['Python'])], opportunity(['Python'])),
    );
    expect(result.considered.map((c) => c.representationId)).toEqual(['r2', 'r1']);
  });

  it('keeps a stable order when nothing separates two lenses', async () => {
    const result = await route(
      router([lens('r1', 'A', ['Python']), lens('r2', 'B', ['Python'])], opportunity(['Python'])),
    );
    expect(result.considered.map((c) => c.representationId)).toEqual(['r1', 'r2']);
  });
});

describe('when there is nothing to route', () => {
  it('recommends nothing when the person keeps no representation, and says so plainly', async () => {
    // A normal case. Adaptation works with no prior at all — applying outside every lens someone
    // keeps is not a degraded path.
    const result = await route(router([]));

    expect(result.selected).toBeUndefined();
    expect(result.considered).toEqual([]);
    expect(result.reason).toContain('starts from your canonical history');
  });

  it('still offers a starting point when no lens speaks to the posting', async () => {
    const result = await route(router([lens('r1', 'Markets', ['Excel'])], opportunity(['Rust'])));

    expect(result.selected!.representationId).toBe('r1');
    expect(result.selected!.coverage).toBe(0);
    expect(result.reason).toContain('None of your representations speak to');
  });

  it('refuses to route an opportunity nobody has understood', async () => {
    await expect(route(router([lens('r1', 'A', [])], null))).rejects.toThrow(
      OpportunityNotRoutableError,
    );
  });
});

describe('learned priors are hints, not authority', () => {
  const favour = (id: string, weight: number): RouterPriorSource => ({
    weightsFor: async () => new Map([[id, weight]]),
  });

  it('applies no prior by default, and says none was applied', async () => {
    const result = await route(router([lens('r1', 'A', ['Python'])]));
    expect(result.priorsApplied).toBe(false);
    expect(result.selected!.priorWeight).toBe(0);
  });

  it('lets a prior break a tie between equally covering lenses', async () => {
    const result = await route(
      router([lens('r1', 'A', ['Python']), lens('r2', 'B', ['Python'])], opportunity(['Python']), favour('r2', 1)),
    );

    expect(result.selected!.representationId).toBe('r2');
    expect(result.priorsApplied).toBe(true);
  });

  it('does not let a prior promote a lens that covers the posting less', async () => {
    // A learned belief that overrules what the posting actually asks for is exactly the failure the
    // bounded influence exists to prevent.
    const result = await route(
      router(
        [lens('r1', 'Covers it', ['Python', 'Go']), lens('r2', 'Favoured', [])],
        opportunity(['Python', 'Go']),
        favour('r2', 1),
      ),
    );

    expect(result.selected!.representationId).toBe('r1');
  });
});

describe('what Router refuses to be', () => {
  it('produces no fit score, verdict or recommendation to apply', async () => {
    const result = await route(router([lens('r1', 'A', ['Python'])]));

    expect(Object.keys(result).sort()).toEqual([
      'considered',
      'opportunityId',
      'opportunityRevision',
      'personId',
      'priorsApplied',
      'reason',
      'selected',
    ]);
    const serialised = JSON.stringify(result).toLowerCase();
    for (const forbidden of ['fitscore', 'shouldapply', 'eligible', 'evaluation', 'policy']) {
      expect(serialised, forbidden).not.toContain(forbidden);
    }
  });

  it('records the opportunity revision it routed against, so the choice is reproducible', async () => {
    const result = await route(router([lens('r1', 'A', ['Python'])]));
    expect(result.opportunityRevision).toBe(2);
  });
});
