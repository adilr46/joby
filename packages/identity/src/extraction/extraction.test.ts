/**
 * Extraction unit tests.
 *
 * These assert *doctrine*, not shapes: that absence survives, that an unciteable proposal is
 * rejected, that the relation vocabulary cannot be widened by a model, and that the deterministic
 * extractor does not upgrade what it reads.
 */

import { describe, expect, it } from 'vitest';

import { DeterministicCvExtractor } from './deterministic-extractor';
import { ExtractionError } from './port';
import { parseProposalContent } from './validate';

const SOURCE_ID = 'source-1';

function activity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    label: 'Built a thing',
    contribution: 'Built a thing',
    epistemicStatus: 'observed',
    sources: [{ quote: 'Built a thing' }],
    ...overrides,
  };
}

describe('parseProposalContent', () => {
  it('preserves a sparse activity instead of completing it', () => {
    const parsed = parseProposalContent(
      { activities: [activity({ consequence: null, capability: null })] },
      SOURCE_ID,
    );

    const only = parsed.activities[0]!;
    expect(only.contribution).toBe('Built a thing');
    // The absent components must be genuinely absent — not null, not '', not a plausible guess.
    expect(only.consequence).toBeUndefined();
    expect(only.capability).toBeUndefined();
    expect('consequence' in only).toBe(false);
  });

  it.each([
    ['only a capability', { contribution: null, consequence: null, capability: ['Rust'] }],
    ['only a consequence', { contribution: null, consequence: 'Cut latency by half', capability: null }],
  ])('accepts an activity with %s', (_label, overrides) => {
    const parsed = parseProposalContent({ activities: [activity(overrides)] }, SOURCE_ID);
    expect(parsed.activities).toHaveLength(1);
  });

  it('rejects an activity asserting none of the three components', () => {
    // The shape a model returns when it is padding the response.
    expect(() =>
      parseProposalContent(
        { activities: [activity({ contribution: null, consequence: null, capability: [] })] },
        SOURCE_ID,
      ),
    ).toThrow(/no contribution, capability or consequence/);
  });

  it('rejects an item with no source reference', () => {
    expect(() => parseProposalContent({ activities: [activity({ sources: [] })] }, SOURCE_ID)).toThrow(
      /cannot be reviewed/,
    );
  });

  it('rejects a citation of a different source', () => {
    expect(() =>
      parseProposalContent(
        { activities: [activity({ sources: [{ sourceId: 'somewhere-else', quote: 'x' }] })] },
        SOURCE_ID,
      ),
    ).toThrow(/not the source being extracted/);
  });

  it('always attributes references to the source actually being extracted', () => {
    const parsed = parseProposalContent({ activities: [activity()] }, SOURCE_ID);
    expect(parsed.activities[0]!.sources[0]!.sourceId).toBe(SOURCE_ID);
  });

  it('rejects a relation kind outside the vocabulary', () => {
    expect(() =>
      parseProposalContent(
        {
          activities: [activity()],
          relations: [
            {
              id: 'r1',
              kind: 'related_to',
              fromId: 'a1',
              toId: 'a1',
              epistemicStatus: 'inferred',
              sources: [{ quote: 'x' }],
            },
          ],
        },
        SOURCE_ID,
      ),
    ).toThrow(/outside the relation vocabulary/);
  });

  it('rejects a relation pointing at an item that was never proposed', () => {
    expect(() =>
      parseProposalContent(
        {
          activities: [activity()],
          relations: [
            {
              id: 'r1',
              kind: 'occurred_within',
              fromId: 'a1',
              toId: 'ghost',
              epistemicStatus: 'observed',
              sources: [{ quote: 'x' }],
            },
          ],
        },
        SOURCE_ID,
      ),
    ).toThrow(/unknown item 'ghost'/);
  });

  it('rejects an invalid epistemic status rather than defaulting one', () => {
    expect(() =>
      parseProposalContent({ activities: [activity({ epistemicStatus: 'probably' })] }, SOURCE_ID),
    ).toThrow(ExtractionError);
  });

  it('rejects duplicate item ids, which would make review decisions ambiguous', () => {
    expect(() =>
      parseProposalContent({ activities: [activity(), activity()] }, SOURCE_ID),
    ).toThrow(/duplicate item id/);
  });

  it('accepts an entirely empty proposal', () => {
    // A source Joby could read nothing from is a real outcome, not an error.
    expect(parseProposalContent({}, SOURCE_ID)).toEqual({
      structure: [],
      activities: [],
      relations: [],
      conflicts: [],
    });
  });
});

describe('DeterministicCvExtractor', () => {
  const extractor = new DeterministicCvExtractor();

  const cv = [
    'Education',
    'University of Bristol, 2022 - 2026',
    '- Studied compilers',
    '',
    'Experience',
    'Placement at Acme Ltd, 2024',
    '- Contributed to the payments migration',
    '- Helped build an internal dashboard',
  ].join('\n');

  it('extracts structure and activities with verbatim provenance', async () => {
    const { content } = await extractor.extract({ sourceId: SOURCE_ID, text: cv });

    expect(content.structure.map((s) => s.label)).toEqual(['University of Bristol', 'Placement at Acme Ltd']);
    expect(content.activities).toHaveLength(3);

    for (const item of [...content.structure, ...content.activities]) {
      expect(item.sources[0]!.sourceId).toBe(SOURCE_ID);
      // The quote must appear in the source exactly — provenance you cannot check is not provenance.
      expect(cv).toContain(item.sources[0]!.quote);
    }
  });

  it('does not upgrade the language of what it read', async () => {
    const { content } = await extractor.extract({ sourceId: SOURCE_ID, text: cv });
    const contributions = content.activities.map((a) => a.contribution);

    expect(contributions).toContain('Contributed to the payments migration');
    expect(contributions).toContain('Helped build an internal dashboard');
    // "contributed" must not have become "led", nor "helped build" become "built".
    expect(contributions.join(' ')).not.toMatch(/\bled\b/i);
    expect(contributions.join(' ')).not.toMatch(/^Built /m);
  });

  it('leaves consequence and capability absent when the source states neither', async () => {
    const { content } = await extractor.extract({ sourceId: SOURCE_ID, text: cv });
    for (const item of content.activities) {
      expect(item.consequence).toBeUndefined();
      expect(item.capability).toBeUndefined();
    }
  });

  it('keeps a vague date exactly as written', async () => {
    const { content } = await extractor.extract({ sourceId: SOURCE_ID, text: cv });
    const placement = content.structure.find((s) => s.label === 'Placement at Acme Ltd')!;

    expect(placement.startedAt).toBe('2024');
    // A single year must not acquire an end date, a month, or a range it never had.
    expect(placement.endedAt).toBeUndefined();
  });

  it('produces output that satisfies the validator', async () => {
    const { content } = await extractor.extract({ sourceId: SOURCE_ID, text: cv });
    expect(() => parseProposalContent(JSON.parse(JSON.stringify(content)), SOURCE_ID)).not.toThrow();
  });

  it('is deterministic', async () => {
    const first = await extractor.extract({ sourceId: SOURCE_ID, text: cv });
    const second = await extractor.extract({ sourceId: SOURCE_ID, text: cv });
    expect(first).toEqual(second);
  });

  it('returns an empty proposal for a source it cannot read, rather than inventing one', async () => {
    const { content } = await extractor.extract({ sourceId: SOURCE_ID, text: 'hello\nthere\n' });

    expect(content.structure).toEqual([]);
    expect(content.activities).toEqual([]);
    expect(content.notes?.join(' ')).toMatch(/No recognisable/);
  });
});
