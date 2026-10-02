/**
 * The Application aggregate end to end, against real PostgreSQL.
 *
 * ```text
 * Oₙ = (Pₙ, Wₙ, Rₙ, Aₙ, Xₙ, Iₙ, Yₙ)
 * ```
 *
 * The assertions that matter most are the ones about *separation*: Aₙ from Xₙ, Xₙ from Yₙ, and
 * `currentState` from anything stored. A test that only checked "the fields round-trip" would miss
 * the entire point of the model.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '@joby/database';
import {
  ApplicationAlreadyExistsError,
  ApplicationNotFoundError,
  createApplication,
  currentState,
  representationOverridden,
  type ApplicationModule,
} from '@joby/application';

import { connectTestDatabase, hasDatabase, truncateApplication } from './support/database';

const describeIntegration = hasDatabase ? describe : (describe.skip.bind(null) as typeof describe);

if (!hasDatabase) {
  console.warn('\n[tests] SKIPPING application tests: DATABASE_URL is not set.\n');
}

describeIntegration('the Application aggregate', () => {
  let db: Database;
  let applications: ApplicationModule;

  beforeAll(async () => {
    db = await connectTestDatabase();
    applications = createApplication({ db });
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await truncateApplication(db);
  });

  const open = (overrides: Partial<Parameters<ApplicationModule['createApplication']>[0]> = {}) =>
    applications.createApplication({
      personId: 'person-1',
      opportunityId: 'opp-1',
      personState: { groundingProfileUnitIds: ['node-1', 'node-2'], identityRevision: 3 },
      opportunityState: { opportunityId: 'opp-1', opportunityRevision: 2 },
      createdBy: 'user-1',
      ...overrides,
    });

  describe('opening an application — Pₙ and Wₙ', () => {
    it('records what person and opportunity state this application was built from', async () => {
      const record = await open();

      expect(record.personState).toEqual({ groundingProfileUnitIds: ['node-1', 'node-2'], identityRevision: 3 });
      expect(record.opportunityState).toEqual({ opportunityId: 'opp-1', opportunityRevision: 2 });
      expect(record.application.personId).toBe('person-1');
      expect(record.application.opportunityId).toBe('opp-1');
    });

    it('preserves the user context relied upon, verbatim, without re-reading Identity live', async () => {
      const record = await open({
        personState: {
          groundingProfileUnitIds: ['node-1'],
          identityRevision: 3,
          userContextUsed: { conditions: { location: ['London'] }, careerDirection: 'Quant research' },
        },
      });
      expect(record.personState.userContextUsed).toEqual({
        conditions: { location: ['London'] },
        careerDirection: 'Quant research',
      });
    });

    it('refuses a second application for the same person and opportunity', async () => {
      await open();
      await expect(open()).rejects.toThrow(ApplicationAlreadyExistsError);
    });

    it('is retrievable by id and by person + opportunity', async () => {
      const created = await open();
      expect((await applications.getApplication(created.application.id))?.application.id).toBe(created.application.id);
      expect((await applications.findApplication('person-1', 'opp-1'))?.application.id).toBe(created.application.id);
    });

    it('raises a typed error for an application that does not exist', async () => {
      await expect(applications.getApplication('missing')).resolves.toBeUndefined();
      await expect(
        applications.recordOutcome({ applicationId: 'missing', kind: 'offer', occurredAt: '2026-01-01' }),
      ).rejects.toThrow(ApplicationNotFoundError);
    });
  });

  describe('Rₙ — representation prior used', () => {
    it('records recommended and selected separately, and derives whether they differ', async () => {
      const record = await open({
        representation: {
          recommendedRepresentationId: 'rep-1',
          selectedRepresentationId: 'rep-2',
          representationRevision: 5,
        },
      });

      expect(record.representation.recommendedRepresentationId).toBe('rep-1');
      expect(record.representation.selectedRepresentationId).toBe('rep-2');
      // Not a stored column — derived from the two ids every time.
      expect(representationOverridden(record.representation)).toBe(true);
    });

    it('supports applying with no representation at all — a normal case, not a degraded one', async () => {
      const record = await open();
      expect(record.representation).toEqual({});
      expect(representationOverridden(record.representation)).toBe(false);
    });
  });

  describe('Aₙ — adaptation produced, as a reference', () => {
    it('records which adaptation context and drafts were consulted, without copying their content', async () => {
      const record = await open({
        adaptation: { adaptationContextId: 'ctx-1', draftIds: ['draft-1', 'draft-2'] },
      });
      expect(record.adaptation).toEqual({ adaptationContextId: 'ctx-1', draftIds: ['draft-1', 'draft-2'] });
    });
  });

  describe('Xₙ — submitted reality, and how it differs from Aₙ', () => {
    it('records exactly what was sent, distinct from what was produced', async () => {
      const opened = await open({
        adaptation: { adaptationContextId: 'ctx-1', draftIds: ['draft-1'] },
        representation: { selectedRepresentationId: 'rep-1', representationRevision: 1 },
      });

      const record = await applications.recordSubmission({
        applicationId: opened.application.id,
        materials: [
          { kind: 'cover_letter', content: 'Edited opening line.', sourceDraftId: 'draft-1', editedFromSource: true },
          { kind: 'cv', sourceDraftId: 'draft-1', editedFromSource: false },
        ],
        submittedAt: '2026-01-10T00:00:00.000Z',
        recordedBy: 'user-1',
      });

      // Aₙ ≠ Xₙ: the draft is still referenced, but the sent content is what actually crossed the
      // boundary — and this one was edited from what Joby produced.
      expect(record.submitted?.materials).toHaveLength(2);
      const letter = record.submitted!.materials.find((m) => m.kind === 'cover_letter')!;
      expect(letter.content).toBe('Edited opening line.');
      expect(letter.sourceDraftId).toBe('draft-1');
      expect(letter.editedFromSource).toBe(true);

      const cv = record.submitted!.materials.find((m) => m.kind === 'cv')!;
      expect(cv.editedFromSource).toBe(false);

      // Aₙ is untouched by recording Xₙ.
      expect(record.adaptation.draftIds).toEqual(['draft-1']);

      const { rows } = await db.query<{ event_name: string; envelope: { payload: Record<string, unknown> } }>(
        `SELECT event_name, envelope FROM event_outbox`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.event_name).toBe('ApplicationSubmitted');
      expect(rows[0]!.envelope.payload).toMatchObject({
        applicationRecordId: opened.application.id,
        opportunityId: 'opp-1',
        representationId: 'rep-1',
      });
    });

    it('supports material with no source draft at all — sent, but not from anything Joby produced', async () => {
      const opened = await open();
      const record = await applications.recordSubmission({
        applicationId: opened.application.id,
        materials: [{ kind: 'document', content: 'A transcript the person attached themselves.' }],
        submittedAt: '2026-01-10T00:00:00.000Z',
        recordedBy: 'user-1',
      });
      const material = record.submitted!.materials[0]!;
      expect(material.sourceDraftId).toBeUndefined();
      expect(material.editedFromSource).toBe(false);
    });

    it('is immutable: recording again adds material rather than replacing it', async () => {
      const opened = await open();
      await applications.recordSubmission({
        applicationId: opened.application.id,
        materials: [{ kind: 'cv', content: 'v1' }],
        submittedAt: '2026-01-10T00:00:00.000Z',
        recordedBy: 'user-1',
      });
      const record = await applications.recordSubmission({
        applicationId: opened.application.id,
        materials: [{ kind: 'answer', content: 'A later answer, e.g. after a follow-up question.' }],
        submittedAt: '2026-01-12T00:00:00.000Z',
        recordedBy: 'user-1',
      });
      expect(record.submitted!.materials).toHaveLength(2);
    });
  });

  describe('Iₙ — interaction history', () => {
    it('derives currentState from timeline chronology, never from a stored column', async () => {
      const opened = await open();
      await applications.appendTimelineEntry({
        applicationId: opened.application.id,
        stage: 'submitted',
        occurredAt: '2026-01-10T00:00:00.000Z',
        recordedBy: 'user-1',
      });
      const record = await applications.appendTimelineEntry({
        applicationId: opened.application.id,
        stage: 'interviewing',
        occurredAt: '2026-01-20T00:00:00.000Z',
        recordedBy: 'user-1',
      });

      expect(currentState(record)).toBe('interviewing');
      expect(record.interaction.timeline).toHaveLength(2);
    });

    it('lets a later correction supersede an earlier entry without deleting it', async () => {
      const opened = await open();
      const first = await applications.appendTimelineEntry({
        applicationId: opened.application.id,
        stage: 'rejected',
        occurredAt: '2026-01-10T00:00:00.000Z',
        recordedBy: 'user-1',
      });
      const wrongEntryId = first.interaction.timeline[0]!.id;

      const corrected = await applications.appendTimelineEntry({
        applicationId: opened.application.id,
        stage: 'interviewing',
        occurredAt: '2026-01-11T00:00:00.000Z',
        note: 'The rejection email was sent to the wrong candidate.',
        supersedes: wrongEntryId,
        recordedBy: 'user-1',
      });

      // What was believed at the time stays inspectable — nothing is deleted.
      expect(corrected.interaction.timeline).toHaveLength(2);
      expect(currentState(corrected)).toBe('interviewing');
    });

    it('records communications as part of the same aggregate', async () => {
      const opened = await open();
      const record = await applications.recordCommunication({
        applicationId: opened.application.id,
        direction: 'inbound',
        channel: 'email',
        summary: 'Recruiter confirmed receipt and gave a timeline.',
        occurredAt: '2026-01-11T00:00:00.000Z',
      });
      expect(record.interaction.communications).toHaveLength(1);
      expect(record.interaction.communications[0]!.direction).toBe('inbound');
    });

    it('records an interview stage, then lets the person attach their own reflection afterwards', async () => {
      const opened = await open();
      const withStage = await applications.recordInterviewStage({
        applicationId: opened.application.id,
        kind: 'video',
        occurredAt: '2026-01-15T00:00:00.000Z',
        observations: ['45 minutes', 'Two interviewers', 'Asked about a specific project'],
      });
      const stageId = withStage.interaction.interviewStages[0]!.id;
      expect(withStage.interaction.interviewStages[0]!.reflection).toBeUndefined();

      const reflected = await applications.attachInterviewReflection({
        stageId,
        reflection: 'Felt confident about the systems design portion.',
      });

      expect(reflected.interaction.interviewStages[0]!.reflection).toBe(
        'Felt confident about the systems design portion.',
      );
      // The observation recorded at the time is untouched by the reflection added later.
      expect(reflected.interaction.interviewStages[0]!.observations).toEqual([
        '45 minutes',
        'Two interviewers',
        'Asked about a specific project',
      ]);

      const { rows } = await db.query<{ event_name: string; envelope: { payload: Record<string, unknown> } }>(
        `SELECT event_name, envelope FROM event_outbox`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.event_name).toBe('InterviewRecorded');
      expect(rows[0]!.envelope.payload).toMatchObject({
        interviewId: stageId,
        applicationRecordId: opened.application.id,
        format: 'video',
      });
    });
  });

  describe('Yₙ — resolved outcome, distinct from Xₙ', () => {
    it('records how the world responded, separately from what was sent', async () => {
      const opened = await open();
      await applications.recordSubmission({
        applicationId: opened.application.id,
        materials: [{ kind: 'cv', content: 'v1' }],
        submittedAt: '2026-01-10T00:00:00.000Z',
        recordedBy: 'user-1',
      });

      const record = await applications.recordOutcome({
        applicationId: opened.application.id,
        kind: 'rejection',
        occurredAt: '2026-02-01T00:00:00.000Z',
        note: 'No feedback given.',
      });

      // Xₙ ≠ Yₙ: what was sent does not change because of how the world responded.
      expect(record.submitted?.materials).toHaveLength(1);
      expect(record.outcomes).toHaveLength(1);
      expect(record.outcomes[0]!.kind).toBe('rejection');

      const { rows } = await db.query<{ event_name: string; envelope: { payload: Record<string, unknown> } }>(
        `SELECT event_name, envelope FROM event_outbox ORDER BY created_at`,
      );
      expect(rows.map((row) => row.event_name)).toEqual(['ApplicationSubmitted', 'OutcomeObserved']);
      expect(rows[1]!.envelope.payload).toMatchObject({
        subject: { kind: 'application', id: opened.application.id },
        outcome: 'rejection',
        observedVia: 'user_reported',
      });
    });
  });

  describe('the resolved-evidence seam toward PCI', () => {
    it('is undefined while the application is still in progress', async () => {
      const opened = await open();
      await applications.appendTimelineEntry({
        applicationId: opened.application.id,
        stage: 'interviewing',
        occurredAt: '2026-01-15T00:00:00.000Z',
        recordedBy: 'user-1',
      });
      expect(await applications.getResolvedEvidence(opened.application.id)).toBeUndefined();
    });

    it('projects resolved evidence once an outcome is recorded, with no mechanical detail in it', async () => {
      const opened = await open({
        representation: { recommendedRepresentationId: 'rep-1', selectedRepresentationId: 'rep-1' },
      });
      await applications.recordOutcome({
        applicationId: opened.application.id,
        kind: 'offer',
        occurredAt: '2026-03-01T00:00:00.000Z',
      });

      const evidence = await applications.getResolvedEvidence(opened.application.id);
      expect(evidence?.applicationId).toBe(opened.application.id);
      expect(evidence?.signals.some((s) => s.observation.includes('offer'))).toBe(true);
    });
  });

  describe('what Application refuses to own', () => {
    it('stores no canonical fact, no live opportunity field and no adapted content anywhere in the schema', async () => {
      const opened = await open({
        adaptation: { adaptationContextId: 'ctx-1', draftIds: ['draft-1'] },
        representation: { selectedRepresentationId: 'rep-1' },
      });
      await applications.recordSubmission({
        applicationId: opened.application.id,
        materials: [{ kind: 'cv', content: 'Sent content only.' }],
        submittedAt: '2026-01-10T00:00:00.000Z',
        recordedBy: 'user-1',
      });

      for (const table of [
        'application', 'application_lineage', 'application_submitted_material',
        'application_timeline_entry', 'application_communication',
        'application_interview_stage', 'application_outcome',
      ]) {
        const { rows } = await db.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
          [table],
        );
        const columns = rows.map((row) => row.column_name);
        // No table here may hold a copy of canonical identity fact content, opportunity posting
        // text, or adapted-state content — only ids, revisions, and what was actually sent.
        for (const forbidden of ['contribution', 'capability', 'consequence', 'required_capabilities', 'generated']) {
          expect(columns, `${table}.${forbidden}`).not.toContain(forbidden);
        }
      }
    });
  });
});
