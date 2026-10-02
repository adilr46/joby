/**
 * The surface interpretation boundary.
 *
 * Provider-neutral by design, the same discipline as `@joby/identity`'s `CvExtractor`: the domain
 * depends on this interface, never on a vendor SDK. A deterministic interpreter is the offline
 * default for tests; `ClaudeSurfaceInterpreter` is the real adapter behind the same port.
 */

import type { ExecutionSurface } from './surface-observation';
import type { SurfaceRequirementKind } from './session';

/**
 * What Execution already knows going into one inspection — the only grounding a `known`
 * classification is allowed to point at. The interpreter never reaches into Identity or Adaptation
 * itself; whatever facts are available are handed in by the caller.
 */
export interface SurfaceInterpretationContext {
  readonly role?: string;
  readonly company?: string;
  /** Simple key facts already available to answer with — a name, an email, a phone number. */
  readonly knownFacts: readonly { readonly label: string; readonly value: string }[];
  /** Labels of requirements this session has already resolved, so the same field isn't re-asked. */
  readonly resolvedRequirementLabels: readonly string[];
}

export interface SurfaceInterpretationRequest {
  readonly surface: ExecutionSurface;
  readonly context: SurfaceInterpretationContext;
}

/**
 * One requirement the surface asks for, classified into exactly one of the four kinds the goal
 * names. `surfaceElementId` must be an id that was actually present in the surface sent — grounding
 * is enforced by `parseSurfaceInterpretationResult`, not merely requested by the prompt.
 */
export interface SurfaceRequirement {
  readonly surfaceElementId: string;
  readonly kind: SurfaceRequirementKind;
  readonly label: string;
  /** Required, and only meaningful, when `kind` is `'known'` — which known fact answers this. */
  readonly groundedFactLabel?: string;
  readonly note?: string;
}

/**
 * An element that exists on the surface but whose meaning could not be determined — represented
 * explicitly rather than guessed into one of the four requirement kinds.
 */
export interface UnclearSurfaceElement {
  readonly surfaceElementId: string;
  readonly note: string;
}

export interface SurfaceInterpretationResult {
  readonly requirements: readonly SurfaceRequirement[];
  readonly unclear: readonly UnclearSurfaceElement[];
}

export interface SurfaceInterpretationOutput {
  readonly result: SurfaceInterpretationResult;
  /** Recorded for provenance, same discipline as `ExtractionResult.model`. */
  readonly model: string;
}

export interface SurfaceInterpreter {
  /** Stable identifier, e.g. `claude` or `deterministic`. */
  readonly name: string;
  /**
   * Interpret one execution surface exactly once. Throwing is a normal path — the caller keeps the
   * session exactly as it was and the inspection can be retried.
   */
  interpret(request: SurfaceInterpretationRequest): Promise<SurfaceInterpretationOutput>;
}

/** Raised when a model returns something that is not a usable, groundable interpretation. */
export class SurfaceInterpretationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SurfaceInterpretationError';
  }
}
