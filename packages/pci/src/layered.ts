/**
 * LayeredPci — the Beta-Bernoulli shared + personal implementation (ADR 0041).
 *
 * ## The model in one paragraph
 *
 * A resolved application carries up to two Bernoulli trials:
 *
 *   - **world_response** — did this application reach an interview? Always present (every
 *     resolved application carries `progression`), and attributed to *this person* as well as
 *     the shared pool — how the market responds to them specifically is itself useful personal
 *     signal, worth tracking individually as their own history accumulates.
 *   - **user_response** — did the person accept Joby's framing unchanged? Present whenever the
 *     evidence inherently carries `user_response` signals — not a separate "should we use this"
 *     decision, just whatever is actually there. **Shared-only for now.** This is a staged
 *     rollout, not a reinterpretation of the signal: the type's own contract (see
 *     `ResolvedEvidenceSignal` in `./model.ts`) documents `user_response` as evidencing "how
 *     this person prefers to operate and be represented" — a personal signal, same as
 *     `world_response`. It starts shared-only so the population pattern ("which framing styles
 *     tend to land") is established first; a personal term is deferred, not excluded. Turning it
 *     on later needs no schema change — pass `{ personId: evidence.personId }` to `#increment`
 *     below for the `user` trial, exactly as the `world` trial already does.
 *
 * `world_response` updates a shared cell *and* this person's own personal cell.
 * `user_response` currently updates the shared cell only. At read time, the blended prior is the
 * shared Beta updated with whatever personal counts exist (zero, for every `user_response` cell,
 * until the personal term above is turned on):
 *
 *   α_blend = α_shared + α_personal
 *   β_blend = β_shared + β_personal
 *   E[θ]    = α_blend / (α_blend + β_blend)
 *
 * With zero personal observations, E[θ_blend] = E[θ_shared]. With many, personal evidence
 * dominates because α_blend + β_blend >> α_shared + β_shared. No tuning parameter required.
 *
 * ## Privacy
 *
 * The shared table stores only a cell key and two integers — no person_id, no application
 * content. The feature extraction function that produces cell keys is deterministic, pure, and
 * identity-free. Nothing stored in pci_shared_cell can identify who contributed to a pattern.
 */

import type { Queryable } from '@joby/database';
import type {
  ContextSidePrior,
  PersonSidePrior,
  PciModel,
  PriorBasis,
  ResolvedApplicationEvidence,
  ResolvedEvidenceSignal,
  RoutingPrior,
} from './model';

// ---------------------------------------------------------------------------
// Feature extraction
// ---------------------------------------------------------------------------

/**
 * The dimensions that identify one shared population cell.
 *
 * Deliberately coarse: role_domain is 'unknown' until Opportunity integration enriches it.
 * That is a valid cell key — it means the shared prior is keyed on track only.
 */
export interface SharedFeatures {
  readonly signalFamily: 'world' | 'user';
  readonly representationTrack: string;
  readonly roleDomain: string;
}

/**
 * Extract identity-free structural features from resolved evidence.
 *
 * Pure function — no I/O, no randomness, fully deterministic. The shared layer stores only
 * what this function produces; personId and free-text signals are deliberately excluded.
 */
export function extractSharedFeatures(
  evidence: ResolvedApplicationEvidence,
  family: 'world' | 'user',
): SharedFeatures {
  return {
    signalFamily: family,
    // representationId is the closest proxy for track available on the evidence struct today.
    // When Router emits a track label this can be enriched without changing the cell key format.
    representationTrack: evidence.representationId ?? 'untracked',
    // role_domain is not yet derivable from opportunityId alone — it requires Opportunity
    // understanding data that PCI does not read. 'unknown' is the honest value until that
    // integration exists (ADR 0041 §"What this ADR does not decide").
    roleDomain: 'unknown',
  };
}

/** Produce the string key for a shared cell from its features. */
export function toCellKey(features: SharedFeatures): string {
  return `${features.signalFamily}:${features.representationTrack}:${features.roleDomain}`;
}

// ---------------------------------------------------------------------------
// What a Bernoulli trial looks like for each signal family
// ---------------------------------------------------------------------------

/**
 * For world_response signals: was this application a success?
 *
 * We use reachedInterview as the single binary outcome. It is the earliest stage that
 * meaningfully signals that the representation and application strategy worked — a rejection
 * before screening tells us very little about strategy, but a screening call tells us the
 * representation surfaced above the threshold.
 *
 * reachedOffer is *not* used here. Interview-to-offer conversion depends on factors (performance
 * in the interview itself, compensation fit, headcount changes) that are outside the
 * representation strategy PCI is learning about. Using it would let market conditions rewrite
 * personal priors.
 */
function worldSuccess(evidence: ResolvedApplicationEvidence): boolean {
  return evidence.progression.reachedInterview;
}

/**
 * For user_response signals: did the person accept Joby's framing without modification?
 *
 * Takes the already-filtered `user_response` signals for one resolved application — the caller
 * only invokes this when that list is non-empty, so there is always a real trial to classify.
 *
 * If at least one signal text indicates an edit ('edit', 'rewrote', 'changed', 'modified'),
 * the trial is a failure — the framing did not land cleanly.
 *
 * This is intentionally conservative: a single edit counts as "did not accept". The alternative
 * — counting words or measuring edit distance — requires richer signal structure than the
 * current observation string provides.
 */
function userAccepted(userSignals: readonly ResolvedEvidenceSignal[]): boolean {
  const editTerms = ['edit', 'rewrote', 'rewrit', 'changed', 'modified', 'replaced', 'removed', 'added'];
  return !userSignals.some((s) => editTerms.some((term) => s.observation.toLowerCase().includes(term)));
}

// ---------------------------------------------------------------------------
// Database row types
// ---------------------------------------------------------------------------

interface SharedCellRow {
  readonly cell_key: string;
  readonly alpha: number;
  readonly beta: number;
}

interface PersonalCellRow {
  readonly person_id: string;
  readonly cell_key: string;
  readonly alpha: number;
  readonly beta: number;
}

// ---------------------------------------------------------------------------
// Beta statistics
// ---------------------------------------------------------------------------

/** Posterior mean: the prior estimate we return. */
function mean(alpha: number, beta: number): number {
  return alpha / (alpha + beta);
}

/**
 * Posterior variance: how uncertain the estimate is.
 *
 * High when α+β is small (few observations). Naturally encodes the
 * "a single outcome is never permanent truth" invariant without special-casing.
 */
function variance(alpha: number, beta: number): number {
  const n = alpha + beta;
  return (alpha * beta) / (n * n * (n + 1));
}

/** Confidence: 1 − normalised standard deviation. Bounded to [0, 1]. */
function confidence(alpha: number, beta: number): number {
  const sd = Math.sqrt(variance(alpha, beta));
  // Normalise against the maximum possible SD for a Beta(1,1): sqrt(1/12) ≈ 0.289.
  const maxSd = Math.sqrt(1 / 12);
  return Math.max(0, Math.min(1, 1 - sd / maxSd));
}

// ---------------------------------------------------------------------------
// LayeredPci
// ---------------------------------------------------------------------------

export class LayeredPci implements PciModel {
  readonly #db: Queryable;
  /** Idempotency guard: applicationId values we have already processed in this instance. */
  readonly #seen = new Set<string>();

  constructor(db: Queryable) {
    this.#db = db;
  }

  /**
   * Take resolved evidence into the model.
   *
   * Idempotent on applicationId: an application resolved once must not count twice.
   *
   * Two independent trials, not one gated decision:
   *
   * - **world_response** always runs — `progression` is always present on resolved evidence —
   *   and updates both the shared cell and this person's own personal cell.
   * - **user_response** runs whenever the evidence carries `user_response` signals. This is not
   *   a "should we use this data" branch: whatever signals are inherently there get used; an
   *   application with none simply has no trial to record, the same way an unfilled optional
   *   field has no value rather than a false one. Updates the **shared cell only for now** —
   *   deferred, not excluded; see the class-level doc for the seam that turns a personal term on.
   *
   * All upserts run sequentially — no transaction needed here because each is an independent
   * counter increment and a partial failure leaves a slightly stale prior, not corrupt state.
   * If a caller requires atomicity they should pass a Transaction as the db.
   */
  async observe(evidence: ResolvedApplicationEvidence): Promise<void> {
    if (this.#seen.has(evidence.applicationId)) return;
    this.#seen.add(evidence.applicationId);

    await this.#increment(
      toCellKey(extractSharedFeatures(evidence, 'world')),
      worldSuccess(evidence),
      { personId: evidence.personId },
    );

    // user_response: shared-only for now (ADR 0041). To add the personal term later, pass
    // `{ personId: evidence.personId }` here, exactly as the world_response call above does.
    const userSignals = evidence.signals.filter((s) => s.family === 'user_response');
    if (userSignals.length > 0) {
      await this.#increment(toCellKey(extractSharedFeatures(evidence, 'user')), userAccepted(userSignals));
    }
  }

  async personSidePrior(personId: string): Promise<PersonSidePrior> {
    // The person-side prior summarises user-response cells. Because user_response is
    // shared-only *for now* (see the class-level doc — deferred, not excluded), `personalCount`
    // below is always 0 for these cells and `basis` always comes back 'shared' until the
    // personal term is turned on — which is the honest answer in the meantime: this is
    // population framing-acceptance data, not yet anything personal to this individual.
    const cellKeyPrefix = 'user:';
    const rows = await this.#blendedCells(personId, cellKeyPrefix);

    const observations = rows.map(({ cellKey, blendedMean, blendedAlpha, blendedBeta }) =>
      `${cellKey}: acceptance prior ${blendedMean.toFixed(2)} ` +
      `(confidence ${confidence(blendedAlpha, blendedBeta).toFixed(2)})`,
    );

    const personalCount = rows.reduce((sum, r) => sum + r.personalAlpha + r.personalBeta, 0);
    const sharedCount = rows.reduce((sum, r) => sum + r.sharedAlpha + r.sharedBeta - 2, 0); // subtract Laplace starts

    return {
      personId,
      observations,
      supportingApplications: personalCount,
      sharedSupport: Math.max(0, sharedCount),
      basis: deriveBasis(personalCount, Math.max(0, sharedCount)),
    };
  }

  async contextSidePrior(input: { personId: string; opportunityId: string }): Promise<ContextSidePrior> {
    // The context-side prior summarises world-response cells for this person.
    const cellKeyPrefix = 'world:';
    const rows = await this.#blendedCells(input.personId, cellKeyPrefix);

    const observations = rows.map(({ cellKey, blendedMean, blendedAlpha, blendedBeta }) =>
      `${cellKey}: interview-reach prior ${blendedMean.toFixed(2)} ` +
      `(confidence ${confidence(blendedAlpha, blendedBeta).toFixed(2)})`,
    );

    const personalCount = rows.reduce((sum, r) => sum + r.personalAlpha + r.personalBeta, 0);
    const sharedCount = rows.reduce((sum, r) => sum + r.sharedAlpha + r.sharedBeta - 2, 0);

    return {
      opportunityId: input.opportunityId,
      observations,
      supportingApplications: personalCount,
      sharedSupport: Math.max(0, sharedCount),
      basis: deriveBasis(personalCount, Math.max(0, sharedCount)),
    };
  }

  async routingPrior(input: {
    personId: string;
    opportunityId: string;
    representationIds: readonly string[];
  }): Promise<RoutingPrior> {
    const weights = new Map<string, number>();

    for (const repId of input.representationIds) {
      // For each representation, look up both world and user cells for this person + track.
      const worldKey = toCellKey({ signalFamily: 'world', representationTrack: repId, roleDomain: 'unknown' });
      const userKey  = toCellKey({ signalFamily: 'user',  representationTrack: repId, roleDomain: 'unknown' });

      const [worldBlend, userBlend] = await Promise.all([
        this.#blendedCell(input.personId, worldKey),
        this.#blendedCell(input.personId, userKey),
      ]);

      if (worldBlend === null && userBlend === null) continue;

      // Weight = geometric mean of world-response and user-response priors.
      // A representation that reaches interviews AND is accepted without editing scores highest.
      // Using geometric mean rather than arithmetic: both signals must be present and positive;
      // a zero in either family collapses the weight toward zero.
      const worldMean = worldBlend
        ? mean(worldBlend.blendedAlpha, worldBlend.blendedBeta)
        : 0.5; // uninformative default when no world data exists
      const userMean = userBlend
        ? mean(userBlend.blendedAlpha, userBlend.blendedBeta)
        : 0.5;

      weights.set(repId, Math.sqrt(worldMean * userMean));
    }

    return { weights };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Increment the shared cell for one Bernoulli trial, and this person's own cell too when
   * `personal` is supplied.
   *
   * Omitting `personal` is currently how the `user_response` path is called (ADR 0041) — a
   * staged rollout, not a permanent exclusion. One side effect of omitting it for now: it also
   * sidesteps the self-inclusion double-count a personal term would create (this person's own
   * trial already lands in the shared pool; adding a personal term on top counts it twice — see
   * `world_response`'s comment below for where that trade-off is accepted). That side effect
   * goes away once `user_response` gets its personal term too — at which point it inherits the
   * same accepted trade-off `world_response` already lives with, not a new problem.
   */
  async #increment(cellKey: string, success: boolean, personal?: { readonly personId: string }): Promise<void> {
    const successCol = success ? 'alpha' : 'beta';

    // Shared: upsert — create with Laplace starts if absent, increment the relevant counter.
    await this.#db.query(
      `INSERT INTO pci_shared_cell (cell_key, ${successCol}, updated_at)
       VALUES ($1, 2, now())
       ON CONFLICT (cell_key) DO UPDATE
         SET ${successCol} = pci_shared_cell.${successCol} + 1,
             updated_at    = now()`,
      [cellKey],
    );

    if (!personal) return;

    // Personal: upsert — create with zero if absent, increment the relevant counter.
    //
    // **Known property, not a bug:** this person's own evidence now lives in both the shared
    // cell above and this personal cell, and the blend at read time sums both
    // (`α_blend = α_shared + α_personal`) — so it is counted once as a 1/N contribution to the
    // population pool and again at full weight personally. At real population scale this is
    // negligible; it is visible against a small or synthetic shared pool (see `layered.test.ts`).
    // The principled fix is leave-one-out attribution, which needs the shared layer to know
    // whose evidence is in a cell — exactly the identity-bearing information ADR 0040's privacy
    // boundary excludes it from storing. Accepted as a scale-dependent approximation for
    // `world_response`, where a personal term is wanted regardless; avoided entirely for
    // `user_response` by never passing `personal` for that trial.
    await this.#db.query(
      `INSERT INTO pci_personal_cell (person_id, cell_key, ${successCol}, updated_at)
       VALUES ($1, $2, 1, now())
       ON CONFLICT (person_id, cell_key) DO UPDATE
         SET ${successCol} = pci_personal_cell.${successCol} + 1,
             updated_at    = now()`,
      [personal.personId, cellKey],
    );
  }

  /**
   * Load shared and personal counts for a single cell, blend them, and return the result.
   * Returns null if neither the shared nor personal cell has real observations.
   */
  async #blendedCell(
    personId: string,
    cellKey: string,
  ): Promise<BlendedCell | null> {
    const [{ rows: sharedRows }, { rows: personalRows }] = await Promise.all([
      this.#db.query<SharedCellRow>(
        'SELECT cell_key, alpha, beta FROM pci_shared_cell WHERE cell_key = $1',
        [cellKey],
      ),
      this.#db.query<PersonalCellRow>(
        'SELECT person_id, cell_key, alpha, beta FROM pci_personal_cell WHERE person_id = $1 AND cell_key = $2',
        [personId, cellKey],
      ),
    ]);

    const shared = sharedRows[0];
    const personal = personalRows[0];

    if (!shared && !personal) return null;

    const sharedAlpha = shared?.alpha ?? 1;
    const sharedBeta  = shared?.beta  ?? 1;
    const personalAlpha = personal?.alpha ?? 0;
    const personalBeta  = personal?.beta  ?? 0;

    const blendedAlpha = sharedAlpha + personalAlpha;
    const blendedBeta  = sharedBeta  + personalBeta;

    return {
      cellKey,
      sharedAlpha,
      sharedBeta,
      personalAlpha,
      personalBeta,
      blendedAlpha,
      blendedBeta,
      blendedMean: mean(blendedAlpha, blendedBeta),
    };
  }

  /**
   * Load all blended cells for a person whose key starts with the given prefix.
   * Used to summarise all cells of one signal family for a person.
   */
  async #blendedCells(personId: string, cellKeyPrefix: string): Promise<BlendedCell[]> {
    // Collect all cell keys relevant to this person or present in the shared layer with this prefix.
    const [{ rows: sharedRows }, { rows: personalRows }] = await Promise.all([
      this.#db.query<SharedCellRow>(
        'SELECT cell_key, alpha, beta FROM pci_shared_cell WHERE cell_key LIKE $1',
        [`${cellKeyPrefix}%`],
      ),
      this.#db.query<PersonalCellRow>(
        'SELECT person_id, cell_key, alpha, beta FROM pci_personal_cell WHERE person_id = $1 AND cell_key LIKE $2',
        [personId, `${cellKeyPrefix}%`],
      ),
    ]);

    // Union of cell keys from both layers.
    const allKeys = new Set<string>([
      ...sharedRows.map((r) => r.cell_key),
      ...personalRows.map((r) => r.cell_key),
    ]);

    const sharedByKey = new Map(sharedRows.map((r) => [r.cell_key, r]));
    const personalByKey = new Map(personalRows.map((r) => [r.cell_key, r]));

    return [...allKeys].map((cellKey) => {
      const shared   = sharedByKey.get(cellKey);
      const personal = personalByKey.get(cellKey);

      const sharedAlpha   = shared?.alpha   ?? 1;
      const sharedBeta    = shared?.beta    ?? 1;
      const personalAlpha = personal?.alpha ?? 0;
      const personalBeta  = personal?.beta  ?? 0;

      const blendedAlpha = sharedAlpha + personalAlpha;
      const blendedBeta  = sharedBeta  + personalBeta;

      return {
        cellKey,
        sharedAlpha,
        sharedBeta,
        personalAlpha,
        personalBeta,
        blendedAlpha,
        blendedBeta,
        blendedMean: mean(blendedAlpha, blendedBeta),
      };
    });
  }
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface BlendedCell {
  readonly cellKey: string;
  readonly sharedAlpha: number;
  readonly sharedBeta: number;
  readonly personalAlpha: number;
  readonly personalBeta: number;
  readonly blendedAlpha: number;
  readonly blendedBeta: number;
  readonly blendedMean: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveBasis(personalCount: number, sharedCount: number): PriorBasis {
  if (personalCount > 0 && sharedCount > 0) return 'both';
  if (personalCount > 0) return 'personal';
  return 'shared';
}
