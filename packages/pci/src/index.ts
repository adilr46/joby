/**
 * **PCI** — the learned PERSON × WORLD authority (ADR 0031).
 *
 * ```text
 * resolved Application evidence  ->  PCI  ->  person-side / context-side / routing priors
 * ```
 *
 * PCI is not part of Identity. Identity owns what is professionally *true* about the person; PCI
 * owns what Joby has come to *believe* about how this person and the professional world interact.
 * Different claims, different owners — and the second must never harden into the first.
 *
 * **No learning is implemented.** The feature representation, target signals, loss function and
 * update mechanism are undecided, and a plausible default would be a learned belief nobody chose,
 * applied to someone's career. What exists is the contract that will not change as the
 * implementation grows:
 *
 * ```text
 * simple / database-backed priors
 *   -> statistical learning
 *   -> population and clustering priors
 *   -> increasingly individual models
 *   -> a dedicated ML model or service
 * ```
 *
 * Every stage sits behind `PciModel`. A consumer asks for priors and never learns which stage
 * answered, so the progression is an implementation choice rather than an architectural event.
 *
 * ## Hard invariants
 *
 * - **Learns only from resolved Application evidence.** Not live drafts, not Adaptation state, not
 *   execution telemetry. Mechanical noise — retries, selectors, captchas, transient failures —
 *   is excluded by default: logging is not meaning.
 * - **Returns priors, never truth.** PCI cannot write Identity, Opportunity, Adaptation or a
 *   historical Application. There is no write on any interface here pointing at them.
 * - **User response and world response stay distinct.** `user preference ≠ external effectiveness`.
 *   Someone liking a framing is not evidence it works; a rejection is not evidence they were wrong
 *   to want it. One authority interpreting both is not permission to merge them.
 */

export { NoLearnedPci, SlowLearningPci, deriveSignals } from './model';
export type {
  CareerObservation,
  ContextSidePrior,
  EvidenceStrength,
  PciModel,
  PciSignal,
  PciSignalFamily,
  PciSignalState,
  PciState,
  PersonSidePrior,
  ResolvedApplicationEvidence,
  ResolvedEvidenceSignal,
  RoutingPrior,
} from './model';
