/**
 * Comparing a fresh reconstruction against what Joby already holds.
 *
 * From Release 3 on, most reconstructions land into an identity that is not empty, and the useful
 * question stops being "what does this source say" and becomes "what does this source add".
 *
 * The classification is **behaviour, not schema** (plan `004`): it lives in the proposal draft and
 * decides what confirmation does. No column constrains it.
 *
 * ## Matching is deliberately conservative
 *
 * Normalised label equality only — lowercase, `-`/`_` to spaces, collapsed whitespace, trailing
 * punctuation dropped. That is enough for `rota-scheduler` ↔ `Rota scheduler`, which is the real
 * case when a CV project and a GitHub repository are the same work.
 *
 * It refuses to go further. Fuzzy similarity would merge two genuinely different roles at the same
 * employer, and merging rewrites someone's history in a way they may never notice. A near-miss is
 * classified `new`; the user can exclude it. That failure is visible and recoverable. The other
 * one is not.
 */

import type {
  ActivityNode,
  DeltaAnnotation,
  ExplicitNode,
  FieldDelta,
  ProposedActivity,
  ProposedRelation,
  ProposedStructure,
  ReconstructedState,
  ReconstructionProposalContent,
  StructureNode,
} from './model';

/** Shape normalisation for matching. Never applied to stored values. */
export function normaliseLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function indexByLabel(nodes: readonly ExplicitNode[]): Map<string, ExplicitNode> {
  const index = new Map<string, ExplicitNode>();
  for (const node of nodes) {
    const key = `${node.type}:${normaliseLabel(node.label)}`;
    // First wins. If the identity already contains two nodes with the same normalised label, the
    // ambiguity is pre-existing and this is not the place to resolve it.
    if (!index.has(key)) index.set(key, node);
  }
  return index;
}

function sameText(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return false;
  return normaliseLabel(a) === normaliseLabel(b);
}

/**
 * Classify a structure candidate against an existing node.
 *
 * A date the source states where E has none is enrichment. A *different* date where E already has
 * one is a conflict — not a correction, and never applied by deciding which source looks better.
 */
function classifyStructure(candidate: ProposedStructure, existing: StructureNode): DeltaAnnotation {
  const changes: FieldDelta[] = [];
  let conflicting = false;
  let enriching = false;
  let clarifying = false;

  for (const field of ['startedAt', 'endedAt'] as const) {
    const proposed = candidate[field];
    const current = existing[field];
    if (proposed === undefined) continue;

    if (current === undefined) {
      enriching = true;
      changes.push({ field, proposed });
    } else if (!sameText(proposed, current)) {
      // Two sources disagree about when something happened. Surfaced, never resolved here.
      conflicting = true;
      changes.push({ field, current, proposed });
    } else if (proposed !== current) {
      // Same meaning, different precision or formatting.
      clarifying = true;
      changes.push({ field, current, proposed });
    }
  }

  const classification = conflicting
    ? 'conflict'
    : enriching
      ? 'enrichment'
      : clarifying
        ? 'clarification'
        : 'duplicate';

  return { classification, matchedId: existing.id, ...(changes.length > 0 ? { changes } : {}) };
}

function classifyActivity(candidate: ProposedActivity, existing: ActivityNode): DeltaAnnotation {
  const changes: FieldDelta[] = [];
  let conflicting = false;
  let enriching = false;

  for (const field of ['contribution', 'consequence'] as const) {
    const proposed = candidate[field];
    const current = existing[field];
    if (proposed === undefined) continue;

    if (current === undefined) {
      // The component was absent. This is the enrichment case the whole slice exists for: a
      // consequence arriving from a second source, rather than a near-duplicate activity.
      enriching = true;
      changes.push({ field, proposed });
    } else if (!sameText(proposed, current)) {
      conflicting = true;
      changes.push({ field, current, proposed });
    }
  }

  if (candidate.capability && candidate.capability.length > 0) {
    const current = existing.capability ?? [];
    const added = candidate.capability.filter(
      (capability) => !current.some((held) => sameText(held, capability)),
    );
    if (added.length > 0) {
      // Capability is additive: a second source naming another language does not contradict the
      // first, it adds to it.
      enriching = true;
      changes.push({ field: 'capability', current, proposed: added });
    }
  }

  const classification = conflicting ? 'conflict' : enriching ? 'enrichment' : 'duplicate';
  return { classification, matchedId: existing.id, ...(changes.length > 0 ? { changes } : {}) };
}

/**
 * Annotate every candidate in a proposal with how it relates to current Explicit State.
 *
 * Pure: it reads state and returns a new proposal. Nothing is written, and nothing about the
 * person changes until a review is confirmed.
 */
export function classifyAgainstState(
  content: ReconstructionProposalContent,
  state: ReconstructedState,
): ReconstructionProposalContent {
  const nodes = indexByLabel([...state.structure, ...state.activities]);

  /** Candidate item id → the canonical node it resolved to, for relation endpoints. */
  const resolved = new Map<string, string>();

  const structure = content.structure.map((candidate) => {
    const existing = nodes.get(`structure:${normaliseLabel(candidate.label)}`);
    if (!existing || existing.type !== 'structure') return { ...candidate, delta: { classification: 'new' as const } };

    resolved.set(candidate.id, existing.id);
    return { ...candidate, delta: classifyStructure(candidate, existing) };
  });

  const activities = content.activities.map((candidate) => {
    const existing = nodes.get(`activity:${normaliseLabel(candidate.label)}`);
    if (!existing || existing.type !== 'activity') return { ...candidate, delta: { classification: 'new' as const } };

    resolved.set(candidate.id, existing.id);
    return { ...candidate, delta: classifyActivity(candidate, existing) };
  });

  const relations = content.relations.map((candidate) => annotateRelation(candidate, resolved, state));

  return { ...content, structure, activities, relations };
}

function annotateRelation(
  candidate: ProposedRelation,
  resolved: Map<string, string>,
  state: ReconstructedState,
): ProposedRelation {
  const fromNodeId = resolved.get(candidate.fromId);
  const toNodeId = resolved.get(candidate.toId);

  // Both endpoints already exist: the only new thing is the connection between them.
  if (fromNodeId && toNodeId) {
    const existing = state.relations.find(
      (relation) =>
        relation.kind === candidate.kind &&
        relation.fromNodeId === fromNodeId &&
        relation.toNodeId === toNodeId,
    );

    return {
      ...candidate,
      delta: existing
        ? { classification: 'duplicate', matchedId: existing.id }
        : { classification: 'relation' },
    };
  }

  return { ...candidate, delta: { classification: 'new' } };
}

/** True when confirming this item would change canonical state rather than only its provenance. */
export function changesState(annotation: DeltaAnnotation | undefined): boolean {
  if (!annotation) return true;
  return annotation.classification !== 'duplicate';
}
