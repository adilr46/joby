/**
 * The Permanent Identity View (UC11).
 *
 * Education, Experience, Projects, Skills, Achievements and Evidence — **derived from Reconstructed
 * State at read time**. Nothing here is stored, and storing it would recreate exactly the competing
 * canonical models the S/A/R ontology exists to prevent (ADR 0009).
 *
 * Two things this projection is responsible for beyond arranging data:
 *
 *  - **Skills are derived, never maintained.** A capability appears because an activity evidences
 *    it, and it carries the activities that do. A skill with nothing behind it cannot be produced
 *    here, which is Product Doctrine 4 holding where it usually breaks.
 *  - **Visibility survives.** A fact is private unless *every* source behind it is public. That
 *    rule lives here because this is the layer things get read out of.
 */

import type {
  ActivityNode,
  EvidenceEntry,
  ExplicitNode,
  PermanentIdentityView,
  ProvenanceRecord,
  ReconstructedState,
  SkillEntry,
  SourceVisibility,
  StructureNode,
  ViewEntry,
} from './model';

/** Which Structure kinds read as education rather than employment. */
const EDUCATION_KINDS = new Set(['institution', 'programme']);
const EXPERIENCE_KINDS = new Set(['organisation', 'role', 'team']);

export interface ProjectionInput {
  readonly personId: string;
  readonly revision: number;
  readonly state: ReconstructedState;
  /** Provenance for every node and relation, so evidence and visibility can be resolved. */
  readonly provenance: ReadonlyMap<string, readonly ProvenanceRecord[]>;
  /** Source id → whether that source is public. */
  readonly sourceVisibility: ReadonlyMap<string, SourceVisibility>;
}

/**
 * A fact is public only if it has provenance and every source behind it is public.
 *
 * The safe direction: no provenance, an unknown source, or any private source ⇒ private. A
 * user-authored fact has no source, so it is private too — the person has not said they want it
 * shared merely by recording it.
 */
function visibilityOf(
  subjectId: string,
  provenance: ProjectionInput['provenance'],
  sources: ProjectionInput['sourceVisibility'],
): SourceVisibility {
  const records = provenance.get(subjectId) ?? [];
  if (records.length === 0) return 'private';

  for (const record of records) {
    if (!record.sourceId) return 'private';
    if (sources.get(record.sourceId) !== 'public') return 'private';
  }
  return 'public';
}

function entryFor(node: ExplicitNode, input: ProjectionInput): ViewEntry {
  const visibility = visibilityOf(node.id, input.provenance, input.sourceVisibility);

  if (node.type === 'structure') {
    return {
      nodeId: node.id,
      title: node.label,
      epistemicStatus: node.epistemicStatus,
      visibility,
      ...(node.startedAt ? { startedAt: node.startedAt } : {}),
      ...(node.endedAt ? { endedAt: node.endedAt } : {}),
    };
  }

  return {
    nodeId: node.id,
    title: node.label,
    epistemicStatus: node.epistemicStatus,
    visibility,
    // The contribution is the detail. A consequence, when there is one, surfaces under
    // Achievements — sparse activities therefore appear in full without looking incomplete.
    ...(node.contribution ? { detail: node.contribution } : {}),
    // The capability component, verbatim. Absent stays absent: a sparse activity is finished, not
    // partial, and an empty list here would read as "this work required nothing".
    ...(node.capability && node.capability.length > 0 ? { capabilities: node.capability } : {}),
  };
}

export function projectPermanentIdentityView(input: ProjectionInput): PermanentIdentityView {
  const { state } = input;

  const activityById = new Map(state.activities.map((activity) => [activity.id, activity]));
  const structureById = new Map(state.structure.map((structure) => [structure.id, structure]));

  /** Structure node id → the activities that occurred within it. */
  const within = new Map<string, ActivityNode[]>();
  /** Activity id → the structure it occurred within, if any. */
  const parentOf = new Map<string, StructureNode>();

  for (const relation of state.relations) {
    if (relation.kind !== 'occurred_within') continue;
    const activity = activityById.get(relation.fromNodeId);
    const structure = structureById.get(relation.toNodeId);
    if (!activity || !structure) continue;

    within.set(structure.id, [...(within.get(structure.id) ?? []), activity]);
    parentOf.set(activity.id, structure);
  }

  const sectionFor = (kinds: ReadonlySet<string>): ViewEntry[] =>
    state.structure
      .filter((node) => kinds.has(node.kind))
      .map((node) => {
        const children = (within.get(node.id) ?? []).map((activity) => entryFor(activity, input));
        return {
          ...entryFor(node, input),
          ...(children.length > 0 ? { activities: children } : {}),
        };
      });

  // Projects are engagements, plus any *work* that belongs to no structure at all — things the
  // person did that Joby cannot place. Dropping those would silently lose facts they confirmed.
  //
  // A capability-only activity is excluded: it records what some work required, not work that was
  // done, and it surfaces under Skills. Listing it as a project would invent an accomplishment.
  const isWork = (activity: ActivityNode): boolean =>
    activity.contribution !== undefined || activity.consequence !== undefined;

  const projects: ViewEntry[] = [
    ...state.structure
      .filter((node) => node.kind === 'engagement')
      .map((node) => {
        const children = (within.get(node.id) ?? [])
          .filter(isWork)
          .map((activity) => entryFor(activity, input));
        return { ...entryFor(node, input), ...(children.length > 0 ? { activities: children } : {}) };
      }),
    ...state.activities
      .filter((activity) => !parentOf.has(activity.id) && isWork(activity))
      .map((activity) => entryFor(activity, input)),
  ];

  // Skills: capability components aggregated across activities, each carrying what evidences it.
  const skills = new Map<string, { capability: string; evidencedBy: string[]; visibility: SourceVisibility }>();
  for (const activity of state.activities) {
    for (const capability of activity.capability ?? []) {
      const key = capability.toLowerCase().trim();
      const entry = skills.get(key) ?? {
        capability,
        evidencedBy: [],
        visibility: 'public' as SourceVisibility,
      };
      entry.evidencedBy.push(activity.label);
      // Most restrictive wins: a skill evidenced by anything private is private.
      if (visibilityOf(activity.id, input.provenance, input.sourceVisibility) === 'private') {
        entry.visibility = 'private';
      }
      skills.set(key, entry);
    }
  }

  // Achievements: consequence components, shown with the contribution that produced them.
  const achievements: ViewEntry[] = state.activities
    .filter((activity) => activity.consequence !== undefined)
    .map((activity) => ({
      nodeId: activity.id,
      title: activity.consequence!,
      epistemicStatus: activity.epistemicStatus,
      visibility: visibilityOf(activity.id, input.provenance, input.sourceVisibility),
      ...(activity.contribution ? { detail: activity.contribution } : {}),
    }));

  const evidence: EvidenceEntry[] = [];
  for (const node of [...state.structure, ...state.activities]) {
    for (const record of input.provenance.get(node.id) ?? []) {
      evidence.push({
        nodeId: node.id,
        label: node.label,
        origin: record.origin,
        visibility: record.sourceId
          ? (input.sourceVisibility.get(record.sourceId) ?? 'private')
          : 'private',
        ...(record.sourceId ? { sourceId: record.sourceId } : {}),
        ...(record.quote ? { quote: record.quote } : {}),
      });
    }
  }

  return {
    personId: input.personId,
    revision: input.revision,
    education: sectionFor(EDUCATION_KINDS),
    experience: sectionFor(EXPERIENCE_KINDS),
    projects,
    skills: [...skills.values()].map(
      (entry): SkillEntry => ({
        capability: entry.capability,
        evidencedBy: entry.evidencedBy,
        visibility: entry.visibility,
      }),
    ),
    achievements,
    evidence,
  };
}
