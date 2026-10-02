/** Public contract of the Adaptation module. */

export type { AdaptationModule, GenerationOutcome } from './contract';
export { createAdaptation, type CreateAdaptationOptions } from './factory';

export {
  AdaptationConcurrencyError,
  AdaptationContextNotFoundError,
  InvalidAdaptationContextError,
  OpportunityNotUnderstoodError,
} from './service';
export { WritingError } from './writing';

export type {
  AdaptationDurableIdentityReader,
  AdaptationRepresentationReader,
  OpportunityUnderstandingPort,
  OpportunityUnderstandingView,
} from './ports';
export type {
  AdaptationContext,
  AdaptationContextView,
  ConditionAlignment,
  ConditionComparison,
  ContextIntersection,
  CreateAdaptationContextInput,
  OpportunityContext,
  UserContext,
} from './model';
export type {
  AdaptedElement,
  AdaptedState,
  BaselineAssessment,
  EvidenceOrigin,
  RepresentationAssessment,
  RepresentationGap,
  RepresentationVerdict,
} from './adapted-state';
export { buildCvRenderPlan, CvRenderPlanError } from './cv-render-plan';
export type {
  CvRenderPlan,
  CvRenderPlanEntry,
  CvRenderSurface,
} from './cv-render-plan';
export {
  toGeneratedLatexPayload,
  toHtmlPdfPayload,
  toLatexTexPatchManifest,
} from './cv-render-adapters';
export type {
  HtmlPdfCvEntry,
  HtmlPdfCvPayload,
  LatexCvEntry,
  LatexCvPayload,
} from './cv-render-adapters';
export type { RepresentationDraft } from './drafts';
export type { ApplicationIntent, FastFeedback } from './information-seams';
export type {
  ApplicationInput,
  ApplicationInputKind,
  DraftSegment,
  InputRequest,
  ReadinessAssessment,
  RepresentationSurface,
  SurfaceConstraints,
} from './writing';
export {
  applyLatexTexPatches,
  escapeLatexText,
  extractLatexTexContent,
  resolveLatexTexSource,
} from './latex-tex';
export type {
  LatexTexLayoutFamily,
  LatexTexManifest,
  LatexTexPatch,
  LatexTexPatchManifest,
  LatexTexSlot,
  LatexTexSourceResolution,
} from './latex-tex';
