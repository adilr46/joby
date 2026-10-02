/**
 * Turning a resolved surface into deterministic portal actions, executing them, and checking the
 * result against a fresh observation — the mechanical half of one attempt.
 *
 * "Deterministic" is load-bearing: which requirements needed judgment already happened at
 * classification (ADR 0035) and resolution (`surface-resolution.ts`); turning an already-resolved
 * value into a mechanical fill/select/check/upload needs no further model call, only a fixed mapping
 * from element kind to action type. Nothing here decides *whether* to submit — button clicks stay
 * out of this slice, the same deliberate boundary ADR 0034 and ADR 0035 already drew around
 * submission.
 *
 * Mechanical outcomes — what was attempted, what failed, what did not match afterward — are Session
 * Memory, exactly as ADR 0006 requires: mechanical execution detail does not become durable
 * Application history merely by being logged.
 */

import { SessionNotFoundError, type ApplicationSessionModule } from './session-contract';
import type { ApplicationSession } from './session';
import { buildExecutionSurface, type ExecutionSurface, type PageObservation, type SurfaceElementKind } from './surface-observation';

// --- The action plan ------------------------------------------------------------------------------

export type PortalActionType = 'fill' | 'select' | 'check' | 'upload';

export interface PortalAction {
  readonly surfaceElementId: string;
  readonly type: PortalActionType;
  readonly value: string;
}

/** Submit/continue-style buttons are deliberately absent — this plan never submits anything. */
const ACTION_TYPE_BY_ELEMENT_KIND: Partial<Record<SurfaceElementKind, PortalActionType>> = {
  text_input: 'fill',
  textarea: 'fill',
  select: 'select',
  radio: 'select',
  checkbox: 'check',
  file_upload: 'upload',
};

/**
 * Build the action plan deterministically from element kind and whatever is already resolved in
 * working state. An element with no resolved value is skipped, never guessed at — the plan only ever
 * acts on what Execution actually has.
 */
export function buildActionPlan(surface: ExecutionSurface, session: ApplicationSession): readonly PortalAction[] {
  const actions: PortalAction[] = [];
  for (const element of surface.elements) {
    const type = ACTION_TYPE_BY_ELEMENT_KIND[element.kind];
    if (!type) continue;

    const value = session.workingState.portalFieldValues[element.id];
    if (value === undefined) continue;

    actions.push({ surfaceElementId: element.id, type, value });
  }
  return actions;
}

// --- Executing the plan ---------------------------------------------------------------------------

export interface PortalActionOutcome {
  readonly surfaceElementId: string;
  readonly status: 'executed' | 'failed';
  readonly reason?: string;
}

/**
 * Where an action actually happens. `packages/portal` remains the eventual real adapter (ADR 0029:
 * infrastructure, no semantic authority of its own, not yet implemented) — this port is what
 * Execution depends on in the meantime, and what a real Portal adapter will implement later.
 */
export interface PortalActionExecutor {
  execute(action: PortalAction): Promise<PortalActionOutcome>;
}

/** Offline double: succeeds unless the caller pre-registers a failure for that element id. */
export class DeterministicPortalActionExecutor implements PortalActionExecutor {
  readonly #failing: ReadonlySet<string>;

  constructor(failingElementIds: Iterable<string> = []) {
    this.#failing = new Set(failingElementIds);
  }

  async execute(action: PortalAction): Promise<PortalActionOutcome> {
    if (this.#failing.has(action.surfaceElementId)) {
      return { surfaceElementId: action.surfaceElementId, status: 'failed', reason: 'Simulated mechanical failure.' };
    }
    return { surfaceElementId: action.surfaceElementId, status: 'executed' };
  }
}

// --- Execute, re-observe, compare ------------------------------------------------------------------

export interface ExecuteSurfaceActionsInput {
  readonly sessionId: string;
  readonly surface: ExecutionSurface;
  /** A fresh observation of the same page, taken after the actions above were attempted. */
  readonly freshObservation: PageObservation | (() => Promise<PageObservation>);
}

export interface ActionValidationMismatch {
  readonly surfaceElementId: string;
  readonly expected: string;
  readonly observed: string | undefined;
}

export interface SurfaceExecutionResult {
  readonly plan: readonly PortalAction[];
  readonly outcomes: readonly PortalActionOutcome[];
  /** Executed actions whose fresh observation disagrees with what was expected. */
  readonly mismatches: readonly ActionValidationMismatch[];
  readonly session: ApplicationSession;
}

export interface SurfaceExecutionModule {
  /**
   * Execute the deterministic plan for one surface, then observe the portal fresh and compare
   * expected against observed. Every outcome — attempted, failed, mismatched — is recorded onto
   * Session Memory; nothing here writes or reads an Application table.
   */
  executeActions(input: ExecuteSurfaceActionsInput): Promise<SurfaceExecutionResult>;
}

export class SurfaceExecutionService implements SurfaceExecutionModule {
  readonly #executor: PortalActionExecutor;
  readonly #sessions: ApplicationSessionModule;

  constructor(dependencies: { executor: PortalActionExecutor; sessions: ApplicationSessionModule }) {
    this.#executor = dependencies.executor;
    this.#sessions = dependencies.sessions;
  }

  async executeActions(input: ExecuteSurfaceActionsInput): Promise<SurfaceExecutionResult> {
    const session = await this.#sessions.getSession(input.sessionId);
    if (!session) throw new SessionNotFoundError(input.sessionId);

    const plan = buildActionPlan(input.surface, session);
    const outcomes: PortalActionOutcome[] = [];
    for (const action of plan) {
      outcomes.push(await this.#executor.execute(action));
    }

    // The portal is freshly observed afterward, and expected vs observed states are compared —
    // never trusted from the plan alone.
    const freshObservation =
      typeof input.freshObservation === 'function' ? await input.freshObservation() : input.freshObservation;
    const freshSurface = buildExecutionSurface(freshObservation);
    const observedById = new Map(freshSurface.elements.map((element) => [element.id, element.value]));

    const executedIds = new Set(
      outcomes.filter((outcome) => outcome.status === 'executed').map((outcome) => outcome.surfaceElementId),
    );
    const mismatches: ActionValidationMismatch[] = plan
      .filter((action) => executedIds.has(action.surfaceElementId))
      .map((action) => ({
        surfaceElementId: action.surfaceElementId,
        expected: action.value,
        observed: observedById.get(action.surfaceElementId),
      }))
      .filter((mismatch) => mismatch.observed !== mismatch.expected);

    const failed = outcomes.filter((outcome) => outcome.status === 'failed');
    const noteParts = [
      `Executed ${outcomes.length - failed.length}/${outcomes.length} portal action(s).`,
      ...failed.map((f) => `Failed: ${f.surfaceElementId} — ${f.reason}`),
      ...mismatches.map(
        (m) => `Validation mismatch: ${m.surfaceElementId} expected "${m.expected}", observed "${m.observed ?? '(absent)'}".`,
      ),
    ];

    // Mechanical outcome — Session Memory, never durable Application history.
    const updated = await this.#sessions.recordSessionNote({
      sessionId: session.id,
      note: noteParts.join(' '),
      lastAction: `Attempted ${plan.length} portal action(s).`,
    });

    return { plan, outcomes, mismatches, session: updated };
  }
}

export function createSurfaceExecutionModule(dependencies: {
  executor: PortalActionExecutor;
  sessions: ApplicationSessionModule;
}): SurfaceExecutionModule {
  return new SurfaceExecutionService(dependencies);
}
