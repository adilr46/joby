/**
 * UC09 — the CV representation path.
 *
 * This decision sits before expensive rendering. A selected Representation can be reused when it
 * already covers the Opportunity clearly; Adaptation should spend writing, slot-patching and PDF
 * compilation effort only when the Opportunity would materially change ordering, prominence or
 * wording of confirmed evidence.
 */

import type { AdaptedState } from './adapted-state';

/**
 * The paths named by the product question.
 *
 * - `reuse` — the lens's general CV as it stands, unchanged for this opportunity.
 * - `adapt` — the general CV with this opportunity's contextual adaptation applied.
 * - `needs_attention` — rendering would paper over an unsupported requirement or wrong/missing lens.
 */
export type CvRepresentationPath = 'reuse' | 'adapt' | 'needs_attention';

export type CvAdaptationNeed =
  | 'recover_confirmed_evidence'
  | 'promote_relevant_evidence'
  | 'de_emphasise_irrelevant_evidence';

export interface CvPathDecision {
  readonly path: CvRepresentationPath;
  readonly provisional: boolean;
  /** Why this path, in one sentence a person could be shown. */
  readonly reason: string;
  readonly unsupported: readonly string[];
  readonly changes: readonly CvAdaptationNeed[];
}

/**
 * The seam Module 3 asks, rather than deciding for itself.
 *
 * It takes the whole Adapted State so a future policy can consider anything already composed —
 * the assessment, whether recovery was needed, the opportunity, the person's conditions — **without
 * Adapted State or the rest of Context Representation being redesigned** to carry routing inputs.
 */
export interface CvRoutingPolicy {
  resolve(adapted: AdaptedState): CvPathDecision;
}

/**
 * The first conservative policy.
 *
 * Unsupported requirements stop rendering. A lens with no recovery and only well-represented
 * relevant evidence can be reused. Everything else is a contextual adaptation: still grounded in
 * confirmed Identity, still not a persistent Representation change.
 */
export class ProvisionalCvRoutingPolicy implements CvRoutingPolicy {
  resolve(adapted: AdaptedState): CvPathDecision {
    if (adapted.assessment.unevidenced.length > 0) {
      return {
        path: 'needs_attention',
        provisional: false,
        unsupported: adapted.assessment.unevidenced,
        changes: [],
        reason:
          `Needs attention: no confirmed Profile Unit supports ${adapted.assessment.unevidenced.join(', ')}.`,
      };
    }

    const changes = adaptationNeeds(adapted);
    if (changes.length > 0) {
      return {
        path: 'adapt',
        provisional: false,
        unsupported: [],
        changes,
        reason: `Adapt this CV: ${describeChanges(changes)}.`,
      };
    }

    return {
      path: 'reuse',
      provisional: false,
      unsupported: [],
      changes: [],
      reason:
        'Reuse the selected Representation: it already covers this opportunity without recovery or prominence changes.',
    };
  }
}

function adaptationNeeds(adapted: AdaptedState): readonly CvAdaptationNeed[] {
  const needs = new Set<CvAdaptationNeed>();
  if (adapted.recoveryUsed || adapted.assessment.gaps.length > 0) {
    needs.add('recover_confirmed_evidence');
  }
  for (const item of adapted.assessment.baseline) {
    if (item.verdict === 'emphasise') needs.add('promote_relevant_evidence');
    if (item.verdict === 'de_emphasise') needs.add('de_emphasise_irrelevant_evidence');
  }
  return [...needs];
}

function describeChanges(changes: readonly CvAdaptationNeed[]): string {
  const labels: Record<CvAdaptationNeed, string> = {
    recover_confirmed_evidence: 'recover confirmed evidence the selected Representation does not show',
    promote_relevant_evidence: 'promote relevant evidence already in the Representation',
    de_emphasise_irrelevant_evidence: 'de-emphasise evidence this Opportunity does not ask about',
  };
  return changes.map((change) => labels[change]).join('; ');
}
