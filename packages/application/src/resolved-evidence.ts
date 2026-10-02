/**
 * The resolved-evidence projection — Application's only output toward learning.
 *
 * ```text
 * Application  ->  resolved evidence  ->  Memory / PCI
 * ```
 *
 * This is the seam ADR 0031/0032 left as unresolved implementation work: "the exact public
 * capabilities through which Opportunity and Adaptation consume PCI priors" starts here, on the
 * output side. `ResolvedApplicationEvidence` already exists as `@joby/pci`'s input contract; this
 * file is the projection that produces it, so the shape is agreed in exactly one place.
 *
 * **No learning happens here.** This module does not import `@joby/pci` and does not call it —
 * producing the seam is not consuming it. Wiring `application.getResolvedEvidence` into
 * `pci.observe` is a composition-root decision for whoever builds the worker pass that does it.
 *
 * **Only meaningful evidence crosses.** Mechanical execution detail — retries, selectors, captcha
 * checkpoints, transient portal errors — has no field here because Application never stored it in
 * the first place: this module has no such table to read from.
 */

import {
  classifyApplicationOutcome,
  classifyOutcomeKind,
  type ApplicationRecord,
  type OutcomeProgression,
} from './model';

export type ResolvedEvidenceFamily = 'user_response' | 'world_response';

export interface ResolvedEvidenceSignal {
  readonly family: ResolvedEvidenceFamily;
  readonly observation: string;
  readonly observedAt: string;
}

export interface ResolvedApplicationEvidence {
  readonly applicationId: string;
  readonly personId: string;
  readonly opportunityId: string;
  readonly representationId?: string;
  readonly resolvedAt: string;
  readonly progression: OutcomeProgression;
  readonly signals: readonly ResolvedEvidenceSignal[];
}

/**
 * Whether an application has reached a state worth projecting.
 *
 * A resolved outcome is the resolution — the world responding is what makes a history "resolved"
 * rather than "in progress". An application still awaiting one has nothing for PCI to learn from,
 * and returning nothing is the honest answer rather than a partial one.
 */
export function isResolved(record: ApplicationRecord): boolean {
  return record.outcomes.length > 0;
}

/**
 * Project an Application's history into resolved evidence, keeping the two signal families
 * distinct exactly as `@joby/pci` requires.
 *
 * - **User response**: which representation was selected versus recommended (an implicit signal
 *   about the person's own judgement), and interview reflections (their own account, in their own
 *   words — never a system-generated score).
 * - **World response**: every timeline stage reached and every resolved outcome — facts about how
 *   the external world responded, observed after the fact.
 *
 * Returns `undefined` until the application has resolved, so nothing here manufactures a signal
 * from an application still in progress.
 */
export function projectResolvedEvidence(
  record: ApplicationRecord,
): ResolvedApplicationEvidence | undefined {
  if (!isResolved(record)) return undefined;

  const signals: ResolvedEvidenceSignal[] = [];
  const progression = deriveProgression(record);

  if (
    record.representation.selectedRepresentationId &&
    record.representation.recommendedRepresentationId &&
    record.representation.selectedRepresentationId !== record.representation.recommendedRepresentationId
  ) {
    signals.push({
      family: 'user_response',
      observation: `Chose representation '${record.representation.selectedRepresentationId}' over the recommended '${record.representation.recommendedRepresentationId}'.`,
      observedAt: record.application.createdAt,
    });
  }

  for (const stage of record.interaction.interviewStages) {
    if (stage.reflection) {
      signals.push({
        family: 'user_response',
        observation: stage.reflection,
        observedAt: stage.occurredAt ?? stage.recordedAt,
      });
    }
  }

  for (const entry of record.interaction.timeline) {
    signals.push({
      family: 'world_response',
      observation: `Reached stage '${entry.stage}'${entry.note ? `: ${entry.note}` : '.'}`,
      observedAt: entry.occurredAt,
    });
  }

  for (const outcome of record.outcomes) {
    signals.push({
      family: 'world_response',
      observation: [
        `Outcome: ${outcome.canonicalType ?? outcome.kind}`,
        outcome.note ? ` — ${outcome.note}` : '',
      ].join(''),
      observedAt: outcome.occurredAt,
    });
    if (outcome.feedback) {
      signals.push({
        family: 'world_response',
        observation: `Verbatim feedback: ${outcome.feedback}`,
        observedAt: outcome.occurredAt,
      });
    }
  }

  const resolvedAt = [...record.outcomes].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).at(-1)!
    .occurredAt;

  return {
    applicationId: record.application.id,
    personId: record.application.personId,
    opportunityId: record.application.opportunityId,
    ...(record.representation.selectedRepresentationId
      ? { representationId: record.representation.selectedRepresentationId }
      : {}),
    resolvedAt,
    progression,
    signals,
  };
}

function deriveProgression(record: ApplicationRecord): OutcomeProgression {
  const timelineReachedInterview = record.interaction.timeline.some((entry) =>
    ['screening', 'interviewing', 'offer'].includes(entry.stage),
  );
  const timelineReachedOffer = record.interaction.timeline.some((entry) => entry.stage === 'offer');

  const latest = [...record.outcomes].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).at(-1)!;
  const outcomeProgression = latest.canonicalType
    ? classifyApplicationOutcome(latest.canonicalType)
    : classifyOutcomeKind(latest.kind);

  return {
    reachedInterview: outcomeProgression.reachedInterview || timelineReachedInterview,
    reachedOffer: outcomeProgression.reachedOffer || timelineReachedOffer,
    terminal: outcomeProgression.terminal,
    ...(outcomeProgression.terminalPolarity
      ? { terminalPolarity: outcomeProgression.terminalPolarity }
      : {}),
  };
}
