import { RepresentationReferenceService } from './reference';
import type { IdentityRepresentationModule } from './contract';
import type {
  AddRepresentationReferenceInput,
  ApplyRepresentationDecisionsInput,
  CreateRepresentationInput,
  IdentityRepresentation,
  IdentityRepresentationView,
  PositioningTheme,
  RepresentationReference,
  RepresentationDecision,
  SetPositioningInput,
} from './model';
import type { RepresentationPrior } from './prior';
import type { RepresentationService } from './service';

/** Internal composition facade. Public callers receive only IdentityRepresentationModule. */
export class IdentityRepresentationFacade implements IdentityRepresentationModule {
  constructor(
    private readonly service: RepresentationService,
    private readonly references: RepresentationReferenceService,
  ) {}

  createRepresentation(input: CreateRepresentationInput): Promise<IdentityRepresentation> {
    return this.service.create(input);
  }
  listRepresentations(personId: string): Promise<readonly IdentityRepresentation[]> {
    return this.service.list(personId);
  }
  getRepresentation(id: string): Promise<IdentityRepresentationView | undefined> {
    return this.service.get(id);
  }
  applyRepresentationDecisions(input: ApplyRepresentationDecisionsInput): Promise<{
    revision: number;
    decisions: readonly RepresentationDecision[];
  }> {
    return this.service.applyDecisions(input);
  }
  setRepresentationPositioning(input: SetPositioningInput): Promise<{
    revision: number;
    themes: readonly PositioningTheme[];
  }> {
    return this.service.setPositioning(input);
  }
  getRepresentationPrior(id: string): Promise<RepresentationPrior | undefined> {
    return this.service.getPrior(id);
  }
  addRepresentationReference(input: AddRepresentationReferenceInput): Promise<RepresentationReference> {
    return this.references.add(input);
  }
  listRepresentationReferences(personId: string): Promise<readonly RepresentationReference[]> {
    return this.references.list(personId);
  }
  removeRepresentationReference(id: string): Promise<boolean> {
    return this.references.remove(id);
  }
}
