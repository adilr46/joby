/**
 * Applying a lens: `E_t + Decisions_i -> V_i`.
 *
 * A pure function over the canonical projection and the decisions about it. It holds no persistence
 * and no facts of its own — which is why the whole "a representation cannot invent professional
 * reality" property is checkable here, in unit tests, without a database.
 *
 * Two rules are enforced by construction rather than by care:
 *
 *  - **Nothing is dropped.** A hidden fact comes out flagged, not missing. Hiding is a positioning
 *    prior for this lens; it is not an evidence boundary, and a later Adaptation must be able to
 *    recover what was set aside (ADR 0015).
 *  - **Framing never replaces truth.** Every entry carries `canonicalTitle` from Explicit State
 *    beside whatever wording the lens applies.
 */

import type { PermanentIdentityView, ViewEntry } from '@joby/identity';
import type {
  PositionedEntry,
  RepresentationDecision,
  RepresentationSection,
} from './model';

/** Sections in the order a reader meets them. Skills are excluded — they aggregate, so they have
 *  no single canonical node to decide about, and a decision needs one. */
const SECTIONS: readonly RepresentationSection[] = [
  'experience',
  'projects',
  'education',
  'achievements',
];

function entriesOf(view: PermanentIdentityView, section: RepresentationSection): readonly ViewEntry[] {
  const top = view[section];
  // A structure entry positions its own activities too: a person hiding one project is not hiding
  // the degree it happened within, and vice versa.
  return top.flatMap((entry) => [entry, ...(entry.activities ?? [])]);
}

/**
 * Order: ranked before unranked, then by rank, then canonical order — and hidden last.
 *
 * Hidden entries sort to the end rather than out of the list, so the natural way to render a lens
 * (take what is included) is also the safe one, while the set aside stays visible to anything that
 * needs it.
 *
 * The tiebreaker is the entry's position in the canonical walk, **not** its node id: one fact can
 * surface in two sections (a project and the achievement it produced), and keying the fallback on
 * the node would make those two entries indistinguishable to the sort.
 */
function compare(a: Ranked, b: Ranked): number {
  if (a.entry.included !== b.entry.included) return a.entry.included ? -1 : 1;

  const rankA = a.entry.priority ?? Number.POSITIVE_INFINITY;
  const rankB = b.entry.priority ?? Number.POSITIVE_INFINITY;
  if (rankA !== rankB) return rankA - rankB;

  return a.canonicalOrder - b.canonicalOrder;
}

interface Ranked {
  readonly entry: PositionedEntry;
  readonly canonicalOrder: number;
}

export function positionProjection(
  view: PermanentIdentityView,
  decisions: readonly RepresentationDecision[],
): readonly PositionedEntry[] {
  const byNode = new Map(decisions.map((decision) => [decision.nodeId, decision]));

  const positioned: Ranked[] = [];
  let canonicalOrder = 0;

  for (const section of SECTIONS) {
    for (const entry of entriesOf(view, section)) {
      const decision = byNode.get(entry.nodeId);
      positioned.push({
        canonicalOrder: canonicalOrder++,
        entry: {
          nodeId: entry.nodeId,
          section,
          // The lens's wording where one was set; what Explicit State records otherwise.
          title: decision?.framing ?? entry.title,
          canonicalTitle: entry.title,
          // Absent when there is no decision: neutral is the default, not a stored opinion.
          included: decision?.included ?? true,
          epistemicStatus: entry.epistemicStatus,
          visibility: entry.visibility,
          ...(entry.detail ? { detail: entry.detail } : {}),
          ...(entry.startedAt ? { startedAt: entry.startedAt } : {}),
          ...(entry.endedAt ? { endedAt: entry.endedAt } : {}),
          ...(entry.capabilities ? { capabilities: entry.capabilities } : {}),
          ...(decision?.framing ? { framing: decision.framing } : {}),
          ...(decision?.priority === undefined ? {} : { priority: decision.priority }),
          ...(decision?.emphasis === undefined ? {} : { emphasis: decision.emphasis }),
        },
      });
    }
  }

  return positioned.sort(compare).map((ranked) => ranked.entry);
}
