/**
 * Applying a lens: `E_t + Decisions_i -> V_i`.
 *
 * Unit tests, because the function is pure — which is the point. The properties that matter here
 * (nothing invented, nothing dropped, truth never replaced) are structural, so they can be checked
 * without a database and they fail loudly the moment someone makes the lens a filter.
 */

import { describe, expect, it } from 'vitest';

import type { PermanentIdentityView } from '../model';
import type { RepresentationDecision } from './model';
import { positionProjection } from './positioning';

const decision = (
  nodeId: string,
  fields: Partial<Omit<RepresentationDecision, 'id' | 'representationId' | 'nodeId'>> = {},
): RepresentationDecision => ({
  id: `d-${nodeId}`,
  representationId: 'rep-1',
  nodeId,
  included: true,
  decidedAt: '2026-08-15T00:00:00.000Z',
  decidedBy: 'user-1',
  ...fields,
});

const entry = (nodeId: string, title: string, extra: Record<string, unknown> = {}) => ({
  nodeId,
  title,
  epistemicStatus: 'observed' as const,
  visibility: 'private' as const,
  ...extra,
});

/** A placement student: a degree with a module, two projects, and one achievement. */
const VIEW: PermanentIdentityView = {
  personId: 'person-1',
  revision: 4,
  education: [
    entry('n-degree', 'BSc Computer Science', {
      activities: [entry('n-module', 'Stochastic processes coursework')],
    }),
  ],
  experience: [entry('n-role', 'Software Engineering Intern')],
  projects: [entry('n-solver', 'Rota scheduler'), entry('n-pricer', 'Options pricer')],
  skills: [{ capability: 'Python', evidencedBy: ['Options pricer'], visibility: 'private' }],
  achievements: [entry('n-solver', 'Cut rota preparation from hours to minutes')],
  evidence: [],
};

describe('applying a positioning lens', () => {
  it('leaves the canonical projection untouched when there are no decisions', () => {
    const positioned = positionProjection(VIEW, []);

    expect(positioned.every((item) => item.included)).toBe(true);
    expect(positioned.every((item) => item.priority === undefined)).toBe(true);
    // A lens with no decisions is neutral, not empty — and neutral is the default rather than a gap.
    expect(positioned.map((item) => item.nodeId)).toEqual([
      'n-role',
      'n-solver',
      'n-pricer',
      'n-degree',
      'n-module',
      'n-solver',
    ]);
  });

  it('ranks what the person ranked, and leaves the rest in canonical order behind it', () => {
    const positioned = positionProjection(VIEW, [
      decision('n-pricer', { priority: 0 }),
      decision('n-module', { priority: 1 }),
    ]);

    expect(positioned.slice(0, 2).map((item) => item.nodeId)).toEqual(['n-pricer', 'n-module']);
    // Unranked is not last-resort ordering — it is simply unranked, and stays canonical.
    expect(positioned.slice(2).map((item) => item.nodeId)).toEqual([
      'n-role',
      'n-solver',
      'n-degree',
      'n-solver',
    ]);
  });

  it('marks hidden evidence rather than dropping it, and sorts it last', () => {
    const positioned = positionProjection(VIEW, [decision('n-role', { included: false })]);

    const role = positioned.find((item) => item.nodeId === 'n-role')!;
    // The load-bearing assertion of this slice. Hiding is a positioning prior for one lens; it is
    // not an evidence boundary, and a later Adaptation must still be able to find this.
    expect(role).toBeDefined();
    expect(role.included).toBe(false);
    expect(positioned.at(-1)!.nodeId).toBe('n-role');
    expect(positioned.filter((item) => item.included)).toHaveLength(positioned.length - 1);
  });

  it('presents framing beside the canonical label, never instead of it', () => {
    const positioned = positionProjection(VIEW, [
      decision('n-pricer', { framing: 'Derivatives pricing under uncertainty' }),
    ]);

    const pricer = positioned.find((item) => item.nodeId === 'n-pricer')!;
    expect(pricer.title).toBe('Derivatives pricing under uncertainty');
    expect(pricer.framing).toBe('Derivatives pricing under uncertainty');
    // What Explicit State records travels with it, always. Wording reinterprets presentation; it
    // cannot obscure or replace the fact.
    expect(pricer.canonicalTitle).toBe('Options pricer');
  });

  it('carries emphasis without letting it become order', () => {
    const positioned = positionProjection(VIEW, [
      decision('n-solver', { emphasis: 'de_emphasised' }),
      decision('n-pricer', { emphasis: 'emphasised' }),
    ]);

    expect(positioned.find((item) => item.nodeId === 'n-pricer')!.emphasis).toBe('emphasised');
    expect(positioned.find((item) => item.nodeId === 'n-solver')!.emphasis).toBe('de_emphasised');
    // Emphasis and priority are different signals: de-emphasising something does not demote it, and
    // collapsing the two would make one of them unexpressible.
    expect(positioned.map((item) => item.nodeId).indexOf('n-solver')).toBeLessThan(
      positioned.map((item) => item.nodeId).lastIndexOf('n-pricer'),
    );
  });

  it('produces nothing that the canonical projection does not stand behind', () => {
    const positioned = positionProjection(VIEW, [
      decision('n-pricer', { framing: 'Derivatives pricing' }),
      // A decision about a fact that is not in the projection contributes nothing: the lens applies
      // decisions to evidence, it never introduces evidence.
      decision('n-ghost', { framing: 'Led a trading desk', priority: 0 }),
    ]);

    expect(positioned.map((item) => item.nodeId)).not.toContain('n-ghost');
    expect(JSON.stringify(positioned)).not.toContain('Led a trading desk');
  });

  it('positions a fact wherever it surfaces, from the one decision about it', () => {
    // `n-solver` is both a project and the achievement it produced.
    const positioned = positionProjection(VIEW, [
      decision('n-solver', { framing: 'Constraint solving for operational scheduling' }),
    ]);

    const both = positioned.filter((item) => item.nodeId === 'n-solver');
    expect(both.map((item) => item.section)).toEqual(['projects', 'achievements']);
    expect(both.every((item) => item.framing === 'Constraint solving for operational scheduling')).toBe(
      true,
    );
    // One decision, one fact — applied wherever the projection shows it.
    expect(both[0]!.canonicalTitle).not.toBe(both[1]!.canonicalTitle);
  });

  it('two lenses over one identity position it differently, from the same facts', () => {
    const markets = positionProjection(VIEW, [
      decision('n-pricer', { priority: 0, emphasis: 'emphasised' }),
      decision('n-module', { priority: 1 }),
      decision('n-role', { included: false }),
    ]);
    const engineering = positionProjection(VIEW, [
      decision('n-role', { priority: 0, emphasis: 'emphasised' }),
      decision('n-solver', { priority: 1 }),
      decision('n-module', { included: false }),
    ]);

    expect(markets.filter((i) => i.included)[0]!.nodeId).toBe('n-pricer');
    expect(engineering.filter((i) => i.included)[0]!.nodeId).toBe('n-role');

    // Substantially different positioning, identical underlying truth: every node in one appears in
    // the other, because neither lens can add to or subtract from Explicit State.
    expect(new Set(markets.map((i) => i.nodeId))).toEqual(new Set(engineering.map((i) => i.nodeId)));
  });
});
