/**
 * The recursive execution loop, against real PostgreSQL (ADR 0037).
 *
 * The acceptance criteria this file exists to prove: execution traverses multiple materially
 * different surfaces without any portal-specific path; simple actions never trigger an unnecessary
 * Joby query; missing/ambiguous information pauses the session rather than guessing, and execution
 * resumes cleanly with a fresh observation afterward; a validation mismatch triggers repair rather
 * than being ignored, and repeated non-convergence becomes an explicit `blocked` outcome;
 * submission-readiness is explicitly detected; and none of it ever touches an Application table.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '@joby/database';
import {
  DeterministicJobyQueryPort,
  DeterministicPortalActionExecutor,
  DeterministicSurfaceInterpreter,
  createApplicationSessionModule,
  createSurfaceExecutionModule,
  createSurfaceInspectionModule,
  createSurfaceLoopModule,
  createSurfaceResolutionModule,
  type ApplicationSessionModule,
  type JobyQuery,
  type JobyQueryPort,
  type JobyQueryResult,
  type PageObservation,
  type SurfaceLoopModule,
} from '@joby/translation/execution';

import { connectTestDatabase, hasDatabase, truncateApplication, truncateExecutionSession } from './support/database';

const describeIntegration = hasDatabase ? describe : (describe.skip.bind(null) as typeof describe);

if (!hasDatabase) {
  console.warn('\n[tests] SKIPPING execution surface loop tests: DATABASE_URL is not set.\n');
}

/** Counts calls so tests can assert Joby is queried only when a requirement actually needs it. */
class CountingJobyQueryPort implements JobyQueryPort {
  callCount = 0;
  constructor(private readonly inner: JobyQueryPort) {}
  async resolve(query: JobyQuery): Promise<JobyQueryResult> {
    this.callCount += 1;
    return this.inner.resolve(query);
  }
}

/** A fresh observation showing the given elements now holding these values — what a real re-observe would return. */
function withValues(page: PageObservation, values: Record<string, string>): PageObservation {
  return {
    ...page,
    elements: page.elements.map((element) =>
      values[element.id] !== undefined ? { ...element, value: values[element.id] } : element,
    ),
  };
}

function buildLoop(sessions: ApplicationSessionModule, query: JobyQueryPort, failingIds: Iterable<string> = []) {
  const inspection = createSurfaceInspectionModule({ interpreter: new DeterministicSurfaceInterpreter(), sessions });
  const resolution = createSurfaceResolutionModule({ sessions, query });
  const execution = createSurfaceExecutionModule({ sessions, executor: new DeterministicPortalActionExecutor(failingIds) });
  return createSurfaceLoopModule({ inspection, resolution, execution, sessions });
}

const surfaceOne: PageObservation = {
  url: 'https://portal-one.example/apply/step-1',
  elements: [
    { id: 's1-name', kind: 'text_input', label: 'Full name', required: true },
    { id: 's1-consent', kind: 'checkbox', label: 'I agree to the privacy policy', required: true },
    { id: 's1-continue', kind: 'button', label: 'Continue' },
  ],
};

/** A structurally different second surface — different element ids, kinds and shape entirely. */
const surfaceTwo: PageObservation = {
  url: 'https://portal-one.example/apply/step-2',
  elements: [
    { id: 's2-why', kind: 'textarea', label: 'Why do you want to work here?', required: true },
    { id: 's2-start', kind: 'select', label: 'Earliest start date', options: ['ASAP', 'In 3 months'] },
  ],
};

describeIntegration('the recursive execution loop against real PostgreSQL', () => {
  let db: Database;
  let sessions: ApplicationSessionModule;

  beforeAll(async () => {
    db = await connectTestDatabase();
    sessions = createApplicationSessionModule({ db });
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await truncateExecutionSession(db);
    await truncateApplication(db);
  });

  it('queries Joby only when a requirement needs application-specific information', async () => {
    const session = await sessions.createOrResumeSession({ personId: 'p1', opportunityId: 'opp-1', opportunityRevision: 1 });
    const counting = new CountingJobyQueryPort(
      new DeterministicJobyQueryPort({ 'Full name': { status: 'resolved', value: 'Ada Lovelace', source: 'known_professional_fact' } }),
    );
    const loop = buildLoop(sessions, counting);

    const outcome = await loop.step({
      sessionId: session.id,
      observation: surfaceOne,
      postActionObservation: withValues(surfaceOne, { 's1-name': 'Ada Lovelace' }),
    });

    // Only "Full name" (user_required) needed a query — the consent checkbox is portal_operation
    // and the continue button is not a requirement at all.
    expect(counting.callCount).toBe(1);
    expect(outcome.status).toBe('continue');
  });

  it('traverses multiple materially different surfaces with the same code, no portal-specific path', async () => {
    const session = await sessions.createOrResumeSession({ personId: 'p2', opportunityId: 'opp-2', opportunityRevision: 1 });
    const query = new DeterministicJobyQueryPort({
      'Full name': { status: 'resolved', value: 'Ada Lovelace', source: 'known_professional_fact' },
      'Why do you want to work here?': { status: 'resolved', value: 'Because of the mission.', source: 'generated_answer' },
    });
    const loop = buildLoop(sessions, query);

    const first = await loop.step({
      sessionId: session.id,
      observation: surfaceOne,
      postActionObservation: withValues(surfaceOne, { 's1-name': 'Ada Lovelace' }),
    });
    expect(first.status).toBe('continue');
    expect(first.session.workingState.portalFieldValues['s1-name']).toBe('Ada Lovelace');

    // A structurally unrelated second surface, same session, same loop — nothing here branches on
    // which portal or step this is.
    const second = await loop.step({
      sessionId: session.id,
      observation: surfaceTwo,
      postActionObservation: withValues(surfaceTwo, { 's2-why': 'Because of the mission.' }),
    });
    expect(second.status).toBe('continue');
    expect(second.session.workingState.portalFieldValues['s2-why']).toBe('Because of the mission.');

    // Both surfaces' requirements accumulated on the one session.
    const ids = second.session.requirements.map((r) => r.id);
    expect(ids.length).toBeGreaterThanOrEqual(3);
  });

  it('pauses on ambiguous information and resumes cleanly once the person answers, re-observing fresh', async () => {
    const session = await sessions.createOrResumeSession({ personId: 'p3', opportunityId: 'opp-3', opportunityRevision: 1 });
    const ambiguousQuery = new DeterministicJobyQueryPort({});
    const loop = buildLoop(sessions, ambiguousQuery);

    const paused = await loop.step({ sessionId: session.id, observation: surfaceOne });
    expect(paused.status).toBe('waiting_for_user');
    if (paused.status !== 'waiting_for_user') throw new Error('unreachable');
    expect(paused.pendingQuestions.map((q) => q.label)).toContain('Full name');
    expect(paused.session.paused).toBe(true);
    expect(paused.session.executionLevel).toBe('awaiting_input');

    // The person answers; the caller resumes the session and re-observes the portal before stepping
    // again — never assuming the browser stayed as it was during the interruption.
    await sessions.resumeSession(session.id);
    const resolvedNow = buildLoop(
      sessions,
      new DeterministicJobyQueryPort({ 'Full name': { status: 'resolved', value: 'Ada Lovelace', source: 'stated_context' } }),
    );
    const resumed = await resolvedNow.step({
      sessionId: session.id,
      observation: surfaceOne,
      postActionObservation: withValues(surfaceOne, { 's1-name': 'Ada Lovelace' }),
    });
    expect(resumed.status).toBe('continue');
    expect(resumed.session.paused).toBe(false);
    expect(resumed.session.workingState.portalFieldValues['s1-name']).toBe('Ada Lovelace');
  });

  it('reports needs_repair when an executed action does not match a fresh observation', async () => {
    const session = await sessions.createOrResumeSession({ personId: 'p4', opportunityId: 'opp-4', opportunityRevision: 1 });
    const query = new DeterministicJobyQueryPort({
      'Full name': { status: 'resolved', value: 'Ada Lovelace', source: 'known_professional_fact' },
    });
    const loop = buildLoop(sessions, query);

    const mismatchedObservation: PageObservation = {
      url: surfaceOne.url,
      elements: [{ id: 's1-name', kind: 'text_input', label: 'Full name', value: 'Someone Else' }],
    };

    const outcome = await loop.step({
      sessionId: session.id,
      observation: surfaceOne,
      postActionObservation: mismatchedObservation,
    });

    expect(outcome.status).toBe('needs_repair');
    if (outcome.status !== 'needs_repair') throw new Error('unreachable');
    expect(outcome.mismatches).toEqual([{ surfaceElementId: 's1-name', expected: 'Ada Lovelace', observed: 'Someone Else' }]);
    // Validation failure becomes explicit current-session state, in Session Memory.
    expect(outcome.session.memory.notes.some((n) => n.includes('Validation mismatch: s1-name'))).toBe(true);
  });

  it('becomes blocked once the same mismatch fails to converge across repeated attempts', async () => {
    const session = await sessions.createOrResumeSession({ personId: 'p5', opportunityId: 'opp-5', opportunityRevision: 1 });
    const query = new DeterministicJobyQueryPort({
      'Full name': { status: 'resolved', value: 'Ada Lovelace', source: 'known_professional_fact' },
    });
    const loop = buildLoop(sessions, query);
    const mismatchedObservation: PageObservation = {
      url: surfaceOne.url,
      elements: [{ id: 's1-name', kind: 'text_input', label: 'Full name', value: 'Someone Else' }],
    };

    let outcome = await loop.step({ sessionId: session.id, observation: surfaceOne, postActionObservation: mismatchedObservation });
    expect(outcome.status).toBe('needs_repair');
    outcome = await loop.step({ sessionId: session.id, observation: surfaceOne, postActionObservation: mismatchedObservation });
    expect(outcome.status).toBe('needs_repair');
    outcome = await loop.step({ sessionId: session.id, observation: surfaceOne, postActionObservation: mismatchedObservation });

    expect(outcome.status).toBe('blocked');
    expect(outcome.session.executionLevel).toBe('failed');
  });

  it('detects submission readiness explicitly once everything is resolved and prepared', async () => {
    const session = await sessions.createOrResumeSession({ personId: 'p6', opportunityId: 'opp-6', opportunityRevision: 1 });
    const query = new DeterministicJobyQueryPort({
      'Full name': { status: 'resolved', value: 'Ada Lovelace', source: 'known_professional_fact' },
    });
    const loop = buildLoop(sessions, query);

    const first = await loop.step({
      sessionId: session.id,
      observation: surfaceOne,
      postActionObservation: withValues(surfaceOne, { 's1-name': 'Ada Lovelace' }),
    });
    expect(first.status).toBe('continue');

    // The consent checkbox and the continue button are both portal_operation requirements this
    // slice deliberately never clicks (ADR 0036) — simulate a future click-executor having handled
    // both, and prepare a representation, so readiness can turn true and this step can prove it
    // detects that explicitly.
    for (const elementId of ['s1-consent', 's1-continue']) {
      const requirement = first.session.requirements.find((r) => r.surfaceElementId === elementId);
      expect(requirement).toBeDefined();
      await sessions.resolveRequirement({ sessionId: session.id, requirementId: requirement!.id, status: 'resolved' });
    }
    await sessions.updateWorkingState({
      sessionId: session.id,
      intent: {
        personId: 'p6',
        opportunityId: 'opp-6',
        adaptationContextId: 'ctx-1',
        representation: {
          draftId: 'draft-1',
          revision: 1,
          surface: 'application_answer',
          content: [{ text: 'Ada Lovelace', groundedInNodeIds: [], groundedInInput: [] }],
        },
      },
    });

    const second = await loop.step({
      sessionId: session.id,
      observation: surfaceOne,
      postActionObservation: withValues(surfaceOne, { 's1-name': 'Ada Lovelace' }),
    });
    expect(second.status).toBe('submission_ready');
    expect(second.session.executionLevel).toBe('ready_to_submit');
  });

  it('touches no application table across a full loop pass', async () => {
    const session = await sessions.createOrResumeSession({ personId: 'p7', opportunityId: 'opp-7', opportunityRevision: 1 });
    const loop = buildLoop(
      sessions,
      new DeterministicJobyQueryPort({ 'Full name': { status: 'resolved', value: 'Ada Lovelace', source: 'known_professional_fact' } }),
    );

    await loop.step({
      sessionId: session.id,
      observation: surfaceOne,
      postActionObservation: withValues(surfaceOne, { 's1-name': 'Ada Lovelace' }),
    });

    const { rows } = await db.query<{ count: string }>(`SELECT count(*)::text AS count FROM application`);
    expect(rows[0]?.count).toBe('0');
  });
});
