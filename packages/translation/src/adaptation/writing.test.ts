/**
 * Written representation (UC10, UC11) — the pure parts.
 *
 * What is being defended here is not prose quality. It is **fabricated meaning**: a generator
 * holding true facts, a question asking "why do you want to work here?", no information about why
 * this person wants to work there, and a fluent sentence anyway. Nothing factual is violated; the
 * person is handed a motivation they do not have, in their own voice, and finds out in an interview.
 *
 * So the gate is tested for what it *asks for*, and the validator for what it *refuses to store*.
 */

import { describe, expect, it } from 'vitest';

import type { RepresentationReference } from '@joby/identity/representation';
import type { AdaptedElement, AdaptedState } from './adapted-state';
import { DeterministicRepresentationWriter } from './deterministic-writer';
import { validateDraft, wordCount } from './validate-draft';
import {
  ProvisionalReferenceSelection,
  ProvisionalSatisfactionGate,
  WritingError,
  type ApplicationInput,
  type DraftSegment,
} from './writing';

const element = (nodeId: string, title: string, speaksTo: readonly string[] = []): AdaptedElement => ({
  nodeId,
  section: 'projects',
  title,
  canonicalTitle: title,
  detail: `${title} detail`,
  capabilities: [...speaksTo],
  origin: 'representation',
  speaksTo,
  rationale: 'From your positioning.',
  visibility: 'private',
});

const adapted = (elements: readonly AdaptedElement[] = [element('n-1', 'Rota scheduler', ['Python'])]): AdaptedState => ({
  contextId: 'ctx-1',
  personId: 'person-1',
  opportunityId: 'opp-1',
  representationId: 'rep-1',
  identityRevision: 4,
  opportunityRevision: 1,
  composedAt: '2026-08-16T00:00:00.000Z',
  elements,
  assessment: { representationId: 'rep-1', baseline: [], gaps: [], unevidenced: [] },
  recoveryUsed: false,
  opportunity: {
    opportunityId: 'opp-1',
    revision: 1,
    role: 'Markets Placement',
    company: 'Barclays',
    requiredCapabilities: ['Python'],
    preferredCapabilities: [],
    responsibilities: [],
    conditions: {},
    applicationQuestions: [],
    attribution: [],
    uncertainty: [],
  },
  user: {
    personId: 'person-1',
    identityRevision: 4,
    conditions: {},
    otherConstraints: [],
    preferences: [],
    notes: {},
  },
});

const input = (kind: ApplicationInput['kind'], answer: string): ApplicationInput => ({
  kind,
  prompt: 'asked',
  answer,
  providedAt: '2026-08-16T00:00:00.000Z',
  providedBy: 'user-1',
});

const reference = (id: string, kind: RepresentationReference['kind']): RepresentationReference => ({
  id,
  personId: 'person-1',
  kind,
  label: id,
  content: 'Some writing of mine.',
  checksum: id,
  capturedAt: '2026-08-16T00:00:00.000Z',
  providedBy: 'user-1',
});

const gate = new ProvisionalSatisfactionGate();

describe('the satisfaction gate (provisional)', () => {
  it('will not write a cover letter without knowing why this person wants it', () => {
    const readiness = gate.assess({
      surface: 'cover_letter',
      adapted: adapted(),
      constraints: {},
      provided: [],
    });

    // Fit is not motivation. A role suiting someone is not evidence that they want it, and this is
    // the exact point where a generator would otherwise invent enthusiasm in the first person.
    expect(readiness.ready).toBe(false);
    expect(readiness.missing.map((request) => request.kind)).toEqual(['motivation', 'timing']);
    expect(readiness.missing[0]!.why).toMatch(/not evidence that you want it/);
  });

  it('is not a one-question interaction, and reassesses as answers arrive', () => {
    const after = gate.assess({
      surface: 'cover_letter',
      adapted: adapted(),
      constraints: {},
      provided: [input('motivation', 'I want to work on rates because…')],
    });
    expect(after.ready).toBe(false);
    expect(after.missing.map((request) => request.kind)).toEqual(['timing']);

    const ready = gate.assess({
      surface: 'cover_letter',
      adapted: adapted(),
      constraints: {},
      provided: [input('motivation', 'Rates.'), input('timing', 'Placement year starts in September.')],
    });
    expect(ready.ready).toBe(true);
    expect(ready.missing).toEqual([]);
  });

  it('asks for meaning when a question asks why, and not otherwise', () => {
    const why = gate.assess({
      surface: 'application_answer',
      adapted: adapted(),
      question: 'Why do you want to join our markets division?',
      constraints: {},
      provided: [],
    });
    expect(why.missing.map((request) => request.kind)).toEqual(['motivation']);

    const factual = gate.assess({
      surface: 'application_answer',
      adapted: adapted(),
      question: 'Describe a technical project you built.',
      constraints: {},
      provided: [],
    });
    // Adapted State already answers this one. Asking anyway would be interrogation for its own sake.
    expect(factual.ready).toBe(true);
  });

  it('never infers a sensitive disclosure', () => {
    const readiness = gate.assess({
      surface: 'application_answer',
      adapted: adapted(),
      question: 'Do you require visa sponsorship?',
      constraints: {},
      provided: [],
    });

    expect(readiness.missing.map((request) => request.kind)).toContain('disclosure');
    expect(readiness.missing.find((request) => request.kind === 'disclosure')!.why).toMatch(
      /never inferred, never defaulted and never pre-filled/,
    );
  });

  it('reports an unsupported competency rather than asking the person to assert it', () => {
    const readiness = gate.assess({
      surface: 'application_answer',
      adapted: adapted(),
      question: 'Give an example of your Rust work.',
      constraints: { competency: 'Rust', requiresExample: true },
      provided: [],
    });

    // Reported, never elicited: being told something in a chat box is not confirmation, and using it
    // would put an unverified professional claim in an application under the person's name.
    expect(readiness.unsupported).toEqual(['Rust']);
    expect(readiness.missing.map((request) => request.kind)).not.toContain('context');
  });

  it('says it is provisional, because the algorithm is an open decision', () => {
    const readiness = gate.assess({
      surface: 'cover_letter',
      adapted: adapted(),
      constraints: {},
      provided: [],
    });
    expect(readiness.provisional).toBe(true);
  });
});

describe('reference selection (provisional)', () => {
  it('orders the closest surface first without establishing precedence', () => {
    const selection = new ProvisionalReferenceSelection().select(
      [reference('sample', 'writing_sample'), reference('letter', 'cover_letter')],
      'cover_letter',
    );

    expect(selection.selected.map((item) => item.id)).toEqual(['letter', 'sample']);
    expect(selection.provisional).toBe(true);
    expect(selection.note).toMatch(/open decision/);
  });

  it('caps how many speak, and says so', () => {
    const many = ['a', 'b', 'c', 'd'].map((id) => reference(id, 'writing_sample'));
    const selection = new ProvisionalReferenceSelection().select(many, 'application_answer');

    expect(selection.selected).toHaveLength(3);
    expect(selection.note).toMatch(/3 of 4/);
  });
});

describe('the draft validator', () => {
  const state = adapted();
  const provided = [input('motivation', 'I want to work on rates.')];

  const segment = (text: string, extra: Partial<DraftSegment> = {}): DraftSegment => ({
    text,
    groundedInNodeIds: [],
    groundedInInput: [],
    ...extra,
  });

  it('accepts text grounded in a confirmed fact or in what the person said', () => {
    const segments = [
      segment('I want to work on rates.', { groundedInInput: ['motivation'] }),
      segment('I built a rota scheduler.', { groundedInNodeIds: ['n-1'] }),
      segment('Yours sincerely,'),
    ];
    expect(validateDraft({ segments, adapted: state, provided, constraints: {} })).toHaveLength(3);
  });

  it('refuses a claim about a fact this person has not confirmed', () => {
    // The check that stops a fluent invention from reaching an application.
    expect(() =>
      validateDraft({
        segments: [segment('I led a trading desk.', { groundedInNodeIds: ['n-ghost'] })],
        adapted: state,
        provided,
        constraints: {},
      }),
    ).toThrow(/must trace to a confirmed fact/);
  });

  it('refuses a motivation the person never gave', () => {
    expect(() =>
      validateDraft({
        segments: [segment('I have always loved markets.', { groundedInInput: ['timing'] })],
        adapted: state,
        provided,
        constraints: {},
      }),
    ).toThrow(/never supplied/);
  });

  it('refuses an assertion that says what it stands on nowhere', () => {
    const assertion =
      'I am an exceptionally strong candidate with years of relevant commercial experience and a ' +
      'deep understanding of derivatives markets across several asset classes.';
    expect(() =>
      validateDraft({ segments: [segment(assertion)], adapted: state, provided, constraints: {} }),
    ).toThrow(/without saying what it stands on/);
  });

  it('refuses a draft the person could not submit', () => {
    const segments = [segment('I want to work on rates.', { groundedInInput: ['motivation'] })];
    expect(() =>
      validateDraft({ segments, adapted: state, provided, constraints: { wordLimit: 3 } }),
    ).toThrow(/words and the limit is 3/);
    expect(() =>
      validateDraft({ segments, adapted: state, provided, constraints: { characterLimit: 5 } }),
    ).toThrow(/characters and the limit is 5/);
  });

  it('refuses an empty draft', () => {
    expect(() => validateDraft({ segments: [], adapted: state, provided, constraints: {} })).toThrow(
      WritingError,
    );
  });
});

describe('the deterministic writer', () => {
  it('composes a cover letter from the person\'s words and their confirmed facts', async () => {
    const provided = [
      input('motivation', 'I want to work on rates because I like problems with real constraints'),
      input('timing', 'My placement year starts in September'),
    ];
    const result = await new DeterministicRepresentationWriter().write({
      surface: 'cover_letter',
      adapted: adapted(),
      constraints: {},
      references: [],
      provided,
    });

    // Their motivation, in their words, first — then evidence, then why now.
    expect(result.segments[0]!.groundedInInput).toEqual(['motivation']);
    expect(result.segments[0]!.text).toMatch(/real constraints/);
    expect(result.segments.some((s) => s.groundedInNodeIds.includes('n-1'))).toBe(true);
    expect(result.segments.at(-1)!.groundedInInput).toEqual(['timing']);
  });

  it('produces only grounded segments, so its own output passes validation', async () => {
    const provided = [input('motivation', 'Rates.'), input('timing', 'September.')];
    const state = adapted();
    const result = await new DeterministicRepresentationWriter().write({
      surface: 'cover_letter',
      adapted: state,
      constraints: {},
      references: [],
      provided,
    });

    expect(() =>
      validateDraft({ segments: result.segments, adapted: state, provided, constraints: {} }),
    ).not.toThrow();
  });

  it('counts words the way a limit does', () => {
    expect(wordCount('  one two   three ')).toBe(3);
    expect(wordCount('')).toBe(0);
  });
});
