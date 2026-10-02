/**
 * Surface resolution and deterministic action execution, against real PostgreSQL (ADR 0036).
 *
 * The acceptance criteria this file exists to prove: Joby is queried only for requirements that
 * actually need application-specific information; a Joby-resolved value can be used successfully,
 * including via `accepted_document` and `generated_answer` sources; missing/ambiguous/conflicting
 * information causes a user query and pauses the session rather than a guess; deterministic actions
 * execute and are checked against a fresh observation; validation failure becomes explicit
 * current-session state; and none of this ever touches an Application table.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '@joby/database';
import {
  DeterministicJobyQueryPort,
  DeterministicPortalActionExecutor,
  buildExecutionSurface,
  createApplicationSessionModule,
  createSurfaceExecutionModule,
  createSurfaceResolutionModule,
  type ApplicationSessionModule,
  type JobyQueryResult,
  type PageObservation,
  type SurfaceExecutionModule,
  type SurfaceResolutionModule,
} from '@joby/translation/execution';

import { connectTestDatabase, hasDatabase, truncateApplication, truncateExecutionSession } from './support/database';

const describeIntegration = hasDatabase ? describe : (describe.skip.bind(null) as typeof describe);

if (!hasDatabase) {
  console.warn('\n[tests] SKIPPING execution surface resolution tests: DATABASE_URL is not set.\n');
}

const page: PageObservation = {
  url: 'https://portal.example/apply',
  elements: [
    { id: 'el-name', kind: 'text_input', label: 'Full name', required: true },
    { id: 'el-resume', kind: 'file_upload', label: 'Upload your resume', required: true },
    { id: 'el-why', kind: 'textarea', label: 'Why do you want to work here?', required: true },
    { id: 'el-salary', kind: 'text_input', label: 'Expected salary', required: true },
    { id: 'el-consent', kind: 'checkbox', label: 'I agree to the privacy policy' },
  ],
};
const surface = buildExecutionSurface(page);

describeIntegration('surface resolution and deterministic execution against real PostgreSQL', () => {
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

  async function seedSession(personId: string): Promise<string> {
    const session = await sessions.createOrResumeSession({ personId, opportunityId: 'opp-1', opportunityRevision: 1 });
    await sessions.addRequirements({
      sessionId: session.id,
      requirements: [
        { id: 'req-name', label: 'Full name', kind: 'user_required', surfaceElementId: 'el-name' },
        { id: 'req-resume', label: 'Upload your resume', kind: 'portal_operation', surfaceElementId: 'el-resume' },
        { id: 'req-why', label: 'Why do you want to work here?', kind: 'generated_answer', surfaceElementId: 'el-why' },
        { id: 'req-salary', label: 'Expected salary', kind: 'user_required', surfaceElementId: 'el-salary' },
      ],
    });
    return session.id;
  }

  it('queries Joby only for requirements that need information, resolving a document and a generated answer', async () => {
    const sessionId = await seedSession('person-1');
    const resolution = createSurfaceResolutionModule({
      sessions,
      query: new DeterministicJobyQueryPort({
        'Full name': { status: 'resolved', value: 'Ada Lovelace', source: 'known_professional_fact' },
        'Why do you want to work here?': {
          status: 'resolved',
          value: 'Because the mission excites me.',
          source: 'generated_answer',
        },
      }),
    });

    const outcome = await resolution.resolveRequirements({ sessionId });

    // el-resume was tagged portal_operation and never entered the query loop at all.
    expect(outcome.resolved.map((r) => r.requirementId).sort()).toEqual(['req-name', 'req-why']);
    expect(outcome.session.workingState.portalFieldValues['el-name']).toBe('Ada Lovelace');
    expect(outcome.session.workingState.portalFieldValues['el-why']).toBe('Because the mission excites me.');
    const nameReq = outcome.session.requirements.find((r) => r.id === 'req-name');
    expect(nameReq?.status).toBe('resolved');
    expect(nameReq?.resolvedValue).toContain('known_professional_fact');
  });

  it('retrieves an accepted document as a resolved value', async () => {
    const sessionId = await seedSession('person-2');
    const resolution = createSurfaceResolutionModule({
      sessions,
      query: new DeterministicJobyQueryPort({
        'Full name': { status: 'resolved', value: 'Ada Lovelace', source: 'known_professional_fact' },
        'Why do you want to work here?': { status: 'resolved', value: 'Draft.', source: 'generated_answer' },
        'Expected salary': { status: 'resolved', value: 'accepted-doc://salary-expectations', source: 'accepted_document' },
      }),
    });

    const outcome = await resolution.resolveRequirements({ sessionId });
    const salaryOutcome = outcome.resolved.find((r) => r.requirementId === 'req-salary');
    expect(salaryOutcome?.source).toBe('accepted_document');
    expect(outcome.session.workingState.portalFieldValues['el-salary']).toBe('accepted-doc://salary-expectations');
  });

  it('never guesses: missing, ambiguous or conflicting answers become a user query and pause the session', async () => {
    const sessionId = await seedSession('person-3');
    const resolution = createSurfaceResolutionModule({
      sessions,
      query: new DeterministicJobyQueryPort({
        'Full name': { status: 'resolved', value: 'Ada Lovelace', source: 'known_professional_fact' },
        'Why do you want to work here?': {
          status: 'unresolved',
          reason: 'ambiguous',
          explanation: 'Two conflicting motivation drafts exist.',
        },
        // 'Expected salary' intentionally has no answer at all → not_found.
      }),
    });

    const outcome = await resolution.resolveRequirements({ sessionId });

    expect(outcome.needsUser.map((n) => n.requirementId).sort()).toEqual(['req-salary', 'req-why']);
    expect(outcome.session.paused).toBe(true);
    // The requirement itself is left exactly as unresolved as it was — never invented.
    const whyReq = outcome.session.requirements.find((r) => r.id === 'req-why');
    expect(whyReq?.status).toBe('unresolved');
    expect(outcome.session.workingState.portalFieldValues['el-why']).toBeUndefined();
    expect(outcome.session.memory.nextStep).toContain('2 field(s)');
  });

  it('executes deterministic actions, re-observes, and records a validation mismatch in session memory', async () => {
    const sessionId = await seedSession('person-4');
    await sessions.updateWorkingState({
      sessionId,
      portalFieldValues: { 'el-name': 'Ada Lovelace', 'el-why': 'Because the mission excites me.' },
    });

    const execution = createSurfaceExecutionModule({
      sessions,
      executor: new DeterministicPortalActionExecutor(),
    });

    // The portal, freshly observed, disagrees with 'el-why' — a mechanical validation failure.
    const freshObservation: PageObservation = {
      url: page.url,
      elements: [
        { id: 'el-name', kind: 'text_input', label: 'Full name', value: 'Ada Lovelace' },
        { id: 'el-why', kind: 'textarea', label: 'Why do you want to work here?', value: 'Because the mission.' },
      ],
    };

    const outcome = await execution.executeActions({ sessionId, surface, freshObservation });

    expect(outcome.plan.map((a) => a.surfaceElementId).sort()).toEqual(['el-name', 'el-why']);
    expect(outcome.outcomes.every((o) => o.status === 'executed')).toBe(true);
    expect(outcome.mismatches).toEqual([
      { surfaceElementId: 'el-why', expected: 'Because the mission excites me.', observed: 'Because the mission.' },
    ]);
    // Validation failure becomes explicit current-session state.
    expect(outcome.session.memory.notes.some((n) => n.includes('Validation mismatch: el-why'))).toBe(true);
  });

  it('records a mechanical execution failure without inventing success', async () => {
    const sessionId = await seedSession('person-5');
    await sessions.updateWorkingState({ sessionId, portalFieldValues: { 'el-name': 'Ada Lovelace' } });

    const execution = createSurfaceExecutionModule({
      sessions,
      executor: new DeterministicPortalActionExecutor(['el-name']),
    });

    const outcome = await execution.executeActions({
      sessionId,
      surface,
      freshObservation: { url: page.url, elements: [] },
    });

    expect(outcome.outcomes).toEqual([{ surfaceElementId: 'el-name', status: 'failed', reason: 'Simulated mechanical failure.' }]);
    expect(outcome.mismatches).toEqual([]); // a failed action was never executed, so nothing to compare
    expect(outcome.session.memory.notes.some((n) => n.includes('Failed: el-name'))).toBe(true);
  });

  it('touches no application table — mechanical noise stays Session Memory, not durable history', async () => {
    const sessionId = await seedSession('person-6');
    const resolution = createSurfaceResolutionModule({
      sessions,
      query: new DeterministicJobyQueryPort({
        'Full name': { status: 'resolved', value: 'Ada Lovelace', source: 'known_professional_fact' },
      } as Record<string, JobyQueryResult>),
    });
    await resolution.resolveRequirements({ sessionId });

    const execution = createSurfaceExecutionModule({ sessions, executor: new DeterministicPortalActionExecutor() });
    await execution.executeActions({ sessionId, surface, freshObservation: page });

    const { rows } = await db.query<{ count: string }>(`SELECT count(*)::text AS count FROM application`);
    expect(rows[0]?.count).toBe('0');
  });
});
