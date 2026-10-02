/**
 * Profile Units — `Context + Contribution + Capabilities + Consequence` (ADR 0031).
 *
 * The unit is *composed*, not stored, so most of what matters here is what composition refuses to
 * do: invent a missing component, promote a private source, or let a unit drift from the canonical
 * facts it is made of.
 */

import { describe, expect, it } from 'vitest';

import { composeProfileUnits, type ProfileUnitsInput } from './profile-unit';
import type {
  ActivityNode,
  ProvenanceRecord,
  RelationEdge,
  SourceVisibility,
  StructureNode,
} from './model';

const structure = (id: string, label: string, extra: Partial<StructureNode> = {}): StructureNode => ({
  id,
  type: 'structure',
  kind: 'organisation',
  label,
  epistemicStatus: 'observed',
  revision: 0,
  ...extra,
});

const activity = (id: string, label: string, extra: Partial<ActivityNode> = {}): ActivityNode => ({
  id,
  type: 'activity',
  label,
  epistemicStatus: 'observed',
  revision: 0,
  ...extra,
});

const within = (from: string, to: string): RelationEdge => ({
  id: `rel-${from}-${to}`,
  kind: 'occurred_within',
  fromNodeId: from,
  toNodeId: to,
  epistemicStatus: 'observed',
  revision: 0,
});

const fromSource = (subjectId: string, sourceId?: string): ProvenanceRecord =>
  ({
    id: `prov-${subjectId}`,
    subjectType: 'node',
    subjectId,
    origin: 'reconstruction',
    ...(sourceId ? { sourceId } : {}),
  }) as ProvenanceRecord;

function compose(input: {
  structure?: readonly StructureNode[];
  activities?: readonly ActivityNode[];
  relations?: readonly RelationEdge[];
  provenance?: readonly [string, readonly ProvenanceRecord[]][];
  sources?: readonly [string, SourceVisibility][];
}) {
  const full: ProfileUnitsInput = {
    personId: 'person-1',
    revision: 3,
    state: {
      structure: input.structure ?? [],
      activities: input.activities ?? [],
      relations: input.relations ?? [],
    },
    provenance: new Map(input.provenance ?? []),
    sourceVisibility: new Map(input.sources ?? []),
  };
  return composeProfileUnits(full);
}

describe('composing Profile Units', () => {
  it('composes one unit from an activity and the structure it occurred within', () => {
    const { units, revision, personId } = compose({
      structure: [structure('s1', 'Acme Trading', { startedAt: '2024', endedAt: '2025' })],
      activities: [
        activity('a1', 'Built a pricer', {
          contribution: 'Wrote the solver',
          capability: ['Python', 'Derivatives'],
          consequence: 'Cut pricing time by half',
        }),
      ],
      relations: [within('a1', 's1')],
    });

    expect(personId).toBe('person-1');
    expect(revision).toBe(3);
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({
      nodeId: 'a1',
      title: 'Built a pricer',
      context: { nodeId: 's1', label: 'Acme Trading', kind: 'organisation', startedAt: '2024', endedAt: '2025' },
      contribution: 'Wrote the solver',
      capabilities: ['Python', 'Derivatives'],
      consequence: 'Cut pricing time by half',
    });
  });

  it('treats a unit with no structural home as complete, not defective', () => {
    // A personal project nobody employed them to do is a whole unit.
    const { units } = compose({ activities: [activity('a1', 'Rota scheduler', { capability: ['Python'] })] });

    expect(units).toHaveLength(1);
    expect('context' in units[0]!).toBe(false);
    expect(units[0]!.capabilities).toEqual(['Python']);
  });

  it('leaves absent components absent rather than completing the shape', () => {
    // Any subset is valid. A contribution with no consequence stays that way — nothing here may
    // invite completion of a component the source never stated.
    const { units } = compose({ activities: [activity('a1', 'Helped on a migration', { contribution: 'Wrote tests' })] });

    expect('consequence' in units[0]!).toBe(false);
    expect(units[0]!.capabilities).toEqual([]);
    expect(units[0]!.contribution).toBe('Wrote tests');
  });

  it('never turns a structure into a unit of its own', () => {
    // A place is Context, not a professional unit. Emitting it as one would double-count it and
    // give Representations a second thing to position for the same fact.
    const { units } = compose({
      structure: [structure('s1', 'University of Bristol')],
      activities: [],
    });
    expect(units).toEqual([]);
  });

  it('is deterministic and follows canonical activity order', () => {
    const input = {
      activities: [activity('a1', 'First'), activity('a2', 'Second'), activity('a3', 'Third')],
    };
    expect(compose(input).units.map((u) => u.nodeId)).toEqual(['a1', 'a2', 'a3']);
    expect(compose(input)).toEqual(compose(input));
  });

  it('keeps the unit keyed on the activity node, so representation decisions still resolve', () => {
    // Representations store decisions against canonical node ids. If a unit had its own identity,
    // every existing decision would dangle.
    const { units } = compose({
      structure: [structure('s1', 'Acme')],
      activities: [activity('a1', 'Built a pricer')],
      relations: [within('a1', 's1')],
    });
    expect(units[0]!.nodeId).toBe('a1');
  });
});

describe('visibility survives being read as a unit', () => {
  it('is public only when every source behind the unit is public', () => {
    const { units } = compose({
      structure: [structure('s1', 'Acme')],
      activities: [activity('a1', 'Built a pricer')],
      relations: [within('a1', 's1')],
      provenance: [
        ['a1', [fromSource('a1', 'src-public')]],
        ['s1', [fromSource('s1', 'src-public')]],
      ],
      sources: [['src-public', 'public']],
    });
    expect(units[0]!.visibility).toBe('public');
  });

  it('is private when any source behind it is private', () => {
    // The safe direction. A private source must not become disclosable merely by being composed
    // into a unit differently from how the section view composes it.
    const { units } = compose({
      structure: [structure('s1', 'Acme')],
      activities: [activity('a1', 'Built a pricer')],
      relations: [within('a1', 's1')],
      provenance: [
        ['a1', [fromSource('a1', 'src-public')]],
        ['s1', [fromSource('s1', 'src-private')]],
      ],
      sources: [
        ['src-public', 'public'],
        ['src-private', 'private'],
      ],
    });
    expect(units[0]!.visibility).toBe('private');
  });

  it('is private when a fact has no provenance at all', () => {
    // A user-authored fact has no source; recording it is not saying they want it shared.
    const { units } = compose({ activities: [activity('a1', 'Built a pricer')] });
    expect(units[0]!.visibility).toBe('private');
  });

  it('is private when provenance names a source nothing is known about', () => {
    const { units } = compose({
      activities: [activity('a1', 'Built a pricer')],
      provenance: [['a1', [fromSource('a1', 'src-unknown')]]],
      sources: [],
    });
    expect(units[0]!.visibility).toBe('private');
  });
});
