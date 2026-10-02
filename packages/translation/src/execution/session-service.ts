/** `ApplicationSessionService implements ApplicationSessionModule`, enforced by the compiler. */

import { randomUUID } from 'node:crypto';

import type { Database } from '@joby/database';

import {
  RequirementNotFoundError,
  SessionAlreadySubmittedError,
  SessionNotFoundError,
  type AddRequirementsInput,
  type ApplicationSessionModule,
  type CreateOrResumeSessionInput,
  type RecordSessionNoteInput,
  type ResolveRequirementInput,
  type SetExecutionLevelInput,
  type UpdatePortalContextInput,
  type UpdateWorkingStateInput,
} from './session-contract';
import { ApplicationSessionRepository } from './session-repository';
import {
  deriveSubmissionReadiness,
  type ApplicationSession,
  type SessionRequirement,
  type SubmissionReadiness,
} from './session';

/** Notes accumulate; unbounded growth over one attempt is not a realistic risk, but capped anyway. */
const MAX_NOTES = 100;

export class ApplicationSessionService implements ApplicationSessionModule {
  readonly #db: Database;
  readonly #repository: ApplicationSessionRepository;

  constructor(dependencies: { db: Database; repository: ApplicationSessionRepository }) {
    this.#db = dependencies.db;
    this.#repository = dependencies.repository;
  }

  async createOrResumeSession(input: CreateOrResumeSessionInput): Promise<ApplicationSession> {
    const existing = await this.#repository.findByPersonAndOpportunity(input.personId, input.opportunityId);
    // Resuming returns exactly what is there. A caller supplying a fresher opportunity revision or a
    // newly known applicationId does not get to silently rewrite an attempt already in progress —
    // that is a deliberate update through the other methods below, not an implicit side effect of
    // asking to resume.
    if (existing) return existing;

    return this.#repository.insert(this.#db, {
      id: randomUUID(),
      personId: input.personId,
      opportunityId: input.opportunityId,
      ...(input.applicationId ? { applicationId: input.applicationId } : {}),
      jobContext: {
        opportunityId: input.opportunityId,
        opportunityRevision: input.opportunityRevision,
        ...(input.role ? { role: input.role } : {}),
        ...(input.company ? { company: input.company } : {}),
      },
      requirements: (input.requirements ?? []).map(
        (requirement): SessionRequirement => ({
          id: requirement.id,
          label: requirement.label,
          status: 'unresolved',
        }),
      ),
    });
  }

  getSession(sessionId: string): Promise<ApplicationSession | undefined> {
    return this.#repository.find(sessionId);
  }

  findSession(personId: string, opportunityId: string): Promise<ApplicationSession | undefined> {
    return this.#repository.findByPersonAndOpportunity(personId, opportunityId);
  }

  listSessions(personId: string): Promise<readonly ApplicationSession[]> {
    return this.#repository.listForPerson(personId);
  }

  async updatePortalContext(input: UpdatePortalContextInput): Promise<ApplicationSession> {
    const session = await this.#require(input.sessionId);
    return this.#update(session, {
      portalContext: {
        ...(input.portalKind ?? session.portalContext.portalKind
          ? { portalKind: input.portalKind ?? session.portalContext.portalKind }
          : {}),
        ...(input.currentStepId ?? session.portalContext.currentStepId
          ? { currentStepId: input.currentStepId ?? session.portalContext.currentStepId }
          : {}),
      },
    });
  }

  async updateWorkingState(input: UpdateWorkingStateInput): Promise<ApplicationSession> {
    const session = await this.#require(input.sessionId);
    return this.#update(session, {
      workingState: {
        ...(input.intent ?? session.workingState.intent
          ? { intent: input.intent ?? session.workingState.intent }
          : {}),
        portalFieldValues: { ...session.workingState.portalFieldValues, ...input.portalFieldValues },
      },
    });
  }

  async setExecutionLevel(input: SetExecutionLevelInput): Promise<ApplicationSession> {
    const session = await this.#require(input.sessionId);
    if (session.executionLevel === 'submitted' && input.level !== 'submitted') {
      // Once submitted, a session is history-adjacent: Execution attempted and the attempt
      // concluded. Reopening it here would let session state disagree with whatever Application
      // later records as Xₙ.
      throw new SessionAlreadySubmittedError(session.id);
    }
    return this.#update(session, { executionLevel: input.level });
  }

  async resolveRequirement(input: ResolveRequirementInput): Promise<ApplicationSession> {
    const session = await this.#require(input.sessionId);
    if (!session.requirements.some((requirement) => requirement.id === input.requirementId)) {
      throw new RequirementNotFoundError(input.requirementId);
    }

    const requirements = session.requirements.map((requirement) =>
      requirement.id === input.requirementId
        ? {
            ...requirement,
            status: input.status,
            ...(input.resolvedValue ? { resolvedValue: input.resolvedValue } : {}),
          }
        : requirement,
    );
    return this.#update(session, { requirements });
  }

  async addRequirements(input: AddRequirementsInput): Promise<ApplicationSession> {
    const session = await this.#require(input.sessionId);
    const existingIds = new Set(session.requirements.map((requirement) => requirement.id));
    // Rediscovering the same field is not a second requirement — skip anything already tracked
    // rather than letting a repeated inspection duplicate or silently reset its status.
    const additions = input.requirements.filter((requirement) => !existingIds.has(requirement.id));
    if (additions.length === 0) return session;

    const requirements: SessionRequirement[] = [
      ...session.requirements,
      ...additions.map(
        (requirement): SessionRequirement => ({
          id: requirement.id,
          label: requirement.label,
          status: requirement.status ?? 'unresolved',
          ...(requirement.resolvedValue ? { resolvedValue: requirement.resolvedValue } : {}),
          ...(requirement.kind ? { kind: requirement.kind } : {}),
          ...(requirement.surfaceElementId ? { surfaceElementId: requirement.surfaceElementId } : {}),
        }),
      ),
    ];
    return this.#update(session, { requirements });
  }

  async recordSessionNote(input: RecordSessionNoteInput): Promise<ApplicationSession> {
    const session = await this.#require(input.sessionId);
    const notes = input.note
      ? [...session.memory.notes, input.note].slice(-MAX_NOTES)
      : session.memory.notes;

    return this.#update(session, {
      memory: {
        notes,
        ...(input.lastAction ?? session.memory.lastAction
          ? { lastAction: input.lastAction ?? session.memory.lastAction }
          : {}),
        ...(input.nextStep ?? session.memory.nextStep
          ? { nextStep: input.nextStep ?? session.memory.nextStep }
          : {}),
      },
    });
  }

  async pauseSession(sessionId: string): Promise<ApplicationSession> {
    const session = await this.#require(sessionId);
    // Only `paused` changes. executionLevel, requirements, working state and memory are untouched —
    // pausing suspends work, it does not regress or discard any of it.
    return this.#update(session, { paused: true });
  }

  async resumeSession(sessionId: string): Promise<ApplicationSession> {
    const session = await this.#require(sessionId);
    return this.#update(session, { paused: false });
  }

  async getSubmissionReadiness(sessionId: string): Promise<SubmissionReadiness> {
    return deriveSubmissionReadiness(await this.#require(sessionId));
  }

  async #require(sessionId: string): Promise<ApplicationSession> {
    const session = await this.#repository.find(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    return session;
  }

  async #update(
    session: ApplicationSession,
    patch: Parameters<ApplicationSessionRepository['update']>[2],
  ): Promise<ApplicationSession> {
    const updated = await this.#repository.update(this.#db, session.id, patch);
    if (!updated) throw new SessionNotFoundError(session.id);
    return updated;
  }
}
