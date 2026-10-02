/**
 * A deterministic, offline surface interpreter.
 *
 * Purpose: automated tests and local development need a real interpretation path that produces the
 * same output every run, the same reason `@joby/identity`'s `DeterministicCvExtractor` exists.
 *
 * It classifies by element *shape* only — kind, `required`, and a handful of generic keyword
 * patterns in the label — never by which portal or vendor produced the page. That is not a
 * simplification made for testing convenience; it is the same "no ATS-specific branching" rule the
 * real interpreter must also follow, demonstrated by construction. It also has nowhere to guess:
 * anything it cannot classify with reasonable confidence goes to `unclear`, exactly as the port
 * expects the real interpreter to do.
 */

import type { SurfaceElementKind } from './surface-observation';
import type {
  SurfaceInterpretationOutput,
  SurfaceInterpretationRequest,
  SurfaceInterpreter,
  SurfaceRequirement,
  UnclearSurfaceElement,
} from './surface-port';

const MECHANICAL_KINDS: ReadonlySet<SurfaceElementKind> = new Set(['file_upload']);
const ACTION_LABEL = /\b(submit|continue|next|apply|upload)\b/i;
const CONSENT_LABEL = /\b(consent|agree|agreement|terms|privacy\s+policy)\b/i;
const OPEN_ENDED_LABEL = /\b(why|describe|tell us|motivat\w*|explain)\b/i;

function normalize(label: string): string {
  return label.trim().toLowerCase();
}

export class DeterministicSurfaceInterpreter implements SurfaceInterpreter {
  readonly name = 'deterministic';

  async interpret(request: SurfaceInterpretationRequest): Promise<SurfaceInterpretationOutput> {
    const { surface, context } = request;
    const factsByLabel = new Map(context.knownFacts.map((fact) => [normalize(fact.label), fact.label]));
    const resolvedLabels = new Set(context.resolvedRequirementLabels.map(normalize));

    const requirements: SurfaceRequirement[] = [];
    const unclear: UnclearSurfaceElement[] = [];

    for (const element of surface.elements) {
      if (element.kind === 'static_text' || element.kind === 'link') continue;

      const label = element.label ?? element.text ?? element.name ?? '';
      if (resolvedLabels.has(normalize(label))) continue;

      // 1. Mechanical portal operations — a file to attach, or a button/checkbox whose label
      //    reads as an action rather than a question.
      if (
        MECHANICAL_KINDS.has(element.kind) ||
        ((element.kind === 'button' || element.kind === 'checkbox') &&
          (ACTION_LABEL.test(label) || CONSENT_LABEL.test(label)))
      ) {
        requirements.push({ surfaceElementId: element.id, kind: 'portal_operation', label });
        continue;
      }

      // 2. Answerable directly from a known fact.
      const matchedFactLabel = factsByLabel.get(normalize(label));
      if (matchedFactLabel !== undefined) {
        requirements.push({
          surfaceElementId: element.id,
          kind: 'known',
          label,
          groundedFactLabel: matchedFactLabel,
        });
        continue;
      }

      // 3. An open-ended question a drafted answer could address.
      if (element.kind === 'textarea' && OPEN_ENDED_LABEL.test(label)) {
        requirements.push({ surfaceElementId: element.id, kind: 'generated_answer', label });
        continue;
      }

      // 4. Marked required with no other signal: must come from the person.
      if (element.required === true) {
        requirements.push({ surfaceElementId: element.id, kind: 'user_required', label });
        continue;
      }

      // 5. Nothing here supports a confident classification — represent the gap, don't guess.
      unclear.push({
        surfaceElementId: element.id,
        note: label
          ? `No rule matched '${label}' (${element.kind}); not required, not a known fact, not an action.`
          : `Element ${element.id} (${element.kind}) has no label or text to classify from.`,
      });
    }

    return { model: this.name, result: { requirements, unclear } };
  }
}
