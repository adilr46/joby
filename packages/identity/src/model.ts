/**
 * Identity domain types.
 *
 *   D = (E, X)   R = (Structure, Activity, Relations)
 *
 * There is no `L` component: PCI is an independent learned model owned by Memory / PCI
 * (ADR 0030), not learned person-state this package holds.
 *
 * Release 1 produces **proposals** about R. Nothing here is canonical: canonical Reconstructed
 * State arrives in Release 2, behind user confirmation. See `packages/identity/CLAUDE.md`.
 */

/** `Observed` / `Inferred` / `Hypothesized` never collapse into each other. */
export type EpistemicStatus = 'observed' | 'inferred' | 'hypothesized';

export const RELATION_KINDS = ['occurred_within', 'associated_with', 'uses_capability'] as const;

/**
 * The deliberately small relation vocabulary (ADR 0009). Candidates, not permanent ontology.
 * There is no `related_to`: a link that means nothing in particular cannot be queried and cannot
 * be explained to the user.
 */
export type RelationKind = (typeof RELATION_KINDS)[number];

/**
 * Where a proposed fact came from, precisely enough for a person to check it.
 *
 * The character range is what makes provenance *atomic*: a reviewer can be shown the exact words
 * behind a single proposed consequence, not "somewhere in this CV".
 */
export interface SourceReference {
  readonly sourceId: string;
  /** The text the extractor claims supports this, quoted verbatim from the source. */
  readonly quote: string;
  /** Character offsets into the extracted source text, when the extractor can supply them. */
  readonly startOffset?: number;
  readonly endOffset?: number;
}

/**
 * How a candidate relates to what Joby already holds.
 *
 * **Behaviour, not schema.** These drive what confirmation does; no column constrains them, so the
 * vocabulary can change without a migration (roadmap R3: these labels must not become permanent
 * schema enums).
 *
 * - `new` — nothing in E matches.
 * - `enrichment` — matches a node and fills a component that was **absent**.
 * - `clarification` — matches a node and refines a value that was **present**, without contradicting it.
 * - `relation` — both endpoints already exist; only the edge is new.
 * - `duplicate` — matches a node and adds nothing. Confirming records a second source for the same fact.
 * - `conflict` — matches a node and **contradicts** it. Applies nothing unless the user picks a side.
 */
export type DeltaClassification =
  | 'new'
  | 'enrichment'
  | 'clarification'
  | 'relation'
  | 'duplicate'
  | 'conflict';

/** What a candidate would change about an existing fact, shown side by side for review. */
export interface FieldDelta {
  readonly field: string;
  readonly current?: string | readonly string[];
  readonly proposed?: string | readonly string[];
}

/** How a candidate lines up against current Explicit State. Absent on a first reconstruction. */
export interface DeltaAnnotation {
  readonly classification: DeltaClassification;
  /** The canonical node or relation this candidate matched, when it matched one. */
  readonly matchedId?: string;
  /** Field-by-field, so a reviewer sees exactly what would change and what it would replace. */
  readonly changes?: readonly FieldDelta[];
}

interface Proposed {
  /** Stable within a proposal, so review decisions in R2 can address one item. */
  readonly id: string;
  /**
   * Set from Release 3 on. Absent means this proposal predates delta classification, and every
   * item should be treated as `new`.
   */
  readonly delta?: DeltaAnnotation;
  readonly epistemicStatus: EpistemicStatus;
  /**
   * What the extractor was unsure about, in words, per item.
   *
   * A field, never hedging prose inside the content itself, and never one confidence number for a
   * whole document — the reviewer needs to know precisely *where* the uncertainty is.
   */
  readonly uncertainty?: string;
  readonly sources: readonly SourceReference[];
}

/** Where and within what. Never what was done. */
export interface ProposedStructure extends Proposed {
  readonly kind: 'institution' | 'organisation' | 'programme' | 'role' | 'engagement' | 'team' | 'period';
  readonly label: string;
  /**
   * Dates exactly as the source gives them — `2023`, `summer 2024`, `Sept 2022–present`.
   *
   * Deliberately a string. A date type would force a precision the source does not have, and the
   * pressure would be to invent the missing part. A vague date stays vague.
   */
  readonly startedAt?: string;
  readonly endedAt?: string;
}

/**
 * What the person did: aᵢ = (Contributionᵢ, Capabilityᵢ, Consequenceᵢ).
 *
 * **All three are optional and any subset is valid.** A sparse activity is finished, not partial:
 * a contribution with no consequence stays that way. Nothing may infer a missing component from
 * the ones that are present — that is fabrication with a schema's blessing.
 */
export interface ProposedActivity extends Proposed {
  readonly label: string;
  readonly contribution?: string;
  readonly capability?: readonly string[];
  readonly consequence?: string;
}

export interface ProposedRelation extends Proposed {
  readonly kind: RelationKind;
  /** Ids of proposed items within the same proposal. */
  readonly fromId: string;
  readonly toId: string;
}

/**
 * Two sources, or two parts of one source, that cannot both be true.
 *
 * Surfaced, never resolved by picking the more flattering version. The user decides.
 */
export interface ProposedConflict {
  readonly id: string;
  readonly description: string;
  /** The proposed items in tension. */
  readonly itemIds: readonly string[];
  readonly sources: readonly SourceReference[];
}

/** The full draft: everything the extractor proposes about one source. */
export interface ReconstructionProposalContent {
  readonly structure: readonly ProposedStructure[];
  readonly activities: readonly ProposedActivity[];
  readonly relations: readonly ProposedRelation[];
  readonly conflicts: readonly ProposedConflict[];
  /**
   * What the extractor could not tell from this source at all.
   *
   * "Not enough evidence" is a designed, presentable outcome, not a failure (ADR 0008). Sparse is
   * the normal case for a placement student, and it must survive to the reviewer intact.
   */
  readonly notes?: readonly string[];
}

export const EMPTY_PROPOSAL: ReconstructionProposalContent = {
  structure: [],
  activities: [],
  relations: [],
  conflicts: [],
};

// --- Records as stored -------------------------------------------------------------------

export interface Person {
  readonly id: string;
  readonly durableIdentityId: string;
  readonly createdAt: string;
}

export type SourceKind = 'cv' | 'github_repository';

/**
 * Whether the source itself is public.
 *
 * Travels with everything derived from it: a fact whose only evidence is a private repository must
 * not become disclosable merely because it reached Explicit State.
 */
export type SourceVisibility = 'private' | 'public';

export interface ProfessionalSource {
  readonly id: string;
  readonly personId: string;
  readonly kind: SourceKind;
  readonly contentType: string;
  readonly filename?: string;
  readonly byteSize: number;
  readonly checksum: string;
  readonly visibility: SourceVisibility;
  /** The source's identifier at origin, e.g. `octocat/rota-scheduler`. */
  readonly externalRef?: string;
  /** What it looked like when captured, e.g. a pushed-at timestamp. Drives refresh. */
  readonly sourceVersion?: string;
  readonly capturedAt: string;
}

/** Every reconstruction traces to something the user did. There is no scheduled trigger. */
export type ReconstructionTrigger = 'source_added' | 'selection_changed' | 'refresh';

export type ReconstructionJobStatus = 'pending' | 'processing' | 'succeeded' | 'failed';

export interface ReconstructionJob {
  readonly id: string;
  readonly personId: string;
  readonly sourceId: string;
  readonly trigger: ReconstructionTrigger;
  readonly status: ReconstructionJobStatus;
  readonly attempts: number;
  readonly claimedAt?: string;
  readonly completedAt?: string;
  readonly lastError?: string;
  readonly createdAt: string;
}

/**
 * `proposed` → `confirmed`. A confirmed proposal is not itself canonical — it records that this
 * draft was reviewed, so it cannot be applied a second time.
 */
export type ProposalStatus = 'proposed' | 'confirmed';

export interface ReconstructionProposal {
  readonly id: string;
  readonly personId: string;
  readonly sourceId: string;
  readonly jobId: string;
  readonly status: ProposalStatus;
  readonly extractor: string;
  readonly model: string;
  readonly content: ReconstructionProposalContent;
  readonly generatedAt: string;
}

// --- Canonical Explicit State ------------------------------------------------------------
//
// From here on, these are facts about the person. Everything above is a proposal about them, and
// the difference is the entire point of the review step between them.

export type StructureKind = ProposedStructure['kind'];

/** Where and within what. Never what was done. */
export interface StructureNode {
  readonly id: string;
  readonly type: 'structure';
  readonly kind: StructureKind;
  readonly label: string;
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly epistemicStatus: EpistemicStatus;
  /** Per-node optimistic concurrency token. Corrections must supply the one they read. */
  readonly revision: number;
}

/**
 * What the person did. The three components stay independent, and **any subset is valid** —
 * enforced by a database CHECK, not only by code.
 */
export interface ActivityNode {
  readonly id: string;
  readonly type: 'activity';
  readonly label: string;
  readonly contribution?: string;
  readonly capability?: readonly string[];
  readonly consequence?: string;
  readonly epistemicStatus: EpistemicStatus;
  readonly revision: number;
}

export type ExplicitNode = StructureNode | ActivityNode;

export interface RelationEdge {
  readonly id: string;
  readonly kind: RelationKind;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly epistemicStatus: EpistemicStatus;
  readonly revision: number;
}

/** R = (Structure, Activity, Relations). */
export interface ReconstructedState {
  readonly structure: readonly StructureNode[];
  readonly activities: readonly ActivityNode[];
  readonly relations: readonly RelationEdge[];
}

/**
 * The closed vocabulary of comparable user conditions (ADR 0017).
 *
 * Small and closed for the same reason the relation vocabulary is (ADR 0009): a condition kind that
 * means nothing in particular cannot be compared against an opportunity or explained to the person.
 * Drawn from the placement wedge; it grows only when a real comparison needs it.
 */
export const USER_CONDITION_KINDS = [
  'location',
  'duration',
  'work_arrangement',
  'start_date',
  'work_authorisation',
  'sponsorship',
  'availability',
] as const;

export type UserConditionKind = (typeof USER_CONDITION_KINDS)[number];

/**
 * One condition the person has stated about their situation.
 *
 * `values` are their words, held verbatim — 'Bristol', '12 months', 'September 2026'. Comparison
 * normalises at read time; nothing reshapes what they said, and **nothing infers a condition they
 * did not state.**
 */
export interface UserCondition {
  readonly kind: UserConditionKind;
  /** One or more acceptable values. Bristol *or* Bath is one condition, not two. */
  readonly values: readonly string[];
  /** Anything the kinds cannot carry, in their own words. */
  readonly note?: string;
  readonly statedAt: string;
  readonly statedBy: string;
}

/**
 * X = (CareerDirection, Preferences, Constraints).
 *
 * **Only the user writes it** (ADR 0011 invariant 4) — no AI path, no inference, no default value.
 *
 * Career direction and preferences stay opaque free text. `constraints` likewise: it holds anything
 * about a person's situation that the typed vocabulary cannot express, and it is not a lesser
 * version of `conditions`. `conditions` is the small typed subset that has to be *comparable*
 * against an opportunity (ADR 0017).
 *
 * Empty-but-present remains meaningful: a consumer must see that Stated Context exists and is unset,
 * not that it is unsupported.
 */
export interface StatedContext {
  readonly careerDirection?: string;
  readonly preferences?: readonly string[];
  readonly constraints?: readonly string[];
  readonly conditions?: readonly UserCondition[];
}

/** E = (R, X). */
export interface ExplicitState {
  readonly reconstructed: ReconstructedState;
  readonly stated: StatedContext;
  /** Identity-level revision. Guards whole-set transitions against silent overwrite. */
  readonly revision: number;
}

/**
 * Durable Identity: authoritative professional truth about the person.
 *
 * **`E` and `X` only. There is deliberately no `learned` / `L` component here.** PCI is an
 * independent learned model of recurring person x professional-world relationships, owned by
 * Memory / PCI — not learned person-state this module holds. Durable Identity owns what is
 * professionally *true*; PCI owns what Joby has come to *believe* about how this person and the
 * world interact. Those are different claims with different owners.
 *
 * An always-null `learned` field here taught the opposite: that PCI is a Durable Identity component
 * merely awaiting implementation. Asking this module for learned state is asking the wrong owner,
 * and the type should not invite it.
 */
export interface DurableIdentity {
  readonly personId: string;
  readonly durableIdentityId: string;
  readonly explicit: ExplicitState;
}

// --- Representation References (ADR 0021) --------------------------------------------------
//
// Persistent, user-owned **expression** material. Identity-owned and, like a professional source,
// never canonical identity: nothing reconstructs from one, and no claim may cite one as grounding.


/**
 * A piece of the person's own writing, kept so Joby can sound like them.
 *
 * It answers *how does this person write?* — never *what has this person done?* A previous cover
 * letter may claim things that were overstated or are no longer true; none of it is a fact here.
 */

// --- GitHub -------------------------------------------------------------------------------

export interface GitHubConnection {
  readonly id: string;
  readonly personId: string;
  readonly accountLogin: string;
  readonly connectedAt: string;
}

/** A repository the user has, or has not, allowed Joby to look at. */
export interface RepositorySelection {
  readonly id: string;
  readonly personId: string;
  readonly fullName: string;
  readonly selected: boolean;
  readonly isPrivate: boolean;
  readonly selectedAt: string;
}

// --- The Permanent Identity View (UC11) ----------------------------------------------------

/**
 * A familiar section, derived from Reconstructed State at read time.
 *
 * There is no store behind any of this. Education, Experience, Projects, Skills, Achievements and
 * Evidence are projections (ADR 0009) — materialising them would recreate the competing canonical
 * models the S/A/R ontology exists to prevent.
 */
export interface ViewEntry {
  readonly nodeId: string;
  readonly title: string;
  readonly detail?: string;
  readonly startedAt?: string;
  readonly endedAt?: string;
  /**
   * The activity's own capability components, verbatim.
   *
   * Already aggregated across activities under Skills; carried here too so a consumer can ask *which
   * work* evidences a capability without matching on labels. Canonical either way — this is the
   * `Capability` component of `aᵢ`, not a derived claim.
   */
  readonly capabilities?: readonly string[];
  readonly epistemicStatus: EpistemicStatus;
  /** Private unless every source behind this fact is public. */
  readonly visibility: SourceVisibility;
  readonly activities?: readonly ViewEntry[];
}

export interface SkillEntry {
  readonly capability: string;
  /** The activities that evidence it — a skill is never a claim standing on its own. */
  readonly evidencedBy: readonly string[];
  readonly visibility: SourceVisibility;
}

export interface EvidenceEntry {
  readonly nodeId: string;
  readonly label: string;
  readonly sourceId?: string;
  readonly quote?: string;
  readonly origin: ProvenanceRecord['origin'];
  readonly visibility: SourceVisibility;
}

export interface PermanentIdentityView {
  readonly personId: string;
  readonly revision: number;
  readonly education: readonly ViewEntry[];
  readonly experience: readonly ViewEntry[];
  readonly projects: readonly ViewEntry[];
  readonly skills: readonly SkillEntry[];
  readonly achievements: readonly ViewEntry[];
  readonly evidence: readonly EvidenceEntry[];
}

/** Where a confirmed fact came from. Identity-owned; not a Memory EvidenceItem (plan `003`). */
export interface ProvenanceRecord {
  readonly id: string;
  readonly subjectType: 'node' | 'relation';
  readonly subjectId: string;
  readonly origin: 'reconstruction' | 'user_supplement' | 'user_correction';
  readonly sourceId?: string;
  readonly proposalId?: string;
  readonly proposalItemId?: string;
  readonly quote?: string;
  readonly startOffset?: number;
  readonly endOffset?: number;
  readonly recordedAt: string;
  readonly recordedBy: string;
}

// --- Review ------------------------------------------------------------------------------

/**
 * What the user decided about one proposed item.
 *
 * `exclude` and `reject` both keep the item out of Explicit State and are deliberately separate:
 * "not this, not now" and "this is wrong" mean different things, and only the history remembers
 * which — the resulting Explicit State looks identical either way.
 */
export type ReviewDecisionKind = 'retain' | 'edit' | 'exclude' | 'reject' | 'supplement';

export interface ReviewDecisionRecord {
  readonly id: string;
  readonly proposalItemId?: string;
  readonly decision: ReviewDecisionKind;
  readonly proposed?: unknown;
  readonly edited?: unknown;
  readonly appliedType?: 'node' | 'relation';
  readonly appliedId?: string;
}

export interface ReviewRecord {
  readonly id: string;
  readonly personId: string;
  readonly proposalId: string;
  readonly revision: number;
  readonly confirmedAt: string;
  readonly confirmedBy: string;
  readonly decisions: readonly ReviewDecisionRecord[];
}

export interface CorrectionRecord {
  readonly id: string;
  readonly subjectType: 'node' | 'relation';
  readonly subjectId: string;
  readonly operation: 'add' | 'update' | 'remove';
  readonly before?: unknown;
  readonly after?: unknown;
  readonly correctedAt: string;
  readonly correctedBy: string;
}

/**
 * The three lifecycle facts, kept distinct.
 *
 * Deliberately not one status field. "The CV is stored", "a reconstruction exists" and "the user
 * confirmed it" are different facts with different consequences, and collapsing them makes it
 * impossible to answer the one that matters: has anything become true about this person?
 */
export interface SourceLifecycle {
  readonly source: ProfessionalSource;
  /** Fact 1: the source was captured successfully. Always true if you are holding this. */
  readonly captured: true;
  /** Fact 2: a reconstruction was generated. */
  readonly reconstruction: ReconstructionJob;
  readonly proposalId?: string;
  /**
   * Fact 3: reconstructed Explicit State was reviewed and confirmed.
   *
   * A generated reconstruction is not a confirmed one. Kept separate from fact 2 so no consumer
   * can mistake "we extracted something" for "this is true about the person".
   */
  readonly confirmed: boolean;
  readonly reviewId?: string;
}
