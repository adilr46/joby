/**
 * Delta classification.
 *
 * These are the decisions that determine whether a second source **raises the resolution** of an
 * existing fact or **duplicates** it — and whether a disagreement is surfaced or quietly resolved.
 */

import { describe, expect, it } from 'vitest';

import { classifyAgainstState, normaliseLabel } from './delta';
import { extractFromRepository } from './github/repository-extractor';
import type {
  ActivityNode,
  ReconstructedState,
  ReconstructionProposalContent,
  StructureNode,
} from './model';

const SOURCE = 'source-2';

function state(overrides: Partial<ReconstructedState> = {}): ReconstructedState {
  return { structure: [], activities: [], relations: [], ...overrides };
}

function structure(overrides: Partial<StructureNode> = {}): StructureNode {
  return {
    id: 'node-s1',
    type: 'structure',
    kind: 'engagement',
    label: 'Rota scheduler',
    epistemicStatus: 'observed',
    revision: 1,
    ...overrides,
  };
}

function activity(overrides: Partial<ActivityNode> = {}): ActivityNode {
  return {
    id: 'node-a1',
    type: 'activity',
    label: 'Payments migration',
    contribution: 'Contributed to the payments migration',
    epistemicStatus: 'observed',
    revision: 1,
    ...overrides,
  };
}

function candidates(content: Partial<ReconstructionProposalContent>): ReconstructionProposalContent {
  return { structure: [], activities: [], relations: [], conflicts: [], ...content };
}

const source = (quote: string) => [{ sourceId: SOURCE, quote }];

describe('normaliseLabel', () => {
  it('normalises shape so a repository name matches the project it is', () => {
    // The real case: a CV project and the GitHub repository holding it.
    expect(normaliseLabel('rota-scheduler')).toBe(normaliseLabel('Rota Scheduler'));
    expect(normaliseLabel('my_project ')).toBe('my project');
  });

  it('does not normalise different things into each other', () => {
    expect(normaliseLabel('Payments migration')).not.toBe(normaliseLabel('Payments migration v2'));
  });
});

describe('classifyAgainstState', () => {
  it('classifies everything as new against an empty identity', () => {
    // The first reconstruction is the degenerate case of a delta, not a separate code path.
    const classified = classifyAgainstState(
      candidates({ structure: [{ id: 'c1', kind: 'engagement', label: 'Rota scheduler', epistemicStatus: 'observed', sources: source('Rota scheduler') }] }),
      state(),
    );

    expect(classified.structure[0]!.delta).toEqual({ classification: 'new' });
  });

  it('calls it enrichment when a component was absent', () => {
    const classified = classifyAgainstState(
      candidates({
        structure: [
          {
            id: 'c1',
            kind: 'engagement',
            label: 'rota-scheduler',
            startedAt: '2024-01-15',
            epistemicStatus: 'observed',
            sources: source('createdAt'),
          },
        ],
      }),
      state({ structure: [structure()] }),
    );

    const delta = classified.structure[0]!.delta!;
    expect(delta.classification).toBe('enrichment');
    // Matched despite the different spelling — this is what stops a second 'Rota scheduler' node.
    expect(delta.matchedId).toBe('node-s1');
    expect(delta.changes).toEqual([{ field: 'startedAt', proposed: '2024-01-15' }]);
  });

  it('calls it a conflict when a present value disagrees, and carries both sides', () => {
    const classified = classifyAgainstState(
      candidates({
        structure: [
          {
            id: 'c1',
            kind: 'engagement',
            label: 'Rota scheduler',
            startedAt: '2023',
            epistemicStatus: 'observed',
            sources: source('createdAt'),
          },
        ],
      }),
      state({ structure: [structure({ startedAt: '2024' })] }),
    );

    const delta = classified.structure[0]!.delta!;
    expect(delta.classification).toBe('conflict');
    // Both values survive to the reviewer. Nothing here picks the better-sounding one.
    expect(delta.changes).toEqual([{ field: 'startedAt', current: '2024', proposed: '2023' }]);
  });

  it('calls it a duplicate when the source adds nothing', () => {
    const classified = classifyAgainstState(
      candidates({
        structure: [
          { id: 'c1', kind: 'engagement', label: 'Rota scheduler', epistemicStatus: 'observed', sources: source('x') },
        ],
      }),
      state({ structure: [structure()] }),
    );

    expect(classified.structure[0]!.delta!.classification).toBe('duplicate');
  });

  it('enriches an activity whose consequence was missing, rather than proposing a near-twin', () => {
    const classified = classifyAgainstState(
      candidates({
        activities: [
          {
            id: 'c1',
            label: 'Payments migration',
            consequence: 'Settlement time fell by 40%',
            epistemicStatus: 'observed',
            sources: source('Settlement time fell by 40%'),
          },
        ],
      }),
      state({ activities: [activity()] }),
    );

    const delta = classified.activities[0]!.delta!;
    expect(delta.classification).toBe('enrichment');
    expect(delta.matchedId).toBe('node-a1');
    expect(delta.changes).toEqual([{ field: 'consequence', proposed: 'Settlement time fell by 40%' }]);
  });

  it('treats capability as additive, not contradictory', () => {
    const classified = classifyAgainstState(
      candidates({
        activities: [
          {
            id: 'c1',
            label: 'Payments migration',
            capability: ['TypeScript', 'Go'],
            epistemicStatus: 'inferred',
            sources: source('languages'),
          },
        ],
      }),
      state({ activities: [activity({ capability: ['TypeScript'] })] }),
    );

    const delta = classified.activities[0]!.delta!;
    expect(delta.classification).toBe('enrichment');
    // Only what is genuinely new: a second source naming a language already held adds nothing.
    expect(delta.changes).toEqual([{ field: 'capability', current: ['TypeScript'], proposed: ['Go'] }]);
  });

  it('conflicts when a contribution disagrees, even if a capability would be added', () => {
    const classified = classifyAgainstState(
      candidates({
        activities: [
          {
            id: 'c1',
            label: 'Payments migration',
            contribution: 'Led the payments migration',
            capability: ['Go'],
            epistemicStatus: 'observed',
            sources: source('Led the payments migration'),
          },
        ],
      }),
      state({ activities: [activity()] }),
    );

    // "Contributed to" becoming "Led" is the upgrade the whole system exists to prevent. It must
    // surface as a disagreement between sources, not quietly overwrite.
    expect(classified.activities[0]!.delta!.classification).toBe('conflict');
  });

  it('classifies an edge between two facts that already exist as a relation', () => {
    const classified = classifyAgainstState(
      candidates({
        structure: [
          { id: 'cs', kind: 'engagement', label: 'Rota scheduler', epistemicStatus: 'observed', sources: source('x') },
        ],
        activities: [
          { id: 'ca', label: 'Payments migration', contribution: 'Contributed to the payments migration', epistemicStatus: 'observed', sources: source('y') },
        ],
        relations: [
          { id: 'cr', kind: 'occurred_within', fromId: 'ca', toId: 'cs', epistemicStatus: 'observed', sources: source('z') },
        ],
      }),
      state({ structure: [structure()], activities: [activity()] }),
    );

    // Both endpoints are already canonical: only the connection is new.
    expect(classified.relations[0]!.delta).toEqual({ classification: 'relation' });
  });

  it('classifies an edge that already exists as a duplicate', () => {
    const classified = classifyAgainstState(
      candidates({
        structure: [
          { id: 'cs', kind: 'engagement', label: 'Rota scheduler', epistemicStatus: 'observed', sources: source('x') },
        ],
        activities: [
          { id: 'ca', label: 'Payments migration', contribution: 'Contributed to the payments migration', epistemicStatus: 'observed', sources: source('y') },
        ],
        relations: [
          { id: 'cr', kind: 'occurred_within', fromId: 'ca', toId: 'cs', epistemicStatus: 'observed', sources: source('z') },
        ],
      }),
      state({
        structure: [structure()],
        activities: [activity()],
        relations: [
          {
            id: 'rel-1',
            kind: 'occurred_within',
            fromNodeId: 'node-a1',
            toNodeId: 'node-s1',
            epistemicStatus: 'observed',
            revision: 1,
          },
        ],
      }),
    );

    expect(classified.relations[0]!.delta).toEqual({ classification: 'duplicate', matchedId: 'rel-1' });
  });

  it('leaves a near-miss as new rather than guessing a match', () => {
    const classified = classifyAgainstState(
      candidates({
        activities: [
          { id: 'c1', label: 'Payments migration v2', contribution: 'Something else', epistemicStatus: 'observed', sources: source('x') },
        ],
      }),
      state({ activities: [activity()] }),
    );

    // Merging two similar things without evidence rewrites someone's history. Surfacing a
    // near-duplicate the user can exclude is the recoverable failure.
    expect(classified.activities[0]!.delta).toEqual({ classification: 'new' });
  });
});

describe('extractFromRepository', () => {
  const repository = {
    fullName: 'octocat/rota-scheduler',
    name: 'rota-scheduler',
    description: 'Constraint solver for shift allocation',
    isPrivate: false,
    languages: ['TypeScript', 'SQL'],
    createdAt: '2024-01-15T10:00:00Z',
    pushedAt: '2024-06-01T10:00:00Z',
  };

  it('proposes the repository as an engagement, named to match the project it is', () => {
    const content = extractFromRepository(SOURCE, repository);
    const engagement = content.structure[0]!;

    expect(engagement.kind).toBe('engagement');
    expect(engagement.label).toBe('rota scheduler');
    expect(engagement.startedAt).toBe('2024-01-15');
    // A creation date is a start, never inflated into a range.
    expect(engagement.endedAt).toBeUndefined();
  });

  it('quotes the description rather than rewriting it, and invents no consequence', () => {
    const content = extractFromRepository(SOURCE, repository);
    const work = content.activities.find((a) => a.contribution)!;

    expect(work.contribution).toBe('Constraint solver for shift allocation');
    // Stars and forks describe a repository's reception, not an outcome the person produced.
    expect(work.consequence).toBeUndefined();
  });

  it('marks language-derived capability as inferred, with its limits stated', () => {
    const content = extractFromRepository(SOURCE, repository);
    const capability = content.activities.find((a) => a.capability)!;

    expect(capability.capability).toEqual(['TypeScript', 'SQL']);
    expect(capability.epistemicStatus).toBe('inferred');
    expect(capability.uncertainty).toMatch(/not how much of it this person wrote/);
  });

  it('records nothing about what was done when there is no description', () => {
    const content = extractFromRepository(SOURCE, { ...repository, description: undefined as never });

    expect(content.activities).toHaveLength(0);
    expect(content.structure).toHaveLength(1);
    expect(content.notes?.join(' ')).toMatch(/no description/);
  });

  it('notes that a private repository stays private', () => {
    const content = extractFromRepository(SOURCE, { ...repository, isPrivate: true });
    expect(content.notes?.join(' ')).toMatch(/stays private/);
  });
});
