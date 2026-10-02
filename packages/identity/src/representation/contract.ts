import type { RepresentationReference } from './model';
import type {
  AddRepresentationReferenceInput,
  ApplyRepresentationDecisionsInput,
  CreateRepresentationInput,
  IdentityRepresentation,
  IdentityRepresentationView,
  PositioningTheme,
  RepresentationDecision,
  SetPositioningInput,
} from './model';
import type { RepresentationPrior } from './prior';

/** Read-only access to persistent, reusable positioning lenses and expression material. */
export interface IdentityRepresentationReader {
  listRepresentations(personId: string): Promise<readonly IdentityRepresentation[]>;
  getRepresentation(representationId: string): Promise<IdentityRepresentationView | undefined>;
  getRepresentationPrior(representationId: string): Promise<RepresentationPrior | undefined>;
  listRepresentationReferences(personId: string): Promise<readonly RepresentationReference[]>;
}

/** Commands that mutate only Identity Representation-owned state. */
export interface IdentityRepresentationWriter {
  createRepresentation(input: CreateRepresentationInput): Promise<IdentityRepresentation>;
  applyRepresentationDecisions(input: ApplyRepresentationDecisionsInput): Promise<{
    readonly revision: number;
    readonly decisions: readonly RepresentationDecision[];
  }>;
  setRepresentationPositioning(input: SetPositioningInput): Promise<{
    readonly revision: number;
    readonly themes: readonly PositioningTheme[];
  }>;
  addRepresentationReference(input: AddRepresentationReferenceInput): Promise<RepresentationReference>;
  removeRepresentationReference(referenceId: string): Promise<boolean>;
}

/** The first-class public boundary of the Identity Representation module. */
export interface IdentityRepresentationModule
  extends IdentityRepresentationReader,
    IdentityRepresentationWriter {}
