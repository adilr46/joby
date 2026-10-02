/**
 * A deterministic, offline CV extractor.
 *
 * Purpose: automated tests and local development need a real extraction path that produces the
 * same output every run. Doctrine tests — "does a sparse activity survive storage", "can AI output
 * reach canonical state" — are about the *pipeline*, and a live model would make them flaky for
 * reasons that have nothing to do with what they assert.
 *
 * It is deliberately shallow. It reads structure from headed sections and bullet lines, and it
 * **never infers**: no capability is guessed from wording, no consequence is invented, no date is
 * made precise. Its output is honest about being thin, which is exactly the Baseline Identity case.
 *
 * Semantic failures a real model can make — "contributed" becoming "led", tools inferred without
 * support — are evaluated against live models separately (`docs/agent-evals/`).
 */

import { createHash } from 'node:crypto';

import type { ProposedActivity, ProposedRelation, ProposedStructure } from '../model';
import type { CvExtractor, ExtractionRequest, ExtractionResult } from './port';

/**
 * Section headings, matched against the **whole** line.
 *
 * Anchoring matters: a prefix match treats "Placement at Acme Ltd, 2024" as a heading and silently
 * drops the employer it names. A heading is a bare word, not a line that happens to start with one.
 */
const SECTION_HEADS: ReadonlyArray<{ pattern: RegExp; kind: ProposedStructure['kind'] }> = [
  { pattern: /^(education|academic(\s+background)?|qualifications)$/i, kind: 'institution' },
  {
    pattern: /^((work|professional|industrial)\s+)?(experience|employment|placements?)$/i,
    kind: 'organisation',
  },
  { pattern: /^(projects?|personal\s+projects?)$/i, kind: 'engagement' },
];

/** Stable ids: the same source text always yields the same proposal, byte for byte. */
function stableId(prefix: string, seed: string): string {
  return `${prefix}_${createHash('sha1').update(seed).digest('hex').slice(0, 12)}`;
}

export class DeterministicCvExtractor implements CvExtractor {
  readonly name = 'deterministic';

  async extract(request: ExtractionRequest): Promise<ExtractionResult> {
    const structure: ProposedStructure[] = [];
    const activities: ProposedActivity[] = [];
    const relations: ProposedRelation[] = [];

    const lines = request.text.split(/\r?\n/);
    let offset = 0;
    let currentSection: { kind: ProposedStructure['kind'] } | undefined;
    let currentStructureId: string | undefined;

    for (const line of lines) {
      const start = offset;
      offset += line.length + 1;

      const text = line.trim();
      if (text === '') continue;

      const head = SECTION_HEADS.find((s) => s.pattern.test(text.replace(/[:\s]+$/, '')));
      if (head) {
        currentSection = { kind: head.kind };
        currentStructureId = undefined;
        continue;
      }
      if (!currentSection) continue;

      const bullet = /^[-*•]\s+/.test(text);

      if (!bullet) {
        // A non-bullet line inside a section names the context: an institution, an employer, a
        // project. Dates are carried across verbatim — see below.
        const { label, startedAt, endedAt } = splitDates(text);
        const id = stableId('str', `${request.sourceId}:${text}`);
        structure.push({
          id,
          kind: currentSection.kind,
          label,
          epistemicStatus: 'observed',
          sources: [{ sourceId: request.sourceId, quote: text, startOffset: start, endOffset: start + line.length }],
          // Absent stays absent, and a vague date stays vague: '2023' is never widened to a range
          // and never given a month.
          ...(startedAt ? { startedAt } : {}),
          ...(endedAt ? { endedAt } : {}),
        });
        currentStructureId = id;
        continue;
      }

      // A bullet is something the person did. Only what the line actually says is recorded:
      // no capability is inferred from the verb, and no consequence is manufactured. Most
      // real bullets therefore produce a sparse activity, which is the correct outcome.
      const body = text.replace(/^[-*•]\s+/, '');
      const id = stableId('act', `${request.sourceId}:${body}`);
      activities.push({
        id,
        label: body,
        contribution: body,
        epistemicStatus: 'observed',
        sources: [{ sourceId: request.sourceId, quote: body, startOffset: start, endOffset: start + line.length }],
      });

      if (currentStructureId) {
        relations.push({
          id: stableId('rel', `${id}->${currentStructureId}`),
          kind: 'occurred_within',
          fromId: id,
          toId: currentStructureId,
          epistemicStatus: 'observed',
          sources: [{ sourceId: request.sourceId, quote: body, startOffset: start, endOffset: start + line.length }],
        });
      }
    }

    const notes: string[] = [];
    if (activities.length > 0) {
      notes.push(
        'Outcomes and skills were not inferred from wording. Where a bullet did not state a ' +
          'result or a tool, none was recorded.',
      );
    }
    if (structure.length === 0 && activities.length === 0) {
      notes.push('No recognisable education, experience or project sections were found in this source.');
    }

    return {
      model: 'deterministic-v1',
      content: { structure, activities, relations, conflicts: [], ...(notes.length > 0 ? { notes } : {}) },
    };
  }
}

/** Split a trailing date range off a heading line, keeping both sides exactly as written. */
function splitDates(text: string): { label: string; startedAt?: string; endedAt?: string } {
  const match = text.match(/^(.*?)[,|(\s]*((?:\w+\s)?\d{4})\s*[–—-]\s*((?:\w+\s)?\d{4}|present|current)\)?$/i);
  if (match?.[1] && match[2] && match[3]) {
    return { label: match[1].trim().replace(/[,(]$/, '').trim(), startedAt: match[2].trim(), endedAt: match[3].trim() };
  }

  const single = text.match(/^(.*?)[,|(\s]*((?:\w+\s)?\d{4})\)?$/);
  if (single?.[1] && single[2] && single[1].trim() !== '') {
    return { label: single[1].trim().replace(/[,(]$/, '').trim(), startedAt: single[2].trim() };
  }

  return { label: text };
}
