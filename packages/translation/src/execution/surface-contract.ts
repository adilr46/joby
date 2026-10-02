/** Execution's public interface for inspecting one application page's surface. */

import type { ApplicationSession, SurfaceRequirementKind } from './session';
import type { ExecutionSurface, PageObservation } from './surface-observation';
import type { SurfaceInterpretationResult, UnclearSurfaceElement } from './surface-port';

export interface SurfaceInspectionInput {
  readonly sessionId: string;
  readonly observation: PageObservation;
  /** Simple key facts already available to answer with — a name, an email, a phone number. */
  readonly knownFacts?: readonly { readonly label: string; readonly value: string }[];
}

/** One requirement as recorded onto the session, alongside how it was classified. */
export interface RecordedSurfaceRequirement {
  readonly id: string;
  readonly label: string;
  readonly kind: SurfaceRequirementKind;
  readonly surfaceElementId: string;
}

export interface SurfaceInspectionResult {
  /** The compact surface actually sent for interpretation. */
  readonly surface: ExecutionSurface;
  readonly interpretation: SurfaceInterpretationResult;
  readonly recordedRequirements: readonly RecordedSurfaceRequirement[];
  readonly unclear: readonly UnclearSurfaceElement[];
  readonly session: ApplicationSession;
}

export interface SurfaceInspectionModule {
  /**
   * Observe one page, extract its usable controls, call the interpreter exactly once, ground the
   * result against the surface actually sent, and record what was found onto the session: known
   * facts prefill working state, generated-answer and user-required requirements and portal
   * operations join the checklist unresolved, and anything unclear is noted rather than guessed.
   */
  inspectSurface(input: SurfaceInspectionInput): Promise<SurfaceInspectionResult>;
}
