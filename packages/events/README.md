# packages/events

The lightweight event foundation. Not a message bus, not a broker, not an orchestration
mechanism.

> Joby uses typed domain events. Immediate local reactions may run inline. Deferrable reactions are
> persisted transactionally through an outbox, delivered through a Postgres-backed durable queue,
> and processed by workers. **Event contracts remain independent of delivery transport.**

Decided in [ADR 0002](../../docs/architecture/adr/0002-in-process-typed-event-dispatcher.md)
(contracts and inline delivery) and
[ADR 0004](../../docs/architecture/adr/0004-transactional-outbox-and-postgres-durable-queue.md)
(durable delivery).

## What is here

**Event contracts** — transport-independent. Nothing in these files knows how an event is delivered.

| File | Purpose |
|---|---|
| `domains.ts` | Closed legacy event-owner names; not the ADR 0029 semantic topology |
| `envelope.ts` | `EventEnvelope`, metadata, actor, id/timestamp helpers |
| `names.ts` | The closed `EventName` union and its owning module per event |
| `payloads.ts` | One typed payload per event name |
| `event.ts` | `JobyEvent<Name>` and `createEvent()` |
| `handler.ts` | `EventHandler`, `inline` vs `deferrable` delivery |
| `index.ts` | The only import surface |

**Delivery** — replaceable without touching anything above.

| File | Purpose | Status |
|---|---|---|
| `dispatcher.ts` | `InProcessEventDispatcher` — inline delivery, and handler execution in the worker | Implemented |
| `publisher.ts` | `TransactionalEventPublisher` — `recordDurable` in the transaction, `publishCommitted` after | Implemented; needs an `OutboxStore` |
| `outbox.ts` | `OutboxRecord`, `OutboxStore`, `TransactionContext` | **Contract only** |
| `queue.ts` | `DurableQueue` — claim / ack / release | **Contract only** |
| `consumer.ts` | `QueueEventConsumer` — queue → handlers → ack/release | Implemented; needs a `DurableQueue` |
| `serialization.ts` | `serializeEvent`, `parseEvent` — the runtime guard at the process boundary | Implemented |

## The events

| Event | Owner | Means |
|---|---|---|
| `IdentityUpdated` | durable_identity | Durable Identity's Explicit State changed, with user confirmation |
| `EvidenceConfirmed` | memory | A user confirmed an evidence item backing claims |
| `OpportunityImported` | opportunity | An opportunity entered Joby from a source |
| `ApplicationSubmitted` | application | An application was actually submitted; the record is immutable |
| `InterviewRecorded` | application | An interview was captured |
| `OutcomeObserved` | application | A real-world outcome was observed for an Application-owned record |

`OutcomeObserved`, `InterviewRecorded`, `ApplicationSubmitted` and `EvidenceConfirmed` are the
events that feed the Slower Learning Loop (ADR 0006): meaningful Records produced by the fast loop,
consumed by deferrable handlers in the worker that update Learned State / PCI only when the evidence
justifies it. Their meanings are unchanged by that.

Only the owning module publishes an event. Any module may subscribe.

For Application facts, ADR 0039 makes the ordering explicit: Application writes its authoritative
state first, records the outbox event in the same transaction, then publishes after commit.
`packages/events` owns the mechanics of delivery, not the authority to create or reinterpret
Application state.

**These six contracts are unchanged by ADR 0004.** They mean the same thing on either delivery path.

## The two paths

### Inline

Immediate, cheap, local reactions that do not need durable retries.

```
COMMIT → publishCommitted(event) → InProcessEventDispatcher → inline handlers
```

Handler failures are isolated and logged. The publisher never learns the outcome and is never
affected. Nothing is persisted; a crash before dispatch loses the reaction. That is the accepted
cost of choosing `inline`.

### Deferrable

Reactions that must survive process failure.

```
BEGIN
  module data write
  recordDurable(tx, event)      ← outbox row, same transaction
COMMIT
        ↓
  durable Postgres queue  ──claim──►  apps/worker
        ▲                                 │
        └──── release (failure) ──── dispatch → deferrable handlers
                     ack (all succeeded)
```

The guarantee: **a committed module change cannot lose a required deferrable event because the
process crashed between the write and publication.** The outbox row commits with the module data.

Delivery is **at-least-once** — a worker can die after a handler succeeds but before the ack, so
**deferrable handlers must be idempotent, keyed on `event.id`.**

## Rules

1. Events are **facts in the past tense**. `EvidenceConfirmed`, never `ConfirmEvidence`.
2. Payloads are **JSON-serialisable** and carry **identifiers, not object graphs**. Handlers re-read state from the owning module.
3. **Publish after commit.** An event asserts something already durably true.
4. **Publishers ignore handlers.** No return values; a handler must never compute something the publisher needs.
5. A handler writes **only to its own module's data**.
6. Mark a handler `deferrable` if it does AI work, network calls, or heavy processing, or if losing it would be a correctness problem. It runs in `apps/worker` and must be idempotent.
7. Only add an event for a **meaningful state change**. If it matters only inside one module, it is a function call.
8. **Never change an event because of how it is delivered.** Delivery is a property of handlers and infrastructure. If a change to an event only makes sense for one path, it is wrong.
9. A handler is registered in **exactly one runtime** — inline in `apps/api`, deferrable in `apps/worker`. Construct each dispatcher with `accepts` so this is enforced rather than remembered.

## Usage

### Publishing (`apps/api`)

```ts
import { createEvent, InProcessEventDispatcher, TransactionalEventPublisher } from '@joby/events';

const inline = new InProcessEventDispatcher({ accepts: 'inline' });
const events = new TransactionalEventPublisher({ outbox, inline });

const event = createEvent('EvidenceConfirmed', {
  personId,
  payload: { evidenceItemId, claimIds, epistemicStatus: 'observed', confirmedByUserId },
  metadata: { source: 'api', actor: { kind: 'user', userId } },
});

await db.transaction(async (tx) => {
  await memory.confirmEvidence(tx, evidenceItemId);
  await events.recordDurable(tx, event); // commits with the domain write, or not at all
});

await events.publishCommitted(event); // inline handlers only; cannot throw
```

### Consuming (`apps/worker`)

```ts
import { InProcessEventDispatcher, QueueEventConsumer, type EventHandler } from '@joby/events';

const handlers = new InProcessEventDispatcher({ accepts: 'deferrable' });

const refreshClaims: EventHandler<'EvidenceConfirmed'> = {
  id: 'identity.refresh-claims',
  module: 'durable_identity',
  handles: 'EvidenceConfirmed',
  delivery: 'deferrable',
  async handle(event) {
    // Idempotent, keyed on event.id — this may be delivered more than once.
    // event.payload is EvidenceConfirmedPayload; re-read state from Memory before acting.
  },
};

handlers.subscribe(refreshClaims);

const consumer = new QueueEventConsumer({ queue, handlers });
await consumer.runOnce({ limit: 10 });
```

## Not here, deliberately

Kafka, RabbitMQ, NATS, a schema registry, retry backoff schedules, dead-letter management, event
replay, ordering guarantees, event versioning. `attempts` and `lastError` are recorded for
observability; nothing reads them to make a decision. Add these when a real failure pattern exists,
with an ADR.

## Status

**Source-only.** There is no build tooling and no database layer in the repository yet, so nothing
here compiles or runs. The `@joby/events` import name above is the intended package name once the
workspace is wired.

Specifically on the deferrable path: the contracts are established, but `OutboxStore` and
`DurableQueue` have **no implementations**. Those need `packages/database` — a client, a schema, and
a migration for the outbox table. Until that exists, `TransactionalEventPublisher` and
`QueueEventConsumer` have nothing to construct them with. Nothing on the deferrable path has ever
executed.
