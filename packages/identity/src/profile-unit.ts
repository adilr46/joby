/**
 * **Profile Units** — the canonical unit of professional truth (ADR 0031).
 *
 * ```text
 * ProfileUnit = Context + Contribution + Capabilities + Consequence
 * ```
 *
 * One coherent professional unit: *what the person did, where it happened, what it demonstrated and
 * what came of it*. This is the shape Identity exposes and Representations position over, and it is
 * the unit Adaptation recovers evidence in.
 *
 * **Composed from canonical state, not a second store.** A unit's identity is its Activity node; its
 * Context is the Structure it `occurred_within`. That relationship already exists in `E`, so a Profile
 * Unit is the *reading* of canonical truth as a unit rather than a copy of it — there is no
 * `profile_unit` table, nothing to migrate, and no way for a unit to drift from the facts it is made
 * of. A correction to an activity changes its unit on the next read, with no refresh path.
 *
 * **Any subset is still valid.** A unit with a contribution and no consequence is finished, not
 * partial, and nothing here invites completion of a missing component (ADR 0009).
 */

import type {
  ActivityNode,
  EpistemicStatus,
  ExplicitNode,
  ProvenanceRecord,
  ReconstructedState,
  SourceVisibility,
  StructureKind,
  StructureNode,
} from './model';

/** Where a unit happened: the Structure it occurred within, when there is one. */
export interface ProfileUnitContext {
  readonly nodeId: string;
  readonly kind: StructureKind;
  readonly label: string;
  readonly startedAt?: string;
  readonly endedAt?: string;
}

export interface ProfileUnit {
  /** The canonical Activity node this unit is. Representations key their decisions on it. */
  readonly nodeId: string;
  readonly title: string;
  /**
   * Absent for a unit with no structural home — a personal project nobody employed them to do is a
   * complete unit, not a defective one.
   */
  readonly context?: ProfileUnitContext;
  readonly contribution?: string;
  /** The activity's own `Capability` components, verbatim. Canonical, never a derived claim. */
  readonly capabilities: readonly string[];
  readonly consequence?: string;
  readonly epistemicStatus: EpistemicStatus;
  /** Private unless every source behind the unit is public. */
  readonly visibility: SourceVisibility;
}

export interface ProfileUnitsInput {
  readonly personId: string;
  readonly revision: number;
  readonly state: ReconstructedState;
  readonly provenance: ReadonlyMap<string, readonly ProvenanceRecord[]>;
  readonly sourceVisibility: ReadonlyMap<string, SourceVisibility>;
}

export interface ProfileUnitsView {
  readonly personId: string;
  readonly revision: number;
  readonly units: readonly ProfileUnit[];
}

const isActivity = (node: ExplicitNode): node is ActivityNode => node.type === 'activity';

/**
 * A unit is public only if it has provenance and every source behind it is public.
 *
 * The safe direction, and the same rule the Permanent Identity View uses: no provenance, an unknown
 * source, or any private source ⇒ private. Visibility must survive being read as a unit, or a
 * private source would become disclosable merely by being composed differently.
 */
function visibilityOf(
  subjectIds: readonly string[],
  provenance: ProfileUnitsInput['provenance'],
  sources: ProfileUnitsInput['sourceVisibility'],
): SourceVisibility {
  let sawAny = false;
  for (const subjectId of subjectIds) {
    const records = provenance.get(subjectId) ?? [];
    if (records.length === 0) continue;
    sawAny = true;
    for (const record of records) {
      if (!record.sourceId) return 'private';
      if (sources.get(record.sourceId) !== 'public') return 'private';
    }
  }
  return sawAny ? 'public' : 'private';
}

/**
 * Compose the person's Profile Units from canonical state.
 *
 * Deterministic and ordered by the activity's canonical order, so two reads of unchanged state give
 * the same units in the same order.
 */
export function composeProfileUnits(input: ProfileUnitsInput): ProfileUnitsView {
  const structureById = new Map<string, StructureNode>(
    input.state.structure.map((node) => [node.id, node]),
  );

  // An activity's Context is the Structure it occurred within. Where several exist — a role inside
  // an organisation — the first canonical relation wins; the rest remain reachable through `E`.
  const contextOf = new Map<string, StructureNode>();
  for (const relation of input.state.relations) {
    if (relation.kind !== 'occurred_within') continue;
    if (contextOf.has(relation.fromNodeId)) continue;
    const structure = structureById.get(relation.toNodeId);
    if (structure) contextOf.set(relation.fromNodeId, structure);
  }

  const units = input.state.activities.filter(isActivity).map((activity): ProfileUnit => {
    const structure = contextOf.get(activity.id);
    const context: ProfileUnitContext | undefined = structure
      ? {
          nodeId: structure.id,
          kind: structure.kind,
          label: structure.label,
          ...(structure.startedAt ? { startedAt: structure.startedAt } : {}),
          ...(structure.endedAt ? { endedAt: structure.endedAt } : {}),
        }
      : undefined;

    return {
      nodeId: activity.id,
      title: activity.label,
      ...(context ? { context } : {}),
      ...(activity.contribution ? { contribution: activity.contribution } : {}),
      capabilities: activity.capability ?? [],
      ...(activity.consequence ? { consequence: activity.consequence } : {}),
      epistemicStatus: activity.epistemicStatus,
      visibility: visibilityOf(
        structure ? [activity.id, structure.id] : [activity.id],
        input.provenance,
        input.sourceVisibility,
      ),
    };
  });

  return { personId: input.personId, revision: input.revision, units };
}
