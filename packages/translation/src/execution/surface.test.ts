/**
 * The pure parts of surface interpretation: compacting an observation into an `ExecutionSurface`,
 * validating interpreter output before it is trusted, and the deterministic rule-based interpreter.
 *
 * Deliberately exercised against two structurally different fixture pages (a plain static form and
 * a sparser, differently-labelled surface) to prove nothing here branches on portal shape — the
 * acceptance criterion "no ATS-specific branching exists" is a behaviour to test, not just a rule to
 * follow.
 */

import { describe, expect, it } from 'vitest';

import { buildExecutionSurface, type PageObservation } from './surface-observation';
import { SurfaceInterpretationError, type SurfaceInterpretationContext } from './surface-port';
import { parseSurfaceInterpretationResult } from './surface-validate';
import { DeterministicSurfaceInterpreter } from './surface-deterministic-interpreter';

const staticFormPage: PageObservation = {
  url: 'https://portal-one.example/apply/42',
  title: 'Application — Software Engineer',
  elements: [
    { id: 'el-name', kind: 'text_input', label: 'Full name', required: true },
    { id: 'el-email', kind: 'text_input', label: 'Email address', required: true },
    { id: 'el-resume', kind: 'file_upload', label: 'Upload your resume', required: true },
    { id: 'el-why', kind: 'textarea', label: 'Why do you want to work here?', required: true },
    { id: 'el-visa', kind: 'radio', label: 'Do you require visa sponsorship?', required: true, options: ['Yes', 'No'] },
    { id: 'el-consent', kind: 'checkbox', label: 'I agree to the privacy policy', required: true },
    { id: 'el-submit', kind: 'button', label: 'Submit application' },
    { id: 'el-noise', kind: 'static_text', text: 'Fields marked * are required.' },
  ],
};

/** A structurally different surface — no consent checkbox, a select instead of a radio. */
const spaLikePage: PageObservation = {
  url: 'https://portal-two.example/careers/step-2',
  title: 'Step 2 of 3',
  elements: [
    { id: 'q1', kind: 'text_input', name: 'candidate_name', label: 'Your name', required: true },
    { id: 'q2', kind: 'select', label: 'Preferred start date', options: ['ASAP', 'In 3 months'] },
    { id: 'q3', kind: 'button', label: 'Continue' },
    { id: 'q4', kind: 'link', text: 'Back to job description' },
  ],
};

describe('buildExecutionSurface', () => {
  it('extracts usable controls and drops elements with nothing to ground', () => {
    const observation: PageObservation = {
      url: 'https://example.test/apply',
      elements: [
        { id: 'a', kind: 'text_input', label: 'Name' },
        // No id at all — cannot be grounded, must be dropped.
        { id: '', kind: 'text_input', label: 'Ghost field' },
        // Nothing to ground against: no label, no text, no name.
        { id: 'b', kind: 'static_text' },
      ],
    };
    const surface = buildExecutionSurface(observation);
    expect(surface.elements.map((e) => e.id)).toEqual(['a']);
  });

  it('deduplicates by id, keeping the first occurrence', () => {
    const observation: PageObservation = {
      url: 'https://example.test/apply',
      elements: [
        { id: 'a', kind: 'text_input', label: 'First' },
        { id: 'a', kind: 'text_input', label: 'Second' },
      ],
    };
    const surface = buildExecutionSurface(observation);
    expect(surface.elements).toHaveLength(1);
    expect(surface.elements[0]!.label).toBe('First');
  });

  it('truncates long text rather than dropping or summarising it', () => {
    const longLabel = 'x'.repeat(500);
    const surface = buildExecutionSurface({
      url: 'https://example.test/apply',
      elements: [{ id: 'a', kind: 'text_input', label: longLabel }],
    });
    expect(surface.elements[0]!.label!.length).toBeLessThan(longLabel.length);
    expect(surface.elements[0]!.label!.endsWith('…')).toBe(true);
  });

  it('never branches on the page url or title — two structurally different pages compact the same way', () => {
    const a = buildExecutionSurface(staticFormPage);
    const b = buildExecutionSurface(spaLikePage);
    // Different content, same shape of output — every element carries an id and a kind, nothing
    // about the compaction differs by which page it came from.
    for (const surface of [a, b]) {
      for (const element of surface.elements) {
        expect(typeof element.id).toBe('string');
        expect(typeof element.kind).toBe('string');
      }
    }
    // Static text and links carry context (a compaction concern) even though the interpreter later
    // chooses not to ask about them (a classification concern) — the two are deliberately separate.
    expect(a.elements.length).toBe(staticFormPage.elements.length);
    expect(b.elements.length).toBe(spaLikePage.elements.length);
  });
});

const baseContext: SurfaceInterpretationContext = {
  knownFacts: [{ label: 'Full name', value: 'Ada Lovelace' }],
  resolvedRequirementLabels: [],
};

describe('parseSurfaceInterpretationResult', () => {
  const surface = buildExecutionSurface(staticFormPage);

  it('accepts a well-grounded result', () => {
    const result = parseSurfaceInterpretationResult(
      {
        requirements: [
          { surfaceElementId: 'el-name', kind: 'known', label: 'Full name', groundedFactLabel: 'Full name' },
          { surfaceElementId: 'el-why', kind: 'generated_answer', label: 'Why do you want to work here?' },
        ],
        unclear: [],
      },
      surface,
      baseContext,
    );
    expect(result.requirements).toHaveLength(2);
  });

  it('rejects a requirement grounded in an element that was not on the surface', () => {
    expect(() =>
      parseSurfaceInterpretationResult(
        { requirements: [{ surfaceElementId: 'el-does-not-exist', kind: 'user_required', label: 'X' }], unclear: [] },
        surface,
        baseContext,
      ),
    ).toThrow(SurfaceInterpretationError);
  });

  it('rejects a "known" requirement citing a fact that was not supplied', () => {
    expect(() =>
      parseSurfaceInterpretationResult(
        {
          requirements: [
            { surfaceElementId: 'el-email', kind: 'known', label: 'Email address', groundedFactLabel: 'Email address' },
          ],
          unclear: [],
        },
        surface,
        baseContext, // only "Full name" was supplied
      ),
    ).toThrow(SurfaceInterpretationError);
  });

  it('rejects a "known" requirement with no groundedFactLabel at all', () => {
    expect(() =>
      parseSurfaceInterpretationResult(
        { requirements: [{ surfaceElementId: 'el-name', kind: 'known', label: 'Full name' }], unclear: [] },
        surface,
        baseContext,
      ),
    ).toThrow(SurfaceInterpretationError);
  });

  it('rejects a kind outside the vocabulary', () => {
    expect(() =>
      parseSurfaceInterpretationResult(
        { requirements: [{ surfaceElementId: 'el-name', kind: 'guessed', label: 'Full name' }], unclear: [] },
        surface,
        baseContext,
      ),
    ).toThrow(SurfaceInterpretationError);
  });

  it('rejects an unclear entry grounded in an element that was not on the surface', () => {
    expect(() =>
      parseSurfaceInterpretationResult(
        { requirements: [], unclear: [{ surfaceElementId: 'nope', note: 'not sure' }] },
        surface,
        baseContext,
      ),
    ).toThrow(SurfaceInterpretationError);
  });
});

describe('DeterministicSurfaceInterpreter', () => {
  const interpreter = new DeterministicSurfaceInterpreter();

  it('classifies a known field from a supplied fact, grounded to the exact fact label', async () => {
    const surface = buildExecutionSurface(staticFormPage);
    const { result } = await interpreter.interpret({ surface, context: baseContext });
    const name = result.requirements.find((r) => r.surfaceElementId === 'el-name');
    expect(name?.kind).toBe('known');
    expect(name?.groundedFactLabel).toBe('Full name');
  });

  it('classifies a file upload and a consent checkbox as portal operations', async () => {
    const surface = buildExecutionSurface(staticFormPage);
    const { result } = await interpreter.interpret({ surface, context: baseContext });
    expect(result.requirements.find((r) => r.surfaceElementId === 'el-resume')?.kind).toBe('portal_operation');
    expect(result.requirements.find((r) => r.surfaceElementId === 'el-consent')?.kind).toBe('portal_operation');
  });

  it('classifies an open-ended textarea as a generated-answer requirement', async () => {
    const surface = buildExecutionSurface(staticFormPage);
    const { result } = await interpreter.interpret({ surface, context: baseContext });
    expect(result.requirements.find((r) => r.surfaceElementId === 'el-why')?.kind).toBe('generated_answer');
  });

  it('classifies a required field with no other signal as user-required', async () => {
    const surface = buildExecutionSurface(staticFormPage);
    const { result } = await interpreter.interpret({ surface, context: baseContext });
    expect(result.requirements.find((r) => r.surfaceElementId === 'el-visa')?.kind).toBe('user_required');
  });

  it('represents genuinely unclear elements rather than guessing a kind', async () => {
    // A select with no matching fact and not required — no rule confidently classifies it.
    const surface = buildExecutionSurface(spaLikePage);
    const { result } = await interpreter.interpret({ surface, context: baseContext });
    expect(result.unclear.some((u) => u.surfaceElementId === 'q2')).toBe(true);
    expect(result.requirements.some((r) => r.surfaceElementId === 'q2')).toBe(false);
  });

  it('skips a requirement already resolved this session, by label', async () => {
    const surface = buildExecutionSurface(staticFormPage);
    const context: SurfaceInterpretationContext = { ...baseContext, resolvedRequirementLabels: ['Full name'] };
    const { result } = await interpreter.interpret({ surface, context });
    expect(result.requirements.some((r) => r.surfaceElementId === 'el-name')).toBe(false);
    expect(result.unclear.some((u) => u.surfaceElementId === 'el-name')).toBe(false);
  });

  it('produces the same classification for a structurally different page — no ATS-specific branching', async () => {
    const surface = buildExecutionSurface(spaLikePage);
    const { result } = await interpreter.interpret({ surface, context: baseContext });
    // "Continue" is an action-labelled button on a totally different page shape, and still lands
    // as a portal operation via the same generic rule that classified "Submit application".
    expect(result.requirements.find((r) => r.surfaceElementId === 'q3')?.kind).toBe('portal_operation');
  });
});
