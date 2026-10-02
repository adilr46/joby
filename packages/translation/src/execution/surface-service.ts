/**
 * `SurfaceInspectionService implements SurfaceInspectionModule`.
 *
 * The one place the flow the goal names actually happens: Browser → Portal Context → Execution
 * Surface → Claude → Semantic requirements → Working Application State. Everything upstream of the
 * interpreter call is a pure function (`buildExecutionSurface`); everything downstream of it is
 * validated (`parseSurfaceInterpretationResult`) before it ever reaches session state.
 */

import { createHash } from 'node:crypto';

import type { ApplicationSessionModule, NewSessionRequirement } from './session-contract';
import { SessionNotFoundError } from './session-contract';
import { buildExecutionSurface } from './surface-observation';
import type {
  RecordedSurfaceRequirement,
  SurfaceInspectionInput,
  SurfaceInspectionModule,
  SurfaceInspectionResult,
} from './surface-contract';
import type { SurfaceInterpreter } from './surface-port';

/** A requirement id stable across repeated inspections of the same element on the same session. */
function requirementId(sessionId: string, surfaceElementId: string): string {
  return `surf_${createHash('sha1').update(`${sessionId}:${surfaceElementId}`).digest('hex').slice(0, 16)}`;
}

export class SurfaceInspectionService implements SurfaceInspectionModule {
  readonly #interpreter: SurfaceInterpreter;
  readonly #sessions: ApplicationSessionModule;

  constructor(dependencies: { interpreter: SurfaceInterpreter; sessions: ApplicationSessionModule }) {
    this.#interpreter = dependencies.interpreter;
    this.#sessions = dependencies.sessions;
  }

  async inspectSurface(input: SurfaceInspectionInput): Promise<SurfaceInspectionResult> {
    const session = await this.#sessions.getSession(input.sessionId);
    if (!session) throw new SessionNotFoundError(input.sessionId);

    const surface = buildExecutionSurface(input.observation);
    const knownFacts = input.knownFacts ?? [];
    const context = {
      ...(session.jobContext.role ? { role: session.jobContext.role } : {}),
      ...(session.jobContext.company ? { company: session.jobContext.company } : {}),
      knownFacts,
      resolvedRequirementLabels: session.requirements
        .filter((requirement) => requirement.status !== 'unresolved')
        .map((requirement) => requirement.label),
    };

    // Claude is called exactly once for this surface.
    const { result } = await this.#interpreter.interpret({ surface, context });

    const factValues = new Map(knownFacts.map((fact) => [fact.label, fact.value]));
    const newRequirements: NewSessionRequirement[] = [];
    const portalFieldValues: Record<string, string> = {};
    const recordedRequirements: RecordedSurfaceRequirement[] = [];

    for (const requirement of result.requirements) {
      const id = requirementId(input.sessionId, requirement.surfaceElementId);
      const isKnown = requirement.kind === 'known';
      const factValue = requirement.groundedFactLabel ? factValues.get(requirement.groundedFactLabel) : undefined;

      newRequirements.push({
        id,
        label: requirement.label,
        kind: requirement.kind,
        surfaceElementId: requirement.surfaceElementId,
        ...(isKnown ? { status: 'resolved', resolvedValue: `Known: ${requirement.groundedFactLabel}` } : {}),
      });
      recordedRequirements.push({
        id,
        label: requirement.label,
        kind: requirement.kind,
        surfaceElementId: requirement.surfaceElementId,
      });

      // A known answer prefills working state directly — this is the "update Working Application
      // State" the goal names, and it is the only case where interpretation writes a value rather
      // than just a checklist entry: the value came from a fact the caller already supplied, not
      // from anything Claude asserted on its own.
      if (isKnown && factValue !== undefined) {
        portalFieldValues[requirement.surfaceElementId] = factValue;
      }
    }

    let updated = await this.#sessions.addRequirements({ sessionId: input.sessionId, requirements: newRequirements });
    if (Object.keys(portalFieldValues).length > 0) {
      updated = await this.#sessions.updateWorkingState({ sessionId: input.sessionId, portalFieldValues });
    }

    const known = result.requirements.filter((r) => r.kind === 'known').length;
    const generated = result.requirements.filter((r) => r.kind === 'generated_answer').length;
    const userRequired = result.requirements.filter((r) => r.kind === 'user_required').length;
    const portalOps = result.requirements.filter((r) => r.kind === 'portal_operation').length;
    const noteParts = [
      `Inspected page surface (${surface.elements.length} elements): ${known} known, ${generated} generated-answer, ` +
        `${userRequired} user-required, ${portalOps} portal operation${portalOps === 1 ? '' : 's'}, ` +
        `${result.unclear.length} unclear.`,
      // Unresolved meaning is represented rather than guessed: every element the interpreter could
      // not classify is named here, not silently dropped.
      ...result.unclear.map(
        (item) => `Unclear: element ${item.surfaceElementId} — ${item.note}`,
      ),
    ];

    updated = await this.#sessions.recordSessionNote({
      sessionId: input.sessionId,
      note: noteParts.join(' '),
      ...(userRequired > 0 ? { nextStep: `${userRequired} field(s) need the person's own input.` } : {}),
    });

    return {
      surface,
      interpretation: result,
      recordedRequirements,
      unclear: result.unclear,
      session: updated,
    };
  }
}
