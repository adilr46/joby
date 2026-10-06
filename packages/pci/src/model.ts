/**
 * The PCI contract: what goes in, what comes out, and what must never happen in between.
 */

/**
 * One meaningful observation from a resolved Application.
 *
 * The two families are separate fields rather than one labelled union on purpose. A shared shape
 * with a `kind` discriminator invites code that handles "a signal" generically, and the whole point
 * is that these two mean different things:
 *
 * - a **user response** evidences how this person prefers to operate and be represented;
 * - a **world response** evidences how the professional world appeared to respond to them.
 *
 * `user preference ≠ external effectiveness`. Merging them lets Joby tell someone their taste is a
 * strategy.
 */
export type ResolvedEvidenceSignal =
  | {
      readonly family: 'user_response';
      /** Accepted or rejected framing, an edit, evidence included or removed, a stated preference. */
      readonly observation: string;
      readonly observedAt: string;
    }
  | {
      readonly family: 'world_response';
      /** Recruiter response, screening or interview progression, rejection, offer, feedback. */
      readonly observation: string;
      readonly observedAt: string;
    };

/**
 * What Application hands over when an interaction has resolved.
 *
 * **Identifiers and meaningful observations, not an object graph.** PCI re-reads from owners rather
 * than trusting a snapshot, and Application stays the only authority on what happened.
 */
export interface ResolvedApplicationEvidence {
  readonly applicationId: string;
  readonly personId: string;
  readonly opportunityId: string;
  /** Which representation was actually used, so a learned pattern can be traced to a real lens. */
  readonly representationId?: string;
  readonly resolvedAt: string;
  /**
   * Outcome-derived progression, supplied by Application rather than re-guessed from prose signals.
   * This is strategy evidence only: how far the interaction moved, not proof of any professional
   * claim about the person.
   */
  readonly progression: {
    readonly reachedInterview: boolean;
    readonly reachedOffer: boolean;
    readonly terminal: boolean;
    readonly terminalPolarity?: 'positive' | 'negative' | 'neutral';
  };
  readonly signals: readonly ResolvedEvidenceSignal[];
}

/**
 * Where a prior came from. Consumers must not present shared-only priors as personal insight.
 *
 * - `'personal'`  — built entirely from this person's own resolved evidence.
 * - `'shared'`    — built from population patterns; no personal evidence yet.
 * - `'both'`      — personal evidence exists and has adjusted the shared starting point.
 */
export type PriorBasis = 'personal' | 'shared' | 'both';

/** Person-side: how this person tends to be represented well, and where they tend to correct Joby. */
export interface PersonSidePrior {
  readonly personId: string;
  /** Human-readable, because a prior nobody can read is a prior nobody can challenge. */
  readonly observations: readonly string[];
  /** How much of this person's own resolved evidence stands behind this. Zero is the honest starting answer. */
  readonly supportingApplications: number;
  /**
   * Cross-person aggregate patterns behind the shared starting point (ADR 0040).
   * Zero until a `LayeredPci` with real shared-layer backing is in place.
   */
  readonly sharedSupport: number;
  /**
   * Where the prior came from. A `'shared'`-basis prior must never be presented as
   * personal insight — that is an evidence-proportionality violation (JOBY_MEMORY §7).
   */
  readonly basis: PriorBasis;
}

/** Context-side: recurring patterns about opportunities of this kind. Never opportunity evidence. */
export interface ContextSidePrior {
  readonly opportunityId: string;
  readonly observations: readonly string[];
  /** How much of this person's own resolved evidence stands behind this. */
  readonly supportingApplications: number;
  /** Cross-person aggregate patterns behind the shared starting point (ADR 0040). */
  readonly sharedSupport: number;
  readonly basis: PriorBasis;
}

/** Routing: a weight per representation. Consumed by Router as a hint it may bound or ignore. */
export interface RoutingPrior {
  readonly weights: ReadonlyMap<string, number>;
}

export type PciSignalFamily = 'preference' | 'accessibility' | 'calibration';
export type EvidenceStrength = 'strong' | 'moderate' | 'weak' | 'opaque';

export interface CareerObservation {
  readonly observationId: string;
  readonly personId: string;
  readonly personStateRef: string;
  readonly opportunityId: string;
  readonly opportunitySnapshot: string;
  readonly evaluationSnapshot: string;
  readonly decision: string;
  readonly representationTrack?: string;
  readonly representationUsed?: string;
  readonly applicationTrajectory: readonly string[];
  readonly worldOutcome: string;
  readonly feedback?: readonly string[];
  readonly inferredExplanation?: string;
  readonly attributionConfidence: number;
  readonly evidenceStrength: EvidenceStrength;
}

export interface PciSignal {
  readonly family: PciSignalFamily;
  readonly track: string;
  readonly value: number;
  readonly evidenceStrength: EvidenceStrength;
  readonly reason: string;
}

export interface PciSignalState {
  readonly value: number;
  readonly evidenceCount: number;
  readonly confidence: number;
}

export interface PciState {
  readonly preferencePriors: ReadonlyMap<string, PciSignalState>;
  readonly accessibilityPriors: ReadonlyMap<string, PciSignalState>;
  readonly calibrationPriors: ReadonlyMap<string, PciSignalState>;
  readonly byRepresentationTrack: ReadonlyMap<string, PciSignalState>;
  readonly global: PciSignalState;
  readonly evidenceCounts: ReadonlyMap<PciSignalFamily, number>;
  readonly confidence: number;
}

/**
 * The learned model, behind one interface for every stage of its evolution.
 *
 * A database-backed count, a regression, a clustering model and a dedicated service all satisfy this
 * shape. Consumers ask for priors; none of them learns which answered.
 */
export interface PciModel {
  /**
   * Take resolved evidence into the model.
   *
   * Idempotent on `applicationId`: an application resolved once must not count twice, or redelivery
   * would manufacture confidence — the same correctness property every deferrable handler needs.
   */
  observe(evidence: ResolvedApplicationEvidence): Promise<void>;

  observeCareerObservation?(observation: CareerObservation): Promise<void>;

  personSidePrior(personId: string): Promise<PersonSidePrior>;
  contextSidePrior(input: { personId: string; opportunityId: string }): Promise<ContextSidePrior>;
  routingPrior(input: {
    personId: string;
    opportunityId: string;
    representationIds: readonly string[];
  }): Promise<RoutingPrior>;
}

/**
 * The current model: it has learned nothing, and says so.
 *
 * Not a placeholder to be filled in with plausible defaults. At the Baseline there is almost nothing
 * to learn from, and **that is the correct state** — empty priors with zero support are the honest
 * answer, and every consumer already handles them because this is what they get today.
 *
 * `observe` accepts evidence and retains none. Storing it before the model that will use it exists
 * would be persistence ahead of a decision, and the evidence remains safe in Application regardless.
 */
export class NoLearnedPci implements PciModel {
  async observe(_evidence: ResolvedApplicationEvidence): Promise<void> {
    // Deliberately nothing. Application is the durable record; PCI holds no second copy of it.
  }

  async personSidePrior(personId: string): Promise<PersonSidePrior> {
    return { personId, observations: [], supportingApplications: 0, sharedSupport: 0, basis: 'personal' };
  }

  async contextSidePrior(input: { personId: string; opportunityId: string }): Promise<ContextSidePrior> {
    return { opportunityId: input.opportunityId, observations: [], supportingApplications: 0, sharedSupport: 0, basis: 'personal' };
  }

  async routingPrior(_input: {
    personId: string;
    opportunityId: string;
    representationIds: readonly string[];
  }): Promise<RoutingPrior> {
    return { weights: new Map() };
  }
}

export class SlowLearningPci implements PciModel {
  readonly #seen = new Set<string>();
  readonly #preference = new Map<string, PciSignalState>();
  readonly #accessibility = new Map<string, PciSignalState>();
  readonly #calibration = new Map<string, PciSignalState>();
  readonly #track = new Map<string, PciSignalState>();
  readonly #evidenceCounts = new Map<PciSignalFamily, number>();
  #global: PciSignalState = { value: 0, evidenceCount: 0, confidence: 0 };

  async observe(evidence: ResolvedApplicationEvidence): Promise<void> {
    if (this.#seen.has(evidence.applicationId)) return;
    this.#seen.add(evidence.applicationId);
    const track = evidence.representationId ?? 'global';
    for (const signal of evidence.signals) {
      if (signal.family === 'user_response') {
        this.#apply({ family: 'preference', track, value: 0.6, evidenceStrength: 'weak', reason: signal.observation });
      } else {
        this.#apply({ family: 'accessibility', track, value: worldValue(signal.observation), evidenceStrength: 'moderate', reason: signal.observation });
      }
    }
  }

  async observeCareerObservation(observation: CareerObservation): Promise<void> {
    if (this.#seen.has(observation.observationId)) return;
    this.#seen.add(observation.observationId);
    const track = observation.representationTrack ?? 'global';
    for (const signal of deriveSignals(observation)) this.#apply({ ...signal, track });
  }

  async personSidePrior(personId: string): Promise<PersonSidePrior> {
    const count = this.#evidenceCounts.get('preference') ?? 0;
    return {
      personId,
      observations: [...this.#preference.entries()].map(([track, state]) => `${track}: preference prior ${state.value.toFixed(2)}`),
      supportingApplications: count,
      sharedSupport: 0,
      basis: 'personal',
    };
  }

  async contextSidePrior(input: { personId: string; opportunityId: string }): Promise<ContextSidePrior> {
    const count = this.#evidenceCounts.get('accessibility') ?? 0;
    return {
      opportunityId: input.opportunityId,
      observations: [...this.#accessibility.entries()].map(([track, state]) => `${track}: accessibility prior ${state.value.toFixed(2)}`),
      supportingApplications: count,
      sharedSupport: 0,
      basis: 'personal',
    };
  }

  async routingPrior(input: {
    readonly personId: string;
    readonly opportunityId: string;
    readonly representationIds: readonly string[];
  }): Promise<RoutingPrior> {
    const weights = new Map<string, number>();
    for (const id of input.representationIds) {
      const state = this.#track.get(id);
      if (state) weights.set(id, state.value * state.confidence);
    }
    return { weights };
  }

  state(): PciState {
    return {
      preferencePriors: new Map(this.#preference),
      accessibilityPriors: new Map(this.#accessibility),
      calibrationPriors: new Map(this.#calibration),
      byRepresentationTrack: new Map(this.#track),
      global: this.#global,
      evidenceCounts: new Map(this.#evidenceCounts),
      confidence: this.#global.confidence,
    };
  }

  #apply(signal: PciSignal): void {
    const alpha = 0.08 * strengthWeight(signal.evidenceStrength);
    const map = this.#familyMap(signal.family);
    const prior = map.get(signal.track) ?? { value: 0.5, evidenceCount: 0, confidence: 0 };
    const next = updateState(prior, signal.value, alpha);
    map.set(signal.track, next);
    this.#track.set(signal.track, updateState(this.#track.get(signal.track) ?? prior, signal.value, alpha));
    this.#global = updateState(this.#global.evidenceCount === 0 ? { value: 0.5, evidenceCount: 0, confidence: 0 } : this.#global, signal.value, alpha);
    this.#evidenceCounts.set(signal.family, (this.#evidenceCounts.get(signal.family) ?? 0) + 1);
  }

  #familyMap(family: PciSignalFamily): Map<string, PciSignalState> {
    if (family === 'preference') return this.#preference;
    if (family === 'accessibility') return this.#accessibility;
    return this.#calibration;
  }
}

export function deriveSignals(observation: CareerObservation): readonly PciSignal[] {
  return [
    {
      family: 'preference',
      track: observation.representationTrack ?? 'global',
      value: preferenceValue(observation.decision),
      evidenceStrength: observation.evidenceStrength,
      reason: `Decision: ${observation.decision}`,
    },
    {
      family: 'accessibility',
      track: observation.representationTrack ?? 'global',
      value: worldValue(observation.worldOutcome),
      evidenceStrength: observation.evidenceStrength,
      reason: `World outcome: ${observation.worldOutcome}`,
    },
    {
      family: 'calibration',
      track: observation.representationTrack ?? 'global',
      value: observation.attributionConfidence,
      evidenceStrength: observation.evidenceStrength,
      reason: observation.inferredExplanation ?? 'Calibration signal without causal explanation.',
    },
  ];
}

function updateState(previous: PciSignalState, observed: number, alpha: number): PciSignalState {
  return {
    value: (1 - alpha) * previous.value + alpha * observed,
    evidenceCount: previous.evidenceCount + 1,
    confidence: Math.min(1, previous.confidence + alpha),
  };
}

function strengthWeight(strength: EvidenceStrength): number {
  if (strength === 'strong') return 1;
  if (strength === 'moderate') return 0.6;
  if (strength === 'weak') return 0.3;
  return 0.1;
}

function preferenceValue(decision: string): number {
  const normalised = decision.toLowerCase();
  if (normalised.includes('preferred') || normalised.includes('apply') || normalised.includes('chose')) return 1;
  if (normalised.includes('dismiss') || normalised.includes('ignored') || normalised.includes('skip')) return 0;
  return 0.5;
}

function worldValue(outcome: string): number {
  const normalised = outcome.toLowerCase();
  if (normalised.includes('offer') || normalised.includes('hired')) return 1;
  if (normalised.includes('interview') || normalised.includes('progress')) return 0.75;
  if (normalised.includes('reject') || normalised.includes('no_response')) return 0.15;
  return 0.5;
}
