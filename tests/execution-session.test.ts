/**
 * Application Session — Execution's temporary runtime state for one application attempt — against
 * real PostgreSQL.
 *
 * The acceptance criteria this file exists to prove: a session can be created, its current runtime
 * state is retrievable, it survives a fresh connection (the closest thing to "survives restart" a
 * test can exercise without actually killing the process), it is structurally separate from
 * Application's durable history, and pausing/resuming loses nothing.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '@joby/database';
import {
  createApplicationSessionModule,
  RequirementNotFoundError,
  SessionAlreadySubmittedError,
  SessionNotFoundError,
  type ApplicationIntent,
  type ApplicationSessionModule,
} from '@joby/translation/execution';

import { connectTestDatabase, hasDatabase, truncateApplication, truncateExecutionSession } from './support/database';

const describeIntegration = hasDatabase ? describe : (describe.skip.bind(null) as typeof describe);

if (!hasDatabase) {
  console.warn('\n[tests] SKIPPING execution session tests: DATABASE_URL is not set.\n');
}

const intent: ApplicationIntent = {
  personId: 'person-1',
  opportunityId: 'opp-1',
  adaptationContextId: 'ctx-1',
  representation: {
    draftId: 'draft-1',
    revision: 1,
    surface: 'cover_letter',
    content: [{ text: 'A grounded sentence.', groundedInNodeIds: ['node-1'], groundedInInput: ['motivation'] }],
  },
};

describeIntegration('Application Session', () => {
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
    // Isolation from `tests/application.test.ts`, which shares this database: the "touches no
    // application_* table" assertion below needs a clean baseline, not merely its own no-op.
    await truncateApplication(db);
  });

  const open = (overrides: Partial<Parameters<ApplicationSessionModule['createOrResumeSession']>[0]> = {}) =>
    sessions.createOrResumeSession({
      personId: 'person-1',
      opportunityId: 'opp-1',
      opportunityRevision: 3,
      role: 'Placement Engineer',
      company: 'Acme Trading',
      requirements: [
        { id: 'req-motivation', label: 'Why do you want this role?' },
        { id: 'req-right-to-work', label: 'Confirm right to work' },
      ],
      ...overrides,
    });

  describe('create/resume', () => {
    it('creates a session carrying job and company context', async () => {
      const session = await open();

      expect(session.jobContext).toEqual({
        opportunityId: 'opp-1',
        opportunityRevision: 3,
        role: 'Placement Engineer',
        company: 'Acme Trading',
      });
      expect(session.executionLevel).toBe('not_started');
      expect(session.paused).toBe(false);
    });

    it('starts every supplied requirement as unresolved', async () => {
      const session = await open();
      expect(session.requirements).toEqual([
        { id: 'req-motivation', label: 'Why do you want this role?', status: 'unresolved' },
        { id: 'req-right-to-work', label: 'Confirm right to work', status: 'unresolved' },
      ]);
    });

    it('resuming returns the same session unchanged, not a fresh one', async () => {
      const first = await open();
      await sessions.setExecutionLevel({ sessionId: first.id, level: 'preparing' });

      // A caller resuming with a newer opportunity revision does not get to silently overwrite an
      // attempt already in progress.
      const resumed = await open({ opportunityRevision: 9, requirements: [] });

      expect(resumed.id).toBe(first.id);
      expect(resumed.executionLevel).toBe('preparing');
      expect(resumed.jobContext.opportunityRevision).toBe(3);
    });

    it('is current runtime state retrievable by id and by person + opportunity', async () => {
      const created = await open();
      expect((await sessions.getSession(created.id))?.id).toBe(created.id);
      expect((await sessions.findSession('person-1', 'opp-1'))?.id).toBe(created.id);
    });

    it('is retrievable across a fresh connection — the persisted-state half of surviving a restart', async () => {
      const created = await open();

      const reconnected = await connectTestDatabase();
      try {
        const reloaded = await createApplicationSessionModule({ db: reconnected }).getSession(created.id);
        expect(reloaded).toEqual(created);
      } finally {
        await reconnected.close();
      }
    });

    it('raises a typed error for a session that does not exist', async () => {
      await expect(sessions.getSession('missing')).resolves.toBeUndefined();
      await expect(sessions.pauseSession('missing')).rejects.toThrow(SessionNotFoundError);
    });
  });

  describe('maintaining the current execution surface', () => {
    it('updates portal context independently of everything else', async () => {
      const opened = await open();
      const updated = await sessions.updatePortalContext({
        sessionId: opened.id,
        portalKind: 'greenhouse',
        currentStepId: 'step-2-experience',
      });

      expect(updated.portalContext).toEqual({ portalKind: 'greenhouse', currentStepId: 'step-2-experience' });
      expect(updated.jobContext).toEqual(opened.jobContext);
    });

    it('updates working application state, merging portal field values rather than replacing them', async () => {
      const opened = await open();
      await sessions.updateWorkingState({ sessionId: opened.id, portalFieldValues: { 'field-a': 'yes' } });
      const updated = await sessions.updateWorkingState({
        sessionId: opened.id,
        intent,
        portalFieldValues: { 'field-b': 'no' },
      });

      expect(updated.workingState.intent).toEqual(intent);
      expect(updated.workingState.portalFieldValues).toEqual({ 'field-a': 'yes', 'field-b': 'no' });
    });

    it('advances execution level, and refuses to reopen a session already submitted', async () => {
      const opened = await open();
      await sessions.setExecutionLevel({ sessionId: opened.id, level: 'preparing' });
      const ready = await sessions.setExecutionLevel({ sessionId: opened.id, level: 'ready_to_submit' });
      expect(ready.executionLevel).toBe('ready_to_submit');

      const submitted = await sessions.setExecutionLevel({ sessionId: opened.id, level: 'submitted' });
      expect(submitted.executionLevel).toBe('submitted');

      await expect(
        sessions.setExecutionLevel({ sessionId: opened.id, level: 'preparing' }),
      ).rejects.toThrow(SessionAlreadySubmittedError);
    });
  });

  describe('tracking unresolved requirements', () => {
    it('resolves one requirement without touching the others', async () => {
      const opened = await open();
      const updated = await sessions.resolveRequirement({
        sessionId: opened.id,
        requirementId: 'req-motivation',
        status: 'resolved',
        resolvedValue: 'answered via draft-1',
      });

      const motivation = updated.requirements.find((r) => r.id === 'req-motivation')!;
      const rightToWork = updated.requirements.find((r) => r.id === 'req-right-to-work')!;
      expect(motivation.status).toBe('resolved');
      expect(motivation.resolvedValue).toBe('answered via draft-1');
      expect(rightToWork.status).toBe('unresolved');
    });

    it('raises a typed error for a requirement id this session does not track', async () => {
      const opened = await open();
      await expect(
        sessions.resolveRequirement({ sessionId: opened.id, requirementId: 'nope', status: 'resolved' }),
      ).rejects.toThrow(RequirementNotFoundError);
    });
  });

  describe('tracking submission readiness', () => {
    it('is not ready until every requirement resolves and something is prepared to submit', async () => {
      const opened = await open();
      expect((await sessions.getSubmissionReadiness(opened.id)).ready).toBe(false);

      await sessions.resolveRequirement({ sessionId: opened.id, requirementId: 'req-motivation', status: 'resolved' });
      await sessions.resolveRequirement({
        sessionId: opened.id,
        requirementId: 'req-right-to-work',
        status: 'not_applicable',
      });
      expect((await sessions.getSubmissionReadiness(opened.id)).ready).toBe(false);

      await sessions.updateWorkingState({ sessionId: opened.id, intent });
      const readiness = await sessions.getSubmissionReadiness(opened.id);
      expect(readiness.ready).toBe(true);
      expect(readiness.blockedBy).toEqual([]);
    });

    it('reports exactly what is blocking readiness, not just that something is', async () => {
      const opened = await open();
      const readiness = await sessions.getSubmissionReadiness(opened.id);
      expect(readiness.blockedBy.map((r) => r.id)).toEqual(['req-motivation', 'req-right-to-work']);
    });
  });

  describe('pausing and resuming safely', () => {
    it('pausing changes only paused, discarding nothing', async () => {
      const opened = await open();
      await sessions.setExecutionLevel({ sessionId: opened.id, level: 'preparing' });
      await sessions.updateWorkingState({ sessionId: opened.id, intent, portalFieldValues: { a: '1' } });
      await sessions.recordSessionNote({ sessionId: opened.id, note: 'Filled the first two pages.' });

      const paused = await sessions.pauseSession(opened.id);

      expect(paused.paused).toBe(true);
      expect(paused.executionLevel).toBe('preparing');
      expect(paused.workingState.intent).toEqual(intent);
      expect(paused.memory.notes).toEqual(['Filled the first two pages.']);
    });

    it('a paused session is never ready to submit, whatever else is true', async () => {
      const opened = await open({ requirements: [] });
      await sessions.updateWorkingState({ sessionId: opened.id, intent });
      await sessions.pauseSession(opened.id);

      const readiness = await sessions.getSubmissionReadiness(opened.id);
      expect(readiness.ready).toBe(false);
      expect(readiness.reason).toContain('paused');
    });

    it('resuming restores exactly the state pausing left behind', async () => {
      const opened = await open();
      await sessions.setExecutionLevel({ sessionId: opened.id, level: 'preparing' });
      await sessions.pauseSession(opened.id);

      const resumed = await sessions.resumeSession(opened.id);
      expect(resumed.paused).toBe(false);
      expect(resumed.executionLevel).toBe('preparing');
    });
  });

  describe('session memory', () => {
    it('appends notes rather than overwriting earlier ones', async () => {
      const opened = await open();
      await sessions.recordSessionNote({ sessionId: opened.id, note: 'Started the application.' });
      const updated = await sessions.recordSessionNote({
        sessionId: opened.id,
        note: 'Hit a CAPTCHA on the third page.',
        lastAction: 'Filled employment history',
        nextStep: 'Solve the CAPTCHA and continue',
      });

      expect(updated.memory.notes).toEqual(['Started the application.', 'Hit a CAPTCHA on the third page.']);
      expect(updated.memory.lastAction).toBe('Filled employment history');
      expect(updated.memory.nextStep).toBe('Solve the CAPTCHA and continue');
    });
  });

  describe('separation from durable Application history', () => {
    it('touches no application_* table', async () => {
      const opened = await open();
      await sessions.setExecutionLevel({ sessionId: opened.id, level: 'preparing' });
      await sessions.updateWorkingState({ sessionId: opened.id, intent });
      await sessions.pauseSession(opened.id);
      await sessions.resumeSession(opened.id);

      const { rows } = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM application`,
      );
      // Nothing about creating or working a session ever inserts into Application's own tables.
      expect(rows[0]!.count).toBe('0');
    });

    it('stores no canonical fact, opportunity posting text or Adapted State content in its own schema', async () => {
      const opened = await open();
      await sessions.updateWorkingState({ sessionId: opened.id, intent });

      const { rows } = await db.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'execution_session'`,
      );
      const columns = rows.map((row) => row.column_name);
      for (const forbidden of ['contribution', 'capability', 'consequence', 'required_capabilities', 'generated']) {
        expect(columns, forbidden).not.toContain(forbidden);
      }
    });

    it('has no foreign key into application, opportunity, adaptation or identity tables', async () => {
      const { rows } = await db.query<{ constraint_name: string }>(
        `SELECT tc.constraint_name
           FROM information_schema.table_constraints tc
          WHERE tc.table_name = 'execution_session' AND tc.constraint_type = 'FOREIGN KEY'`,
      );
      // Cross-module references are ids, never constraints — the same referential rule migrations
      // 0011-0013 already record.
      expect(rows).toEqual([]);
    });
  });

  describe('no browser or model execution', () => {
    it('exposes no capability that acts externally — only state transitions', async () => {
      const opened = await open();
      const surface = Object.keys(sessions);
      for (const forbidden of ['submit', 'navigate', 'click', 'fill', 'screenshot', 'browse']) {
        expect(surface.some((k) => k.toLowerCase().includes(forbidden)), forbidden).toBe(false);
      }
      // Reaching 'ready_to_submit' is as far as this module goes: an explicit level to reach, not
      // an action performed.
      const ready = await sessions.setExecutionLevel({ sessionId: opened.id, level: 'ready_to_submit' });
      expect(ready.executionLevel).toBe('ready_to_submit');
    });
  });
});
