/**
 * Resolving what a grounded surface requires — without Execution knowing or orchestrating Joby's
 * authority graph itself.
 *
 * The shape is deliberately conversational and one-directional:
 *
 * ```text
 * Execution: "I need the answer to this requirement."
 * Joby:      "Here is the authorised answer." | "I cannot resolve this safely."
 * Execution: → use it, or ask the person.
 * ```
 *
 * `JobyQueryPort` is Execution's own narrow, consumer-side view of that conversation — not a shared
 * interface with Identity, Adaptation, Opportunity or Application. Which of those actually answers a
 * given query is a composition-root decision (ADR 0031's "consumer-side port declared locally"
 * pattern, the same one Adaptation already uses for its own Opportunity port); this module only ever
 * asks a question and accepts an answer or a safe refusal.
 */

import { SessionNotFoundError, type ApplicationSessionModule } from './session-contract';
import type { ApplicationSession, SurfaceRequirementKind } from './session';

// --- The query boundary -------------------------------------------------------------------------

/**
 * Where an answer came from — the sources the goal names. Execution never picks among these itself;
 * whichever module answers reports which one it used, and that provenance rides onto the session's
 * `resolvedValue` pointer for the same reason every other resolved-value pointer in this module is a
 * short label, never the canonical answer itself.
 */
export type JobyQuerySource =
  | 'known_professional_fact'
  | 'stated_context'
  | 'accepted_document'
  | 'opportunity_information'
  | 'generated_answer'
  | 'resolved_application_information';

export interface JobyQuery {
  readonly personId: string;
  readonly opportunityId: string;
  readonly requirementLabel: string;
  readonly requirementKind: SurfaceRequirementKind;
}

export type JobyQueryResult =
  | { readonly status: 'resolved'; readonly value: string; readonly source: JobyQuerySource }
  | {
      readonly status: 'unresolved';
      /** Distinct reasons, because "nothing exists" and "two things disagree" call for different UI. */
      readonly reason: 'not_found' | 'ambiguous' | 'conflicting';
      readonly explanation: string;
    };

export interface JobyQueryPort {
  resolve(query: JobyQuery): Promise<JobyQueryResult>;
}

/**
 * Offline double for tests and local development: a fixed table of requirement label → answer,
 * matched case-insensitively. Anything not in the table is `not_found` — never a guess.
 */
export class DeterministicJobyQueryPort implements JobyQueryPort {
  readonly #answers: ReadonlyMap<string, JobyQueryResult>;

  constructor(answers: ReadonlyMap<string, JobyQueryResult> | Record<string, JobyQueryResult>) {
    this.#answers = answers instanceof Map ? answers : new Map(Object.entries(answers));
  }

  async resolve(query: JobyQuery): Promise<JobyQueryResult> {
    const key = query.requirementLabel.trim().toLowerCase();
    for (const [label, result] of this.#answers) {
      if (label.trim().toLowerCase() === key) return result;
    }
    return {
      status: 'unresolved',
      reason: 'not_found',
      explanation: `No answer available for "${query.requirementLabel}".`,
    };
  }
}

// --- Resolving one session's unresolved requirements --------------------------------------------

export interface ResolveSessionRequirementsInput {
  readonly sessionId: string;
}

export interface RequirementResolutionOutcome {
  readonly requirementId: string;
  readonly label: string;
  readonly source?: JobyQuerySource;
  readonly reason?: string;
}

export interface SurfaceResolutionResult {
  readonly resolved: readonly RequirementResolutionOutcome[];
  readonly needsUser: readonly RequirementResolutionOutcome[];
  readonly session: ApplicationSession;
}

export interface SurfaceResolutionModule {
  /**
   * Query Joby for exactly the requirements that need application-specific information — a
   * `portal_operation` is mechanical and needs none, and a `known` requirement is already resolved
   * by the time this runs (ADR 0035's inspection only records `known` once it has matched a fact).
   * A resolved answer lands on the requirement and, where grounded to a surface element, on
   * `workingState.portalFieldValues`. An unresolved, ambiguous or conflicting answer never becomes a
   * guess — it becomes a user clarification, and the session pauses until the person acts.
   */
  resolveRequirements(input: ResolveSessionRequirementsInput): Promise<SurfaceResolutionResult>;
}

export class SurfaceResolutionService implements SurfaceResolutionModule {
  readonly #query: JobyQueryPort;
  readonly #sessions: ApplicationSessionModule;

  constructor(dependencies: { query: JobyQueryPort; sessions: ApplicationSessionModule }) {
    this.#query = dependencies.query;
    this.#sessions = dependencies.sessions;
  }

  async resolveRequirements(input: ResolveSessionRequirementsInput): Promise<SurfaceResolutionResult> {
    const session = await this.#sessions.getSession(input.sessionId);
    if (!session) throw new SessionNotFoundError(input.sessionId);

    // Simple portal actions need no query at all: `portal_operation` is mechanical, and a `kind`-less
    // requirement was added some other way and is not this module's business.
    const queryable = session.requirements.filter(
      (requirement) =>
        requirement.status === 'unresolved' && requirement.kind !== undefined && requirement.kind !== 'portal_operation',
    );

    const resolved: RequirementResolutionOutcome[] = [];
    const needsUser: RequirementResolutionOutcome[] = [];
    const portalFieldValues: Record<string, string> = {};

    for (const requirement of queryable) {
      const result = await this.#query.resolve({
        personId: session.personId,
        opportunityId: session.opportunityId,
        requirementLabel: requirement.label,
        requirementKind: requirement.kind!,
      });

      if (result.status === 'resolved') {
        await this.#sessions.resolveRequirement({
          sessionId: session.id,
          requirementId: requirement.id,
          status: 'resolved',
          resolvedValue: `Resolved via ${result.source}`,
        });
        if (requirement.surfaceElementId) portalFieldValues[requirement.surfaceElementId] = result.value;
        resolved.push({ requirementId: requirement.id, label: requirement.label, source: result.source });
      } else {
        // Execution does not invent missing information. Whatever Joby could not resolve safely
        // stays exactly as unresolved as it was — the only thing that changes is that it is now
        // known to need the person, not another attempt.
        needsUser.push({ requirementId: requirement.id, label: requirement.label, reason: result.explanation });
      }
    }

    let session2 = session;
    if (Object.keys(portalFieldValues).length > 0) {
      session2 = await this.#sessions.updateWorkingState({ sessionId: session.id, portalFieldValues });
    }

    const noteParts = [
      `Resolved ${resolved.length}/${queryable.length} requirement(s) via Joby query.`,
      ...needsUser.map((n) => `Needs user: ${n.label} — ${n.reason}`),
    ];
    session2 = await this.#sessions.recordSessionNote({
      sessionId: session.id,
      note: noteParts.join(' '),
      ...(needsUser.length > 0 ? { nextStep: `${needsUser.length} field(s) need the person's own input.` } : {}),
    });

    if (needsUser.length > 0) {
      // Ambiguous, conflicting or unavailable information becomes a user clarification, and that
      // clarification pauses the Application Session until execution resumes.
      session2 = await this.#sessions.pauseSession(session.id);
    }

    return { resolved, needsUser, session: session2 };
  }
}

export function createSurfaceResolutionModule(dependencies: {
  query: JobyQueryPort;
  sessions: ApplicationSessionModule;
}): SurfaceResolutionModule {
  return new SurfaceResolutionService(dependencies);
}
