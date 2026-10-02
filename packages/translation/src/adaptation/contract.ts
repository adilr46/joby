import type { AdaptedState } from './adapted-state';
import type { RepresentationDraft } from './drafts';
import type { AdaptationContext, AdaptationContextView, CreateAdaptationContextInput } from './model';
import type {
  ApplicationInput,
  ApplicationInputKind,
  DraftSegment,
  ReadinessAssessment,
  RepresentationSurface,
  SurfaceConstraints,
} from './writing';

export type GenerationOutcome =
  | {
      readonly status: 'needs_input';
      readonly readiness: ReadinessAssessment;
      readonly provided: readonly ApplicationInput[];
    }
  | {
      readonly status: 'generated';
      readonly draft: RepresentationDraft;
      readonly readiness: ReadinessAssessment;
      readonly provided: readonly ApplicationInput[];
      readonly references: {
        readonly used: readonly string[];
        readonly provisional: boolean;
        readonly note: string;
      };
    };

/** The first-class public boundary of opportunity-specific Adaptation. */
export interface AdaptationModule {
  createContext(input: CreateAdaptationContextInput): Promise<AdaptationContextView>;
  getContext(contextId: string): Promise<AdaptationContextView | undefined>;
  listContexts(personId: string): Promise<readonly AdaptationContext[]>;
  composeAdaptedState(contextId: string): Promise<AdaptedState | undefined>;
  assessReadiness(input: {
    contextId: string;
    surface: RepresentationSurface;
    question?: string;
    constraints?: SurfaceConstraints;
  }): Promise<{ readiness: ReadinessAssessment; provided: readonly ApplicationInput[] } | undefined>;
  provideApplicationInput(input: {
    contextId: string;
    kind: ApplicationInputKind;
    prompt: string;
    answer: string;
    providedBy: string;
  }): Promise<readonly ApplicationInput[]>;
  generateRepresentation(input: {
    contextId: string;
    surface: RepresentationSurface;
    question?: string;
    constraints?: SurfaceConstraints;
    generatedBy: string;
  }): Promise<GenerationOutcome | undefined>;
  listDrafts(contextId: string): Promise<readonly RepresentationDraft[]>;
  getDraft(draftId: string): Promise<RepresentationDraft | undefined>;
  editDraft(input: {
    draftId: string;
    expectedRevision: number;
    segments: readonly DraftSegment[];
    editedBy: string;
  }): Promise<RepresentationDraft>;
}
