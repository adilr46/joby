/**
 * Page surface interpretation, end to end, against real PostgreSQL (ADR 0035).
 *
 * The acceptance criteria this file exists to prove: one arbitrary page can be inspected, the
 * interpreter is called with a compact surface plus session context, requirements come back
 * structured and grounded, no ATS-specific branching exists (two structurally different pages both
 * work through the same code), unresolved meaning is represented rather than guessed, and the
 * session records the result — including a known fact reaching Working Application State.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '@joby/database';
import {
  DeterministicSurfaceInterpreter,
  createApplicationSessionModule,
  createSurfaceInspectionModule,
  type ApplicationSessionModule,
  type PageObservation,
  type SurfaceInspectionModule,
} from '@joby/translation/execution';

import { connectTestDatabase, hasDatabase, truncateApplication, truncateExecutionSession } from './support/database';

const describeIntegration = hasDatabase ? describe : (describe.skip.bind(null) as typeof describe);

if (!hasDatabase) {
  console.warn('\n[tests] SKIPPING execution surface inspection tests: DATABASE_URL is not set.\n');
}

const staticFormPage: PageObservation = {
  url: 'https://portal-one.example/apply/42',
  title: 'Application — Software Engineer',
  elements: [
    { id: 'el-name', kind: 'text_input', name: 'full_name', label: 'Full name', required: true },
    { id: 'el-why', kind: 'textarea', label: 'Why do you want to work here?', required: true },
    { id: 'el-resume', kind: 'file_upload', label: 'Upload your resume', required: true },
    { id: 'el-visa', kind: 'radio', label: 'Do you require visa sponsorship?', required: true },
  ],
};

/** A structurally different surface: different element shapes, no file upload, one select. */
const wizardPage: PageObservation = {
  url: 'https://portal-two.example/careers/wizard/step-3',
  elements: [
    { id: 'q-email', kind: 'text_input', name: 'email', label: 'Email', required: true },
    { id: 'q-start', kind: 'select', label: 'Earliest start date', options: ['ASAP', 'In 3 months'] },
    { id: 'q-continue', kind: 'button', label: 'Continue' },
  ],
};

describeIntegration('page surface interpretation against real PostgreSQL', () => {
  let db: Database;
  let sessions: ApplicationSessionModule;
  let inspector: SurfaceInspectionModule;

  beforeAll(async () => {
    db = await connectTestDatabase();
    sessions = createApplicationSessionModule({ db });
    inspector = createSurfaceInspectionModule({ interpreter: new DeterministicSurfaceInterpreter(), sessions });
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await truncateExecutionSession(db);
    await truncateApplication(db);
  });

  it('inspects an arbitrary page and returns structured, grounded requirements', async () => {
    const session = await sessions.createOrResumeSession({
      personId: 'person-1',
      opportunityId: 'opp-1',
      opportunityRevision: 1,
    });

    const outcome = await inspector.inspectSurface({
      sessionId: session.id,
      observation: staticFormPage,
      knownFacts: [{ label: 'Full name', value: 'Ada Lovelace' }],
    });

    expect(outcome.surface.elements.length).toBe(staticFormPage.elements.length);
    expect(outcome.recordedRequirements.length).toBeGreaterThan(0);
    // Every recorded requirement is grounded to an id that was actually on the surface.
    const surfaceIds = new Set(outcome.surface.elements.map((e) => e.id));
    for (const requirement of outcome.recordedRequirements) {
      expect(surfaceIds.has(requirement.surfaceElementId)).toBe(true);
    }
  });

  it('identifies known, generated-answer, user-required and portal-operation requirements', async () => {
    const session = await sessions.createOrResumeSession({
      personId: 'person-2',
      opportunityId: 'opp-2',
      opportunityRevision: 1,
    });

    const outcome = await inspector.inspectSurface({
      sessionId: session.id,
      observation: staticFormPage,
      knownFacts: [{ label: 'Full name', value: 'Ada Lovelace' }],
    });

    const kinds = new Map(outcome.recordedRequirements.map((r) => [r.surfaceElementId, r.kind]));
    expect(kinds.get('el-name')).toBe('known');
    expect(kinds.get('el-why')).toBe('generated_answer');
    expect(kinds.get('el-resume')).toBe('portal_operation');
    expect(kinds.get('el-visa')).toBe('user_required');
  });

  it('updates Working Application State with a known fact, and records the result on the session', async () => {
    const session = await sessions.createOrResumeSession({
      personId: 'person-3',
      opportunityId: 'opp-3',
      opportunityRevision: 1,
    });

    const outcome = await inspector.inspectSurface({
      sessionId: session.id,
      observation: staticFormPage,
      knownFacts: [{ label: 'Full name', value: 'Ada Lovelace' }],
    });

    expect(outcome.session.workingState.portalFieldValues['el-name']).toBe('Ada Lovelace');

    const requirementIds = outcome.recordedRequirements.map((r) => r.id);
    expect(outcome.session.requirements.map((r) => r.id)).toEqual(expect.arrayContaining(requirementIds));

    // The session records that an inspection happened — session state records the result.
    expect(outcome.session.memory.notes.some((note) => note.includes('Inspected page surface'))).toBe(true);
  });

  it('represents unresolved meaning in session memory rather than guessing a requirement kind', async () => {
    const session = await sessions.createOrResumeSession({
      personId: 'person-4',
      opportunityId: 'opp-4',
      opportunityRevision: 1,
    });

    // The select has no matching fact and is not required — the deterministic interpreter cannot
    // confidently classify it.
    const outcome = await inspector.inspectSurface({ sessionId: session.id, observation: wizardPage });

    expect(outcome.unclear.some((u) => u.surfaceElementId === 'q-start')).toBe(true);
    expect(outcome.recordedRequirements.some((r) => r.surfaceElementId === 'q-start')).toBe(false);
    expect(outcome.session.memory.notes.some((note) => note.includes('q-start'))).toBe(true);
  });

  it('works against a structurally different page through the same code — no ATS-specific branching', async () => {
    const session = await sessions.createOrResumeSession({
      personId: 'person-5',
      opportunityId: 'opp-5',
      opportunityRevision: 1,
    });

    const outcome = await inspector.inspectSurface({
      sessionId: session.id,
      observation: wizardPage,
      knownFacts: [{ label: 'Email', value: 'ada@example.com' }],
    });

    const kinds = new Map(outcome.recordedRequirements.map((r) => [r.surfaceElementId, r.kind]));
    expect(kinds.get('q-email')).toBe('known');
    expect(kinds.get('q-continue')).toBe('portal_operation');
    expect(outcome.session.workingState.portalFieldValues['q-email']).toBe('ada@example.com');
  });

  it('does not duplicate requirements when the same surface is inspected twice', async () => {
    const session = await sessions.createOrResumeSession({
      personId: 'person-6',
      opportunityId: 'opp-6',
      opportunityRevision: 1,
    });

    const first = await inspector.inspectSurface({
      sessionId: session.id,
      observation: staticFormPage,
      knownFacts: [{ label: 'Full name', value: 'Ada Lovelace' }],
    });
    const second = await inspector.inspectSurface({
      sessionId: session.id,
      observation: staticFormPage,
      knownFacts: [{ label: 'Full name', value: 'Ada Lovelace' }],
    });

    expect(second.session.requirements.length).toBe(first.session.requirements.length);
  });

  it('touches no application table — a surface inspection is Execution state, not Application history', async () => {
    const session = await sessions.createOrResumeSession({
      personId: 'person-7',
      opportunityId: 'opp-7',
      opportunityRevision: 1,
    });

    await inspector.inspectSurface({
      sessionId: session.id,
      observation: staticFormPage,
      knownFacts: [{ label: 'Full name', value: 'Ada Lovelace' }],
    });

    const { rows } = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM application`,
    );
    expect(rows[0]?.count).toBe('0');
  });
});
