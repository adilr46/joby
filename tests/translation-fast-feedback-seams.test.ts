/**
 * The information seams either side of Translation.
 *
 * Producers and consumers declare their **own local view** of what crosses, so no authority imports
 * another's package. That only holds if the views stay structurally compatible — which is what these
 * assignments check, at compile time. A drifted field is a type error here rather than a runtime
 * surprise in a composition root.
 *
 * The Opportunity Intelligence seam that used to sit *inside* Translation is gone: Opportunity owns
 * understanding, Adaptation consumes it, and the person × world interpretation Adaptation performs on
 * it is no longer a second copy of the same types (ADR 0031).
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { OpportunityUnderstanding as ProducedUnderstanding } from '@joby/opportunity';
import type {
  ApplicationIntent as ProducedApplicationIntent,
  OpportunityUnderstandingView as ConsumedUnderstanding,
} from '@joby/translation/adaptation';
import type {
  ApplicationIntent as ConsumedApplicationIntent,
  FastFeedback as ProducedFastFeedback,
} from '@joby/translation/execution';

/** Opportunity → Adaptation. Structured understanding, never posting text. */
const understanding: ProducedUnderstanding = {
  opportunityId: 'opp-1',
  revision: 2,
  role: 'Analyst',
  company: 'A Bank',
  requiredCapabilities: ['Python'],
  conditions: { location: ['London'] },
  attribution: ['[ev-1] posting from careers-page'],
  uncertainty: ['The evidence does not state sponsorship.'],
};
const consumedUnderstanding: ConsumedUnderstanding = understanding;

/** Adaptation → Execution. */
const intent: ProducedApplicationIntent = {
  personId: 'person-1',
  opportunityId: 'opp-1',
  adaptationContextId: 'ctx-1',
  representation: {
    draftId: 'draft-1',
    revision: 1,
    surface: 'cover_letter',
    content: [{ text: 'A grounded sentence.', groundedInNodeIds: ['node-1'], groundedInInput: ['motivation'] }],
  },
};
const consumedIntent: ConsumedApplicationIntent = intent;

/** Execution → Adaptation. Semantic observations only; mechanical detail stays inside Execution. */
const feedback: ProducedFastFeedback = {
  personId: 'person-1',
  opportunityId: 'opp-1',
  observedAt: '2026-01-01T00:00:00.000Z',
  observation: 'The portal rejected the file format.',
};

describe('the information seams around Translation', () => {
  it('carries Opportunity understanding to Adaptation without either importing the other', () => {
    expect(consumedUnderstanding.opportunityId).toBe('opp-1');
    expect(consumedUnderstanding.requiredCapabilities).toEqual(['Python']);
    // Attribution survives the seam: a consumer can still trace a claim back to captured evidence.
    expect(consumedUnderstanding.attribution).toHaveLength(1);
  });

  it('carries Application Intent from Adaptation to Execution', () => {
    expect(consumedIntent.representation.draftId).toBe('draft-1');
    expect(consumedIntent.representation.content[0]!.groundedInNodeIds).toEqual(['node-1']);
  });

  it('carries only semantic Fast Feedback back from Execution', () => {
    expect(feedback.observation).toBeTruthy();
    // No retry count, selector, captcha or HTTP status has a field to travel in.
    expect(Object.keys(feedback).sort()).toEqual([
      'observation',
      'observedAt',
      'opportunityId',
      'personId',
    ]);
  });

  it('keeps mechanical feedback vocabulary out of the seam contract', async () => {
    const source = await readFile(
      join(process.cwd(), 'packages', 'translation', 'src', 'execution', 'information-seams.ts'),
      'utf8',
    );
    // Logging is not meaning. If these ever need to cross, that is a decision, not a field addition.
    for (const mechanical of ['retryCount', 'selector', 'captcha', 'httpStatus', 'stackTrace']) {
      expect(source, `${mechanical} leaked into the seam`).not.toContain(mechanical);
    }
  });
});
