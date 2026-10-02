/**
 * UC06, UC07 and UC08 as pure functions.
 *
 *   assess(baseline, C)                    -> what this lens does and does not expose here
 *   recover(E_t, gaps)                     -> canonical evidence the lens left out, selectively
 *   compose(baseline, recovered, C)        -> A^C
 *
 * Pure because the judgements are the dangerous part. "This project is relevant to this role" and
 * "your lens does not show anything for this requirement" are claims a person will act on, and they
 * must be checkable without a database, an opportunity or a model.
 *
 * **Relevance is canonical capability equality, and nothing cleverer.** An element speaks to a
 * requirement when the activity's own `Capability` component matches it under normalisation. No
 * synonyms, no substring guessing, no similarity: Joby saying "your rota scheduler shows Python"
 * must mean the person confirmed Python on that activity, not that a machine thought it looked
 * likely. Thin evidence is a real answer, and `unevidenced` is where it goes.
 */

import type { PermanentIdentityView, ViewEntry } from '@joby/identity';
import type { PositionedEntry, RepresentationSection } from '@joby/identity/representation';
import type {
  AdaptedElement,
  BaselineAssessment,
  RepresentationAssessment,
  RepresentationGap,
} from './adapted-state';
import type { OpportunityContext } from './model';

const normalise = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * How many recovered elements one opportunity may pull in.
 *
 * Recovery is **selective, not exhaustive**: it exists to close a specific gap the lens left, not to
 * re-solve Durable Identity per opportunity. A cap keeps a person with a long history from having
 * their careful positioning drowned by everything that happens to mention a keyword.
 */
const MAX_RECOVERED_PER_GAP = 2;

/** The opportunity's asks, kept distinct: a requirement and a nice-to-have are different claims. */
interface Ask {
  readonly capability: string;
  readonly required: boolean;
}

function asks(opportunity: OpportunityContext): readonly Ask[] {
  const seen = new Set<string>();
  const collected: Ask[] = [];

  for (const capability of opportunity.requiredCapabilities) {
    const key = normalise(capability);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    collected.push({ capability, required: true });
  }
  for (const capability of opportunity.preferredCapabilities) {
    const key = normalise(capability);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    collected.push({ capability, required: false });
  }
  return collected;
}

/** Which of the opportunity's asks this canonical evidence speaks to, by its own capabilities. */
function speaksTo(
  capabilities: readonly string[] | undefined,
  opportunityAsks: readonly Ask[],
): readonly string[] {
  if (!capabilities || capabilities.length === 0) return [];
  const held = new Set(capabilities.map(normalise));
  return opportunityAsks
    .filter((ask) => held.has(normalise(ask.capability)))
    .map((ask) => ask.capability);
}

/**
 * UC06 — assess the selected lens against this opportunity.
 *
 * Three judgements about the **representation**, never about the opportunity or the person:
 * what already lands, what is understated, and what the lens is silent about. Suggestions only —
 * the lens is not touched, because one application does not rewrite how someone generally presents
 * themselves.
 */
/**
 * Does this opportunity ask about anything the lens does not already cover?
 *
 * The evidence requirement, isolated so a caller can decide whether the canonical reservoir needs
 * retrieving *before* retrieving it. `false` means the lens speaks to everything asked, so the
 * reservoir would be loaded and never consulted.
 */
export function requiresCanonicalEvidence(
  baseline: readonly PositionedEntry[],
  opportunity: OpportunityContext,
): boolean {
  const opportunityAsks = asks(opportunity);
  return opportunityAsks.some(
    (ask) => !baseline.some((entry) => speaksTo(entry.capabilities, [ask]).length > 0),
  );
}

export function assessRepresentation(
  representationId: string,
  baseline: readonly PositionedEntry[],
  /**
   * The canonical reservoir, or `undefined` when the caller established it was not needed.
   *
   * Undefined is only correct when nothing is uncovered — see `requiresCanonicalEvidence`. It is not
   * a way to suppress recovery: a gap with an unretrieved reservoir would report evidence as absent
   * that the person actually has, which is the one thing this module must never do.
   */
  canonical: PermanentIdentityView | undefined,
  opportunity: OpportunityContext,
): RepresentationAssessment {
  const opportunityAsks = asks(opportunity);
  const exposed = new Set(baseline.map((entry) => entry.nodeId));

  const assessments: BaselineAssessment[] = baseline.map((entry) => {
    const matches = speaksTo(entry.capabilities, opportunityAsks);

    if (matches.length === 0) {
      return {
        nodeId: entry.nodeId,
        verdict: 'de_emphasise',
        speaksTo: [],
        // Not "irrelevant": it is in the lens because the person put it there, and it stays in the
        // Adapted State. It simply is not what this posting asks about.
        summary: `${entry.canonicalTitle}: nothing this posting asks for is recorded against it.`,
      };
    }

    const prominent = entry.emphasis === 'emphasised' || entry.priority !== undefined;
    return {
      nodeId: entry.nodeId,
      verdict: prominent ? 'well_represented' : 'emphasise',
      speaksTo: matches,
      summary: prominent
        ? `${entry.canonicalTitle}: already leading, and it speaks to ${matches.join(', ')}.`
        : `${entry.canonicalTitle}: speaks to ${matches.join(', ')} and is not currently prominent.`,
    };
  });

  // Everything canonical, whether or not the lens exposes it. This is the fallback reservoir.
  const reservoir = canonicalEntries(canonical);

  const gaps: RepresentationGap[] = [];
  const unevidenced: string[] = [];

  for (const ask of opportunityAsks) {
    const inBaseline = baseline.some((entry) => speaksTo(entry.capabilities, [ask]).length > 0);
    if (inBaseline) continue;

    const recoverable = reservoir
      .filter((entry) => !exposed.has(entry.nodeId))
      .filter((entry) => speaksTo(entry.capabilities, [ask]).length > 0);

    if (recoverable.length === 0) {
      // No canonical evidence anywhere. Saying so is the honest answer; inventing something to fill
      // the gap is the failure this whole architecture exists to prevent.
      unevidenced.push(ask.capability);
      continue;
    }

    gaps.push({
      capability: ask.capability,
      required: ask.required,
      recoverableNodeIds: recoverable.slice(0, MAX_RECOVERED_PER_GAP).map((entry) => entry.nodeId),
      summary:
        `${ask.capability}: your ${representationId ? 'selected representation' : 'positioning'} ` +
        `does not show it, but ${recoverable.length} confirmed ${
          recoverable.length === 1 ? 'fact does' : 'facts do'
        }.`,
    });
  }

  return { representationId, baseline: assessments, gaps, unevidenced };
}

/** Every canonical entry, flattened, with the section it surfaced in. */
interface CanonicalEntry extends ViewEntry {
  readonly section: RepresentationSection;
}

const SECTIONS: readonly RepresentationSection[] = [
  'experience',
  'projects',
  'education',
  'achievements',
];

export function canonicalEntries(view: PermanentIdentityView | undefined): readonly CanonicalEntry[] {
  const flattened: CanonicalEntry[] = [];
  const seen = new Set<string>();
  if (!view) return flattened;

  for (const section of SECTIONS) {
    for (const top of view[section]) {
      for (const entry of [top, ...(top.activities ?? [])]) {
        // One canonical fact appears once in the reservoir, even when it surfaces in two sections.
        if (seen.has(entry.nodeId)) continue;
        seen.add(entry.nodeId);
        flattened.push({ ...entry, section });
      }
    }
  }
  return flattened;
}

/**
 * UC07 — recover canonical evidence the lens does not expose.
 *
 * **Selective by construction:** it walks the gaps the assessment found, and only the gaps. Evidence
 * that speaks to nothing this opportunity asks for is never pulled in, however impressive it is —
 * that would be re-solving Durable Identity per opportunity, and it would bury the positioning the
 * person actually maintains.
 */
export function recoverEvidence(
  assessment: RepresentationAssessment,
  canonical: PermanentIdentityView | undefined,
  opportunity: OpportunityContext,
): readonly AdaptedElement[] {
  const wanted = new Map<string, RepresentationGap[]>();
  for (const gap of assessment.gaps) {
    for (const nodeId of gap.recoverableNodeIds) {
      wanted.set(nodeId, [...(wanted.get(nodeId) ?? []), gap]);
    }
  }
  if (wanted.size === 0) return [];

  const opportunityAsks = asks(opportunity);

  return canonicalEntries(canonical)
    .filter((entry) => wanted.has(entry.nodeId))
    .map((entry): AdaptedElement => {
      const gaps = wanted.get(entry.nodeId)!;
      const matches = speaksTo(entry.capabilities, opportunityAsks);
      return {
        nodeId: entry.nodeId,
        section: entry.section,
        // Recovered evidence has no lens framing, by definition — the lens does not expose it. It
        // arrives exactly as Explicit State records it.
        title: entry.title,
        canonicalTitle: entry.title,
        capabilities: entry.capabilities ?? [],
        origin: 'recovered',
        speaksTo: matches,
        rationale:
          `Recovered from your confirmed history: it records ${gaps
            .map((gap) => gap.capability)
            .join(', ')}, which your representation does not currently show.`,
        visibility: entry.visibility,
        ...(entry.detail ? { detail: entry.detail } : {}),
        ...(entry.startedAt ? { startedAt: entry.startedAt } : {}),
        ...(entry.endedAt ? { endedAt: entry.endedAt } : {}),
      };
    });
}

/**
 * UC08 — compose the baseline and any recovered evidence into one ordered state.
 *
 * Order is contextual, and only contextual: what speaks to this opportunity leads, then the lens's
 * own ordering. **Nothing is dropped** — an element the posting does not ask about stays in the
 * state, because the person put it in their lens and this module does not overrule that.
 */
export function composeElements(
  baseline: readonly PositionedEntry[],
  assessment: RepresentationAssessment,
  recovered: readonly AdaptedElement[],
  opportunity: OpportunityContext,
): readonly AdaptedElement[] {
  const verdicts = new Map(assessment.baseline.map((item) => [item.nodeId, item]));
  const opportunityAsks = asks(opportunity);

  const fromRepresentation = baseline.map((entry): AdaptedElement => {
    const assessed = verdicts.get(entry.nodeId);
    const matches = assessed?.speaksTo ?? speaksTo(entry.capabilities, opportunityAsks);

    return {
      nodeId: entry.nodeId,
      section: entry.section,
      title: entry.title,
      canonicalTitle: entry.canonicalTitle,
      capabilities: entry.capabilities ?? [],
      origin: 'representation',
      speaksTo: matches,
      rationale:
        matches.length > 0
          ? `From your ${entry.emphasis === 'emphasised' ? 'emphasised ' : ''}positioning; speaks to ${matches.join(', ')}.`
          : 'From your positioning. This posting does not ask about it.',
      visibility: entry.visibility,
      // Contextual emphasis: the lens's own emphasis stands, and relevance here can raise it.
      ...(entry.emphasis
        ? { emphasis: entry.emphasis }
        : matches.length > 0
          ? { emphasis: 'emphasised' as const }
          : {}),
      ...(entry.detail ? { detail: entry.detail } : {}),
      ...(entry.startedAt ? { startedAt: entry.startedAt } : {}),
      ...(entry.endedAt ? { endedAt: entry.endedAt } : {}),
    };
  });

  // The lens's own order is the array order; recovered evidence follows it. At equal relevance the
  // fallback stays behind the default surface, which is what makes this representation-first.
  const ordered = [...fromRepresentation, ...recovered].map((element, lensOrder) => ({
    element,
    lensOrder,
  }));

  ordered.sort((left, right) => {
    const relevance = right.element.speaksTo.length - left.element.speaksTo.length;
    if (relevance !== 0) return relevance;
    return left.lensOrder - right.lensOrder;
  });

  return ordered.map(({ element }) => element);
}
