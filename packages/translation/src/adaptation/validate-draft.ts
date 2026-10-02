/**
 * Validating writer output before it reaches a person.
 *
 * Writer output is **untrusted input**, exactly as extractor output is. The checks here are not
 * schema hygiene — each blocks a specific way a draft could quietly become a lie in someone's own
 * voice, sent under their name:
 *
 *  - a segment citing a node that is not in this Adapted State is a professional claim with no
 *    confirmed fact behind it;
 *  - a segment citing an input the person never gave is invented meaning — a motivation they do not
 *    have, attributed to them;
 *  - a segment that cites nothing may not assert: it is a greeting or a connective, and anything
 *    longer is a claim wearing a connective's clothes;
 *  - a draft over a stated limit is one the person cannot submit.
 *
 * Rejecting is safe. The draft is not stored, the person is told, and nothing was sent. Accepting a
 * malformed draft is not: they may send it, and be asked about it in an interview.
 */

import type { AdaptedState } from './adapted-state';
import type { ApplicationInput, DraftSegment, SurfaceConstraints } from './writing';
import { WritingError } from './writing';

/**
 * How long an ungrounded segment may be before it stops being a connective.
 *
 * A greeting or a joining phrase is short. Two sentences citing nothing is a paragraph asserting
 * something, and it has to say what it stands on.
 */
const MAX_UNGROUNDED_CHARS = 120;

export const wordCount = (text: string): number =>
  text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;

export function validateDraft(input: {
  readonly segments: readonly DraftSegment[];
  readonly adapted: AdaptedState;
  readonly provided: readonly ApplicationInput[];
  readonly constraints: SurfaceConstraints;
}): readonly DraftSegment[] {
  const { segments, adapted, provided, constraints } = input;

  if (segments.length === 0) {
    throw new WritingError('The writer produced nothing. An empty draft is not an answer.');
  }

  const canonical = new Set(adapted.elements.map((element) => element.nodeId));
  const given = new Set(provided.map((input_) => input_.kind));

  for (const segment of segments) {
    if (segment.text.trim().length === 0) {
      throw new WritingError('A draft segment has no text.');
    }

    for (const nodeId of segment.groundedInNodeIds) {
      if (!canonical.has(nodeId)) {
        // The one check that stops a fluent invention from reaching an application.
        throw new WritingError(
          `A draft segment cites '${nodeId}', which is not in this Adapted State. ` +
            'Every professional claim must trace to a confirmed fact.',
        );
      }
    }

    for (const kind of segment.groundedInInput) {
      if (!given.has(kind)) {
        throw new WritingError(
          `A draft segment claims to draw on '${kind}', which this person never supplied. ` +
            'Meaning is elicited, never invented.',
        );
      }
    }

    const grounded = segment.groundedInNodeIds.length > 0 || segment.groundedInInput.length > 0;
    if (!grounded && segment.text.trim().length > MAX_UNGROUNDED_CHARS) {
      throw new WritingError(
        'A draft segment asserts something without saying what it stands on. ' +
          'Only short connective text may be ungrounded.',
      );
    }
  }

  const text = segments.map((segment) => segment.text).join(' ');
  if (constraints.wordLimit !== undefined && wordCount(text) > constraints.wordLimit) {
    throw new WritingError(
      `The draft is ${wordCount(text)} words and the limit is ${constraints.wordLimit}.`,
    );
  }
  if (constraints.characterLimit !== undefined && text.length > constraints.characterLimit) {
    throw new WritingError(
      `The draft is ${text.length} characters and the limit is ${constraints.characterLimit}.`,
    );
  }

  return segments;
}
