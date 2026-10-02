/** `ApplicationService implements ApplicationModule`, enforced by the compiler. */

import { randomUUID } from 'node:crypto';
import { manualDate, manualLabel, manualStage } from './manual-input';
import { InvalidApplicationInputError, type RecordExternalApplicationInput } from './contract';

import type { Database } from '@joby/database';
import { createEvent, type TransactionalEventPublisher } from '@joby/events';

import {
  ApplicationAlreadyExistsError,
  InvalidApplicationOutcomeError,
  ApplicationNotFoundError,
  InterviewStageNotFoundError,
  type AppendTimelineInput,
  type ApplicationModule,
  type CreateApplicationInput,
  type RecordCommunicationInput,
  type RecordInterviewStageInput,
  type RecordOutcomeInput,
  type RecordSubmissionInput,
} from './contract';
import {
  OUTCOME_KINDS,
  canonicalApplicationOutcome,
  outcomeKindFor,
  type ApplicationRecord,
  type InteractionHistory,
  type OutcomeKind,
  type SubmittedMaterial,
} from './model';
import { ApplicationRepository } from './repository';
import { projectResolvedEvidence, type ResolvedApplicationEvidence } from './resolved-evidence';

export class ApplicationService implements ApplicationModule {
  readonly #db: Database;
  readonly #repository: ApplicationRepository;
  readonly #publisher: TransactionalEventPublisher;

  constructor(dependencies: {
    db: Database;
    repository: ApplicationRepository;
    publisher: TransactionalEventPublisher;
  }) {
    this.#db = dependencies.db;
    this.#repository = dependencies.repository;
    this.#publisher = dependencies.publisher;
  }

  async createApplication(input: CreateApplicationInput): Promise<ApplicationRecord> {
    const existing = await this.#repository.findByPersonAndOpportunity(input.personId, input.opportunityId);
    if (existing) throw new ApplicationAlreadyExistsError(input.personId, input.opportunityId);

    const id = randomUUID();
    await this.#db.transaction((tx) =>
      this.#repository.insert(tx, {
        id,
        personId: input.personId,
        opportunityId: input.opportunityId,
        personState: input.personState,
        opportunityState: input.opportunityState,
        representation: input.representation ?? {},
        adaptation: input.adaptation ?? { draftIds: [] },
      }),
    );

    return (await this.#load(id))!;
  }

  async recordExternalApplication(input: RecordExternalApplicationInput): Promise<ApplicationRecord> {
    const company = manualLabel(input.company, 'Company');
    const role = manualLabel(input.role, 'Role');
    const stage = manualStage(input.stage);
    const occurredAt = manualDate(input.occurredAt);
    if (typeof input.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestId)) throw new InvalidApplicationInputError('requestId must be a UUID.');
    const opportunityId = `external:${input.requestId.toLowerCase()}`;
    const id = await this.#db.transaction(async tx => {
      // Concurrent retries must not create a second application or duplicate initial progress.
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [input.personId, opportunityId]);
      const existing = await this.#repository.findByPersonAndOpportunity(input.personId, opportunityId, tx);
      if (existing) {
        if (existing.externalDetails?.company !== company || existing.externalDetails.role !== role) throw new InvalidApplicationInputError('This requestId was already used for a different application.');
        return existing.id;
      }
      const id = randomUUID();
      await this.#repository.insert(tx, { id, personId: input.personId, opportunityId,
        externalDetails: { company, role }, personState: { groundingProfileUnitIds: [], identityRevision: null },
        opportunityState: { opportunityId, opportunityRevision: null }, representation: {}, adaptation: { draftIds: [] } });
      await this.#repository.insertTimelineEntry(tx, id, { id: randomUUID(), stage, occurredAt,
        recordedAt: new Date().toISOString(), recordedBy: input.personId });
      return id;
    });
    return (await this.#load(id))!;
  }

  async recordOwnedProgress(input: { personId: string; applicationId: string; stage: import('./model').TimelineStage; occurredAt?: string }): Promise<ApplicationRecord> {
    const application = await this.#requireApplication(input.applicationId);
    if (application.personId !== input.personId) throw new ApplicationNotFoundError(input.applicationId);
    return this.appendTimelineEntry({ applicationId: application.id, stage: manualStage(input.stage),
      occurredAt: manualDate(input.occurredAt), recordedBy: input.personId });
  }

  async recordOwnedInterviewStage(input: RecordInterviewStageInput & { personId: string }): Promise<ApplicationRecord> {
    const application = await this.#requireApplication(input.applicationId);
    if (application.personId !== input.personId) throw new ApplicationNotFoundError(input.applicationId);
    return this.recordInterviewStage(input);
  }

  async attachOwnedInterviewReflection(input: { personId: string; applicationId: string; stageId: string; reflection: string }): Promise<ApplicationRecord> {
    const application = await this.#requireApplication(input.applicationId);
    if (application.personId !== input.personId) throw new ApplicationNotFoundError(input.applicationId);
    const stageApplicationId = await this.#repository.findApplicationIdForInterviewStage(input.stageId);
    if (stageApplicationId !== application.id) throw new InterviewStageNotFoundError(input.stageId);
    return this.attachInterviewReflection(input);
  }

  async getApplication(applicationId: string): Promise<ApplicationRecord | undefined> {
    return this.#load(applicationId);
  }

  async findApplication(personId: string, opportunityId: string): Promise<ApplicationRecord | undefined> {
    const application = await this.#repository.findByPersonAndOpportunity(personId, opportunityId);
    return application ? this.#load(application.id) : undefined;
  }

  async listApplications(personId: string): Promise<readonly ApplicationRecord[]> {
    const applications = await this.#repository.listForPerson(personId);
    const records = await Promise.all(applications.map((application) => this.#load(application.id)));
    return records.filter((record): record is ApplicationRecord => record !== undefined);
  }

  /**
   * Xₙ. Immutable once recorded.
   *
   * Recording a submission is not the same act as generating one: `sourceDraftId` traces material
   * back to Aₙ when it came from a draft, and `editedFromSource` records whether the sent content
   * differs from what Adaptation produced. Neither is inferred here — the caller, which composed the
   * draft in the first place, is the only one who can say.
   */
  async recordSubmission(input: RecordSubmissionInput): Promise<ApplicationRecord> {
    const application = await this.#requireApplication(input.applicationId);
    const current = (await this.#load(application.id))!;

    const materials: SubmittedMaterial[] = input.materials.map((material) => ({
      id: randomUUID(),
      kind: material.kind,
      editedFromSource: material.editedFromSource ?? false,
      ...(material.content !== undefined ? { content: material.content } : {}),
      ...(material.sourceDraftId ? { sourceDraftId: material.sourceDraftId } : {}),
    }));

    const event = createEvent('ApplicationSubmitted', {
      personId: application.personId,
      payload: {
        applicationRecordId: application.id,
        opportunityId: application.opportunityId,
        ...(current.representation.selectedRepresentationId
          ? { representationId: current.representation.selectedRepresentationId }
          : current.representation.recommendedRepresentationId
            ? { representationId: current.representation.recommendedRepresentationId }
            : {}),
      },
      metadata: { source: 'api', actor: { kind: 'user', userId: input.recordedBy } },
      occurredAt: input.submittedAt,
    });

    await this.#db.transaction(async (tx) => {
      for (const material of materials) {
        await this.#repository.insertSubmittedMaterial(tx, application.id, material, input.submittedAt);
      }
      await this.#repository.touch(tx, application.id);
      await this.#publisher.recordDurable(tx, event);
    });

    await this.#publisher.publishCommitted(event);
    return (await this.#load(application.id))!;
  }

  /** Iₙ — lifecycle. Append-only; `currentState` is never passed in because it is always derived. */
  async appendTimelineEntry(input: AppendTimelineInput): Promise<ApplicationRecord> {
    const application = await this.#requireApplication(input.applicationId);

    await this.#db.transaction(async (tx) => {
      await this.#repository.insertTimelineEntry(tx, application.id, {
        id: randomUUID(),
        stage: input.stage,
        occurredAt: input.occurredAt,
        recordedAt: new Date().toISOString(),
        recordedBy: input.recordedBy,
        ...(input.note ? { note: input.note } : {}),
        ...(input.supersedes ? { supersedes: input.supersedes } : {}),
      });
      await this.#repository.touch(tx, application.id);
    });

    return (await this.#load(application.id))!;
  }

  async recordCommunication(input: RecordCommunicationInput): Promise<ApplicationRecord> {
    const application = await this.#requireApplication(input.applicationId);

    await this.#db.transaction(async (tx) => {
      await this.#repository.insertCommunication(tx, application.id, {
        id: randomUUID(),
        direction: input.direction,
        channel: input.channel,
        summary: input.summary,
        occurredAt: input.occurredAt,
        recordedAt: new Date().toISOString(),
      });
      await this.#repository.touch(tx, application.id);
    });

    return (await this.#load(application.id))!;
  }

  /** Iₙ — interview stage: the observation. A reflection is attached later, by the person. */
  async recordInterviewStage(input: RecordInterviewStageInput): Promise<ApplicationRecord> {
    const application = await this.#requireApplication(input.applicationId);
    const stageId = randomUUID();
    const event = createEvent('InterviewRecorded', {
      personId: application.personId,
      payload: {
        interviewId: stageId,
        applicationRecordId: application.id,
        format: input.kind,
      },
      metadata: { source: 'api', actor: { kind: 'system', component: 'application' } },
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    });

    await this.#db.transaction(async (tx) => {
      await this.#repository.insertInterviewStage(tx, application.id, {
        id: stageId,
        kind: input.kind,
        observations: input.observations,
        recordedAt: new Date().toISOString(),
        ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
      });
      await this.#repository.touch(tx, application.id);
      await this.#publisher.recordDurable(tx, event);
    });

    await this.#publisher.publishCommitted(event);
    return (await this.#load(application.id))!;
  }

  /**
   * Attach the person's own account of an interview stage afterwards.
   *
   * Never a system-generated score: this is their interpretation, recorded verbatim, and nothing
   * here evaluates it.
   */
  async attachInterviewReflection(input: {
    stageId: string;
    reflection: string;
  }): Promise<ApplicationRecord> {
    const applicationId = await this.#repository.findApplicationIdForInterviewStage(input.stageId);
    if (!applicationId) throw new InterviewStageNotFoundError(input.stageId);

    await this.#db.transaction(async (tx) => {
      const updated = await this.#repository.setInterviewReflection(
        tx,
        applicationId,
        input.stageId,
        input.reflection,
      );
      if (!updated) throw new InterviewStageNotFoundError(input.stageId);
      await this.#repository.touch(tx, applicationId);
    });

    return (await this.#load(applicationId))!;
  }

  /** Yₙ. A separate act from recording what was sent — how the world responded, observed later. */
  async recordOutcome(input: RecordOutcomeInput): Promise<ApplicationRecord> {
    const application = await this.#requireApplication(input.applicationId);
    const canonicalType = canonicalApplicationOutcome(input.kind);
    const kind: OutcomeKind = canonicalType
      ? outcomeKindFor(canonicalType)
      : (OUTCOME_KINDS as readonly string[]).includes(input.kind)
        ? (input.kind as OutcomeKind)
        : (() => {
            throw new InvalidApplicationOutcomeError(String(input.kind));
          })();
    const outcomeId = randomUUID();
    const event = createEvent('OutcomeObserved', {
      personId: application.personId,
      payload: {
        subject: { kind: 'application', id: application.id },
        outcome: kind,
        observedVia: 'user_reported',
      },
      metadata: { source: 'api', actor: { kind: 'system', component: 'application' } },
      occurredAt: input.occurredAt,
    });

    await this.#db.transaction(async (tx) => {
      await this.#repository.insertOutcome(tx, application.id, {
        id: outcomeId,
        kind,
        ...(canonicalType ? { canonicalType } : {}),
        occurredAt: input.occurredAt,
        recordedAt: new Date().toISOString(),
        ...(input.note ? { note: input.note } : {}),
        ...(input.feedback ? { feedback: input.feedback } : {}),
      });
      await this.#repository.touch(tx, application.id);
      await this.#publisher.recordDurable(tx, event);
    });

    await this.#publisher.publishCommitted(event);
    return (await this.#load(application.id))!;
  }

  async getResolvedEvidence(applicationId: string): Promise<ResolvedApplicationEvidence | undefined> {
    const record = await this.#load(applicationId);
    return record ? projectResolvedEvidence(record) : undefined;
  }

  async #requireApplication(applicationId: string) {
    const application = await this.#repository.findApplication(applicationId);
    if (!application) throw new ApplicationNotFoundError(applicationId);
    return application;
  }

  async #load(applicationId: string): Promise<ApplicationRecord | undefined> {
    const application = await this.#repository.findApplication(applicationId);
    if (!application) return undefined;

    const lineage = await this.#repository.findLineage(applicationId, application.opportunityId);
    if (!lineage) return undefined;

    const [{ materials, submittedAt }, timeline, communications, interviewStages, outcomes] =
      await Promise.all([
        this.#repository.listSubmittedMaterial(applicationId),
        this.#repository.listTimeline(applicationId),
        this.#repository.listCommunications(applicationId),
        this.#repository.listInterviewStages(applicationId),
        this.#repository.listOutcomes(applicationId),
      ]);

    const interaction: InteractionHistory = { timeline, communications, interviewStages };

    return {
      application,
      personState: lineage.personState,
      opportunityState: lineage.opportunityState,
      representation: lineage.representation,
      adaptation: lineage.adaptation,
      ...(materials.length > 0 ? { submitted: { materials, submittedAt: submittedAt! } } : {}),
      interaction,
      outcomes,
    };
  }
}
