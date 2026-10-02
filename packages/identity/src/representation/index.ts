/** Public contract of the Identity Representation module. */

export type {
  IdentityRepresentationModule,
  IdentityRepresentationReader,
  IdentityRepresentationWriter,
} from './contract';
export { createIdentityRepresentation } from './factory';

export {
  DuplicateRepresentationError,
  InvalidRepresentationError,
  RepresentationNotFoundError,
} from './service';
export { InvalidRepresentationReferenceError } from './reference';

export type {
  AddRepresentationReferenceInput,
  ApplyRepresentationDecisionsInput,
  CreateRepresentationInput,
  IdentityRepresentation,
  IdentityRepresentationView,
  PositionedEntry,
  PositioningTheme,
  RepresentationReference,
  RepresentationReferenceKind,
  RepresentationDecision,
  RepresentationDecisionInput,
  RepresentationEmphasis,
  RepresentationGrounding,
  RepresentationPositioning,
  RepresentationSection,
  SetPositioningInput,
} from './model';
export type { EvidencePreference, RepresentationPrior } from './prior';
