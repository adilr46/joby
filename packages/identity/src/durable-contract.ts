import type { AddNodeInput, CorrectNodeInput, CorrectionResult } from './correction';
import type { ProfileUnitsView } from './profile-unit';
import type {
  DurableIdentity,
  ExplicitNode,
  ExplicitState,
  PermanentIdentityView,
  Person,
  ProvenanceRecord,
  ReconstructionProposal,
  ReviewRecord,
  SourceLifecycle,
  StatedContext,
} from './model';
import type { ConfirmReviewInput, ConfirmReviewResult } from './review';
import type { CaptureSourceInput, CaptureSourceResult } from './source-capture';
import type { SetStatedContextInput } from './stated-context';

/** Read capabilities over canonical professional truth and evidence. */
export interface DurableIdentityReader {
  getPerson(personId: string): Promise<Person | undefined>;
  getDurableIdentity(personId: string): Promise<DurableIdentity | undefined>;
  getSourceLifecycle(sourceId: string): Promise<SourceLifecycle | undefined>;
  getProposal(proposalId: string): Promise<ReconstructionProposal | undefined>;
  listProposals(personId: string): Promise<readonly ReconstructionProposal[]>;
  getReview(proposalId: string): Promise<ReviewRecord | undefined>;
  getExplicitState(personId: string): Promise<ExplicitState | undefined>;
  getNode(nodeId: string): Promise<ExplicitNode | undefined>;
  listOwnedCanonicalNodeIds(
    personId: string,
    nodeIds: readonly string[],
  ): Promise<readonly string[]>;
  getProvenance(
    subjectType: 'node' | 'relation',
    subjectId: string,
  ): Promise<readonly ProvenanceRecord[]>;
  getPermanentIdentityView(personId: string): Promise<PermanentIdentityView | undefined>;
  /**
   * Canonical truth as **Profile Units** — Context + Contribution + Capabilities + Consequence.
   *
   * The unit a Representation positions and Adaptation recovers evidence in (ADR 0031). Composed at
   * read time from current canonical state; nothing is stored as a unit.
   */
  getProfileUnits(personId: string): Promise<ProfileUnitsView | undefined>;
}

/** Commands that may change Durable Identity-owned state. */
export interface DurableIdentityWriter {
  captureSource(input: CaptureSourceInput): Promise<CaptureSourceResult>;
  confirmReview(input: ConfirmReviewInput): Promise<ConfirmReviewResult>;
  setStatedContext(input: SetStatedContextInput): Promise<{
    readonly revision: number;
    readonly stated: StatedContext;
  }>;
  correctNode(input: CorrectNodeInput): Promise<CorrectionResult>;
  addNode(input: AddNodeInput): Promise<CorrectionResult>;
  removeNode(input: {
    nodeId: string;
    expectedRevision: number;
    correctedBy: string;
  }): Promise<{ revision: number }>;
}

/** The first-class public boundary of the Durable Identity module. */
export interface DurableIdentityModule extends DurableIdentityReader, DurableIdentityWriter {}
