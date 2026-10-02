/**
 * `packages/events` — the public surface of Joby's event foundation.
 *
 * Import events only from here.
 *
 * Joby uses typed domain events. Immediate local reactions may run inline. Deferrable
 * reactions are persisted transactionally through an outbox, delivered through a
 * Postgres-backed durable queue, and processed by workers. Event contracts remain
 * independent of delivery transport.
 *
 * See ADR 0002 for the event contract rules, ADR 0004 for durable delivery.
 */

export { MODULE_NAMES, type ModuleName } from './domains';

export {
  newEventId,
  nowIso,
  type EventActor,
  type EventEnvelope,
  type EventMetadata,
} from './envelope';

export { EVENT_NAMES, EVENT_OWNER, isEventName, type EventName } from './names';

export type {
  ApplicationSubmittedPayload,
  CanonicalFactRemovedPayload,
  EpistemicStatus,
  EventPayloads,
  EvidenceConfirmedPayload,
  IdentityUpdatedPayload,
  IdentityRepresentationRevisedPayload,
  InterviewRecordedPayload,
  OpportunityImportedPayload,
  OutcomeObservedPayload,
} from './payloads';

export { createEvent, type AnyJobyEvent, type JobyEvent } from './event';

export type { EventHandler, HandlerDelivery, HandlerErrorReporter } from './handler';

export {
  InProcessEventDispatcher,
  type DispatchFailure,
  type DispatchResult,
  type EventDispatcher,
  type EventSubscriber,
  type ReportingEventDispatcher,
} from './dispatcher';

// --- Durable delivery (ADR 0004). Contracts only; implementations live in
// --- `packages/database` and do not exist yet.

export {
  toOutboxRecord,
  type OutboxRecord,
  type OutboxStatus,
  type OutboxStore,
  type TransactionContext,
} from './outbox';

export type { ClaimOptions, DurableQueue, QueueMessage } from './queue';

export { EventParseError, parseEvent, serializeEvent } from './serialization';

export { TransactionalEventPublisher } from './publisher';

export { QueueEventConsumer, type ConsumeResult, type EventConsumer } from './consumer';
