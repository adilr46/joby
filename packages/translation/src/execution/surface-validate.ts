/**
 * Validating interpreter output before anything from it reaches session state.
 *
 * Model output is untrusted input, the same discipline as `@joby/identity/extraction/validate.ts`.
 * Two checks matter more than generic schema hygiene:
 *
 *  - a requirement pointing at an element that was not on the surface sent is a claim grounded in
 *    nothing Execution can verify — the whole result is rejected, not just that item, because a
 *    model willing to invent one element id cannot be trusted on the rest of the same response;
 *  - a `known` requirement citing a fact that was not supplied is the same failure in a different
 *    place — grounding to real evidence, never to something the model merely asserts is known.
 *
 * Rejecting is safe: the inspection fails, the session is untouched, and it can be retried.
 */

import { SURFACE_REQUIREMENT_KINDS, type SurfaceRequirementKind } from './session';
import type { ExecutionSurface } from './surface-observation';
import {
  SurfaceInterpretationError,
  type SurfaceInterpretationContext,
  type SurfaceInterpretationResult,
  type SurfaceRequirement,
  type UnclearSurfaceElement,
} from './surface-port';

function fail(message: string): never {
  throw new SurfaceInterpretationError(`Invalid surface interpretation output: ${message}`);
}

function asRecord(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${where} is not an object`);
  return value as Record<string, unknown>;
}

function asArray(value: unknown, where: string): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(`${where} is not an array`);
  return value;
}

function requireString(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(`${where} is missing or empty`);
  return value;
}

function optionalString(value: unknown, where: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') fail(`${where} is not a string`);
  const trimmed = value.trim();
  return trimmed === '' ? undefined : value;
}

/**
 * Parse and validate a model response into a result, grounded against exactly the surface and
 * context that were sent — never against the surface or context the model might claim it saw.
 */
export function parseSurfaceInterpretationResult(
  raw: unknown,
  surface: ExecutionSurface,
  context: SurfaceInterpretationContext,
): SurfaceInterpretationResult {
  const root = asRecord(raw, 'interpretation');
  const elementIds = new Set(surface.elements.map((element) => element.id));
  const factLabels = new Set(context.knownFacts.map((fact) => fact.label));

  const requirements: SurfaceRequirement[] = asArray(root.requirements, 'interpretation.requirements').map(
    (entry, i) => {
      const where = `interpretation.requirements[${i}]`;
      const record = asRecord(entry, where);

      const surfaceElementId = requireString(record.surfaceElementId, `${where}.surfaceElementId`);
      if (!elementIds.has(surfaceElementId)) {
        fail(`${where}.surfaceElementId '${surfaceElementId}' was not present on the surface sent`);
      }

      const kind = requireString(record.kind, `${where}.kind`);
      if (!(SURFACE_REQUIREMENT_KINDS as readonly string[]).includes(kind)) {
        fail(`${where}.kind is '${kind}' — outside the requirement vocabulary`);
      }

      const groundedFactLabel = optionalString(record.groundedFactLabel, `${where}.groundedFactLabel`);
      if (kind === 'known') {
        if (groundedFactLabel === undefined) {
          fail(`${where} is classified 'known' but names no groundedFactLabel`);
        }
        if (!factLabels.has(groundedFactLabel)) {
          fail(`${where}.groundedFactLabel '${groundedFactLabel}' was not among the facts supplied`);
        }
      }

      return {
        surfaceElementId,
        kind: kind as SurfaceRequirementKind,
        label: requireString(record.label, `${where}.label`),
        ...(groundedFactLabel !== undefined ? { groundedFactLabel } : {}),
        ...(optionalString(record.note, `${where}.note`) !== undefined
          ? { note: optionalString(record.note, `${where}.note`)! }
          : {}),
      };
    },
  );

  const unclear: UnclearSurfaceElement[] = asArray(root.unclear, 'interpretation.unclear').map((entry, i) => {
    const where = `interpretation.unclear[${i}]`;
    const record = asRecord(entry, where);
    const surfaceElementId = requireString(record.surfaceElementId, `${where}.surfaceElementId`);
    if (!elementIds.has(surfaceElementId)) {
      fail(`${where}.surfaceElementId '${surfaceElementId}' was not present on the surface sent`);
    }
    return { surfaceElementId, note: requireString(record.note, `${where}.note`) };
  });

  return { requirements, unclear };
}
