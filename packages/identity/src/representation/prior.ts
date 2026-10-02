/**
 * The Adaptation prior (UC10).
 *
 *   A^C = T(E_t, L_t, C, P_i)      P_i optional
 *
 * What a selected Identity Representation offers an opportunity-specific Adaptation: how this person
 * generally positions themselves in this professional domain. Nothing more.
 *
 * **The prior is a prior, not a filter — and that is structural here, not a rule to remember.**
 *
 *  - It carries **no professional evidence**. Node ids and the person's own reusable wording, never
 *    a canonical label, contribution, capability, consequence or date. A caller cannot build a CV
 *    from a prior; it has to read Durable Identity to know what any of these facts *are*. That is
 *    what makes `T(V_i, C)` impossible to write by accident.
 *  - It states de-emphasis and hiding **as preferences, not as absences**. A hidden fact appears
 *    here with `suggestedInclusion: false`, so a prior can never be mistaken for the set of usable
 *    evidence:
 *
 *        HiddenInLens ≠ UnavailableToAdaptation
 *
 * Adaptation retains the broad canonical Identity snapshot ADR 0013 grants it. When a specific role
 * makes normally de-emphasised evidence locally valuable, it recovers that evidence from Explicit
 * State and promotes it for that opportunity — and the lens does not change, because one opportunity
 * does not get to rewrite how someone generally presents themselves.
 */

import type {
  IdentityRepresentation,
  PositioningTheme,
  RepresentationDecision,
  RepresentationEmphasis,
} from './model';

/**
 * The lens's standing preference about one canonical fact.
 *
 * Keyed by `nodeId` and holding nothing of the fact itself. `suggestedInclusion: false` is the
 * person saying "I don't normally lead with this" — never "this is unavailable", and never "this is
 * untrue".
 */
export interface EvidencePreference {
  readonly nodeId: string;
  /** The lens's general position. A suggestion to a local decision, not a constraint on it. */
  readonly suggestedInclusion: boolean;
  readonly suggestedPriority?: number;
  readonly emphasis?: RepresentationEmphasis;
  /** The person's own reusable, context-independent wording for this fact. */
  readonly reusableWording?: string;
}

/**
 * `P_i` — an optional positioning input to Adaptation.
 *
 * Optional throughout: Adaptation must work with no prior at all, because a person applying to
 * something outside every lens they keep is a normal case, not a degraded one.
 */
export interface RepresentationPrior {
  readonly representationId: string;
  readonly personId: string;
  readonly name: string;
  readonly purpose?: string;
  /** What this lens generally leads with. Positioning choices, never claims about the person. */
  readonly themes: readonly string[];
  /** Standing preferences, including the ones that de-emphasise or set aside. */
  readonly preferences: readonly EvidencePreference[];
  /**
   * The canonical revision these preferences were last read against.
   *
   * Carried so a consumer can tell that a prior is a *view* of a lens over a moving identity, and
   * never a snapshot of the identity itself.
   */
  readonly identityRevision: number;
}

export function buildRepresentationPrior(input: {
  readonly representation: IdentityRepresentation;
  readonly decisions: readonly RepresentationDecision[];
  readonly themes: readonly PositioningTheme[];
  readonly identityRevision: number;
}): RepresentationPrior {
  return {
    representationId: input.representation.id,
    personId: input.representation.personId,
    name: input.representation.name,
    themes: input.themes.map((theme) => theme.label),
    identityRevision: input.identityRevision,
    ...(input.representation.purpose ? { purpose: input.representation.purpose } : {}),
    preferences: input.decisions.map(
      (decision): EvidencePreference => ({
        nodeId: decision.nodeId,
        // Hiding travels as a preference. Dropping these entries is the one change that would turn
        // this into an evidence whitelist.
        suggestedInclusion: decision.included,
        ...(decision.priority === undefined ? {} : { suggestedPriority: decision.priority }),
        ...(decision.emphasis === undefined ? {} : { emphasis: decision.emphasis }),
        ...(decision.framing === undefined ? {} : { reusableWording: decision.framing }),
      }),
    ),
  };
}
