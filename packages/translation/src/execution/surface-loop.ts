/**
 * The recursive execution loop, one step at a time:
 *
 * ```text
 * Observe → Ground → Act → QueryJoby if needed → QueryUser if unresolved → Verify → Repeat
 * ```
 *
 * This module composes the three services ADR 0035/0036 already built — surface inspection, surface
 * resolution, deterministic action execution — into **one step per execution surface**, the unit the
 * goal names: `1 ExecutionSurface ≈ 1 Claude reasoning pass`. `inspectSurface` is the only Claude
 * call in a step; resolution and execution are deterministic composition on top of it.
 *
 * `step` does not drive a browser and does not recurse on its own. It accepts one observation of the
 * current surface, does exactly one Ground → Act → Verify pass, and returns a structured outcome
 * telling the caller what to do next — fetch a fresh observation and step again, ask the person, or
 * stop. Recursion across many *materially different* surfaces is the caller's loop, calling `step`
 * repeatedly with whatever the browser shows after each step — a composition-root decision this
 * module does not make, the same boundary ADR 0035/0036 already drew around live browser wiring.
 * "The executor must not assume the browser remains in the same state during the interruption": every
 * step takes a fresh observation as an argument, never reuses one from a previous call.
 */

import { SessionNotFoundError, type ApplicationSessionModule } from './session-contract';
import type { ApplicationSession } from './session';
import type { PageObservation } from './surface-observation';
import type { SurfaceInspectionModule } from './surface-contract';
import type { RequirementResolutionOutcome, SurfaceResolutionModule } from './surface-resolution';
import type { ActionValidationMismatch, SurfaceExecutionModule } from './surface-execution';

/**
 * A validation mismatch on the same element this many times in Session Memory means repair is not
 * converging — three attempts is enough to distinguish "the fix needs one more pass" from "this is
 * not going to resolve itself", without turning every genuine mechanical hiccup into a hard stop.
 */
const MAX_REPAIR_ATTEMPTS = 3;

export interface RunExecutionStepInput {
  readonly sessionId: string;
  /** What the portal shows right now — the surface this step grounds and acts on. */
  readonly observation: PageObservation;
  /**
   * What the portal shows after this step's actions were attempted. Required whenever the step will
   * actually act on something — omitting it falls back to the pre-action observation, which will
   * report every filled field as a mismatch, because a snapshot taken before acting cannot show the
   * result of acting. Safe to omit only when nothing will be filled (a surface with no resolvable
   * requirements yet), where there is nothing for a fresh look to disagree with either way.
   */
  readonly postActionObservation?: PageObservation | (() => Promise<PageObservation>);
  readonly knownFacts?: readonly { readonly label: string; readonly value: string }[];
}

export type ExecutionStepOutcome =
  /** More of this surface (or the next one) remains — call `step` again with a fresh observation. */
  | { readonly status: 'continue'; readonly session: ApplicationSession }
  /** Joby could not resolve something safely. The session is paused; resume once the person answers. */
  | {
      readonly status: 'waiting_for_user';
      readonly session: ApplicationSession;
      readonly pendingQuestions: readonly RequirementResolutionOutcome[];
    }
  /** Every tracked requirement is resolved and something is prepared — `deriveSubmissionReadiness` agrees. */
  | { readonly status: 'submission_ready'; readonly session: ApplicationSession }
  /** An executed action does not match reality. Re-ground on the next observation before retrying. */
  | {
      readonly status: 'needs_repair';
      readonly session: ApplicationSession;
      readonly mismatches: readonly ActionValidationMismatch[];
    }
  /** The same mismatch has not converged after repeated attempts — an irrecoverable blocker. */
  | { readonly status: 'blocked'; readonly session: ApplicationSession; readonly reason: string };

export interface SurfaceLoopModule {
  /**
   * One Ground → Act → Verify pass over one observed surface. Never assumes an action succeeded
   * without observing the result, never queries Joby for a `portal_operation` or an already-`known`
   * requirement, and never guesses at what Joby or the person did not resolve.
   */
  step(input: RunExecutionStepInput): Promise<ExecutionStepOutcome>;
}

export class SurfaceLoopService implements SurfaceLoopModule {
  readonly #inspection: SurfaceInspectionModule;
  readonly #resolution: SurfaceResolutionModule;
  readonly #execution: SurfaceExecutionModule;
  readonly #sessions: ApplicationSessionModule;

  constructor(dependencies: {
    inspection: SurfaceInspectionModule;
    resolution: SurfaceResolutionModule;
    execution: SurfaceExecutionModule;
    sessions: ApplicationSessionModule;
  }) {
    this.#inspection = dependencies.inspection;
    this.#resolution = dependencies.resolution;
    this.#execution = dependencies.execution;
    this.#sessions = dependencies.sessions;
  }

  async step(input: RunExecutionStepInput): Promise<ExecutionStepOutcome> {
    if (!(await this.#sessions.getSession(input.sessionId))) throw new SessionNotFoundError(input.sessionId);

    // Ground: ADR 0035's one Claude call per surface. Conditional or newly-appeared requirements on
    // this same observation are just more entries `addRequirements` appends — no special case needed
    // for "a new field showed up on this surface".
    const inspected = await this.#inspection.inspectSurface({
      sessionId: input.sessionId,
      observation: input.observation,
      ...(input.knownFacts ? { knownFacts: input.knownFacts } : {}),
    });

    // Query Joby only for what this surface actually still needs.
    const resolved = await this.#resolution.resolveRequirements({ sessionId: input.sessionId });

    if (resolved.needsUser.length > 0) {
      // Missing, ambiguous or conflicting information becomes a user clarification, never a guess —
      // and the session is already paused by `resolveRequirements`.
      await this.#sessions.setExecutionLevel({ sessionId: input.sessionId, level: 'awaiting_input' });
      const session = await this.#require(input.sessionId);
      return { status: 'waiting_for_user', session, pendingQuestions: resolved.needsUser };
    }

    // Act, then verify: execute whatever is resolvable, then check the result was actually observed
    // to happen — never assumed.
    const executed = await this.#execution.executeActions({
      sessionId: input.sessionId,
      surface: inspected.surface,
      freshObservation: input.postActionObservation ?? input.observation,
    });

    if (executed.mismatches.length > 0) {
      if (this.#hasStoppedConverging(executed.session, executed.mismatches)) {
        await this.#sessions.setExecutionLevel({ sessionId: input.sessionId, level: 'failed' });
        const reason = `Blocked: repeated validation mismatch on ${executed.mismatches
          .map((m) => m.surfaceElementId)
          .join(', ')} did not converge after ${MAX_REPAIR_ATTEMPTS} attempts.`;
        const session = await this.#sessions.recordSessionNote({ sessionId: input.sessionId, note: reason });
        return { status: 'blocked', session, reason };
      }
      // Validation contradicts what was expected — Working Application State already reflects
      // reality (the execution service does not overwrite it), so the next `step` call re-grounds
      // against the current observation rather than the plan that just failed.
      return { status: 'needs_repair', session: executed.session, mismatches: executed.mismatches };
    }

    const readiness = await this.#sessions.getSubmissionReadiness(input.sessionId);
    if (readiness.ready) {
      const session = await this.#sessions.setExecutionLevel({ sessionId: input.sessionId, level: 'ready_to_submit' });
      return { status: 'submission_ready', session };
    }

    return { status: 'continue', session: executed.session };
  }

  /** Session Memory already records each mismatch by element id; this reads it back rather than adding new state. */
  #hasStoppedConverging(session: ApplicationSession, mismatches: readonly ActionValidationMismatch[]): boolean {
    return mismatches.some((mismatch) => {
      const occurrences = session.memory.notes.filter((note) =>
        note.includes(`Validation mismatch: ${mismatch.surfaceElementId}`),
      ).length;
      return occurrences >= MAX_REPAIR_ATTEMPTS;
    });
  }

  async #require(sessionId: string): Promise<ApplicationSession> {
    const session = await this.#sessions.getSession(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    return session;
  }
}

export function createSurfaceLoopModule(dependencies: {
  inspection: SurfaceInspectionModule;
  resolution: SurfaceResolutionModule;
  execution: SurfaceExecutionModule;
  sessions: ApplicationSessionModule;
}): SurfaceLoopModule {
  return new SurfaceLoopService(dependencies);
}
