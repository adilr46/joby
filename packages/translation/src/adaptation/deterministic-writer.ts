/**
 * A deterministic writer.
 *
 * The offline default and the one tests use, exactly as `DeterministicCvExtractor` is for
 * extraction. It composes rather than generates: every sentence is assembled from an Adapted State
 * element or from something the person said, so it **cannot** invent by construction.
 *
 * It will not win a prose competition. That is the correct trade for a component whose job is to
 * make the grounding rules checkable without a network or an API key.
 */

import type { AdaptedElement } from './adapted-state';
import type {
  ApplicationInput,
  DraftSegment,
  RepresentationWriter,
  WriteRequest,
  WriteResult,
} from './writing';

const sentence = (value: string): string => (value.trim().endsWith('.') ? value.trim() : `${value.trim()}.`);

const answerFor = (
  provided: readonly ApplicationInput[],
  kind: ApplicationInput['kind'],
): ApplicationInput | undefined => provided.find((given) => given.kind === kind);

/** The lens's framing where there is one, the canonical fact otherwise — never both merged. */
function describe(element: AdaptedElement): string {
  const what = element.detail ?? element.title;
  const speaks = element.speaksTo.length > 0 ? ` (${element.speaksTo.join(', ')})` : '';
  return `${sentence(what).slice(0, -1)}${speaks}`;
}

export class DeterministicRepresentationWriter implements RepresentationWriter {
  readonly name = 'deterministic';

  async write(request: WriteRequest): Promise<WriteResult> {
    const { adapted, provided, surface } = request;

    // Lead with what this opportunity actually asks about; the composition already ordered it.
    const relevant = adapted.elements.filter((element) => element.speaksTo.length > 0);
    const evidence = (relevant.length > 0 ? relevant : adapted.elements).slice(0, 3);

    const segments: DraftSegment[] = [];

    if (surface === 'cover_letter') {
      const motivation = answerFor(provided, 'motivation');
      const timing = answerFor(provided, 'timing');

      // Why this opportunity — the person's words, never Joby's inference from fit.
      if (motivation) {
        segments.push({
          text: sentence(motivation.answer),
          groundedInNodeIds: [],
          groundedInInput: ['motivation'],
        });
      }

      // Why this person is relevant — and this is the only part that comes from Adapted State.
      for (const element of evidence) {
        segments.push({
          text: sentence(describe(element)),
          groundedInNodeIds: [element.nodeId],
          groundedInInput: [],
        });
      }

      if (timing) {
        segments.push({
          text: sentence(timing.answer),
          groundedInNodeIds: [],
          groundedInInput: ['timing'],
        });
      }
    } else {
      const motivation = answerFor(provided, 'motivation');
      const disclosure = answerFor(provided, 'disclosure');

      if (motivation) {
        segments.push({
          text: sentence(motivation.answer),
          groundedInNodeIds: [],
          groundedInInput: ['motivation'],
        });
      }
      if (disclosure) {
        segments.push({
          text: sentence(disclosure.answer),
          groundedInNodeIds: [],
          groundedInInput: ['disclosure'],
        });
      }
      for (const element of evidence) {
        segments.push({
          text: sentence(describe(element)),
          groundedInNodeIds: [element.nodeId],
          groundedInInput: [],
        });
      }
    }

    return { segments, model: 'deterministic-v1' };
  }
}
