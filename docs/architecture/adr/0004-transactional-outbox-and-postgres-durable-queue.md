# ADR 0004 — Transactional Outbox and Postgres Durable Queue for Deferrable Events

- **Status:** Accepted
- **Date:** 2026-08-12
- **Domains affected:** Cross-cutting
- **Extends:** [ADR 0002](0002-in-process-typed-event-dispatcher.md) (which remains accepted for inline delivery)
- **Compatible with:** [ADR 0003](0003-single-postgres-database-with-domain-ownership.md), with one explicit extension to its ownership rule (below)

## Context

ADR 0002 established typed in-process events and recorded its own revisit trigger:

> A handler needs retries or guaranteed delivery, a handler's latency starts affecting request
> time, or an event needs to cross a process boundary.

That trigger has fired. The work Joby actually defers — CV extraction, EvidenceItem generation,
opportunity extraction, company research, interview intelligence — is slow, external, and
consequential. Losing one is not a dropped notification; it is a person's evidence silently never
being generated after they were told their CV was uploaded.

The in-process dispatcher publishes after commit and holds nothing. A crash between the commit and
the dispatch loses the event with no trace that it ever existed. For inline reactions that is an
acceptable and understood cost. For deferrable reactions it is not.

The `delivery: 'inline' | 'deferrable'` marker on handlers already exists and already records which
reactions are which. What is missing is the durable path behind `deferrable`.

## Decision

Two delivery paths. **Neither changes what an event means.**

### Inline — unchanged

`InProcessEventDispatcher`, published after commit, handler failures isolated, publisher unaffected.
This remains the default for reactions that are immediate, cheap, local, and do not need retries.

### Deferrable — durable

```
Domain change
→ same PostgreSQL transaction
    ├── domain data write
    └── outbox event write
→ durable Postgres queue
→ worker
→ handler
```

The guarantee: **a committed domain change must not lose a required deferrable event because the
application crashed between the database write and asynchronous publication.** The outbox row and
the domain data commit together or not at all.

### What is added

- **`OutboxRecord` / `OutboxStore`** (`packages/events/src/outbox.ts`) — event id, event name, the complete unmodified envelope, creation time, status (`pending | processing | processed | failed`), claim/processed timestamps, an attempt count and last error. `write(tx, record)` takes the caller's open transaction.
- **`DurableQueue`** (`packages/events/src/queue.ts`) — `claim` / `ack` / `release`. Transport infrastructure, referenced by no event definition.
- **`TransactionalEventPublisher`** (`publisher.ts`) — names the two-phase protocol: `recordDurable(tx, event)` inside the transaction, `publishCommitted(event)` after it.
- **`QueueEventConsumer`** (`consumer.ts`) — claims a batch, runs handlers, acks on full success, releases on any failure.
- **`parseEvent`** (`serialization.ts`) — a shallow runtime guard on envelopes read back from storage. ADR 0002 named this as the thing to add once events cross a process boundary. They now do.
- **`ReportingEventDispatcher.dispatch()`** — the worker must know whether a message can be acked. `publish()` keeps its original contract exactly: never rejects, never reports outcomes.
- **`InProcessEventDispatcher({ accepts })`** — prevents a deferrable handler being registered in the API, where it would run inline *and* in the worker.

### Implementation intent

The queue is backed by the outbox table itself, claimed with `SELECT ... FOR UPDATE SKIP LOCKED`.
One table, no relay process. The two contracts stay separate because the outbox is a durability
record and the queue is a delivery mechanism; if a different queue substrate is ever introduced, a
relay appears at that seam and no event definition changes.

### Ownership — an explicit extension to ADR 0003

ADR 0003 states that every table has exactly one owning **domain**. The outbox table has none: it is
owned by the **event infrastructure layer**, and no domain may read or write it directly. This is a
deliberate, narrow extension of that rule, not an exception to be reused — infrastructure tables may
be owned by an infrastructure layer; domain tables may not.

It remains the same single PostgreSQL database. Nothing here justifies a second one.

### Explicitly not decided here

No retry backoff schedule, no dead-letter queue, no event replay, no ordering guarantees, no
partitioning, no broker of any kind. `attempts` and `lastError` are recorded for observability;
nothing reads them to make a decision yet.

## Consequences

- Deferrable events survive process failure. The durability guarantee is now real at the contract level.
- **Delivery is at-least-once.** A worker can die after a handler succeeds but before the ack. Deferrable handlers must be idempotent, keyed on `event.id`. This is a real cost, and it is the correct trade against losing events.
- Two publish moments instead of one. Domain code must call `recordDurable` inside the transaction and `publishCommitted` after it. The API names both, but nothing forces the ordering — this is a review concern.
- The worker becomes a required runtime for correctness, not just for latency. A stopped worker means deferrable events accumulate as `pending` rather than being lost — recoverable, but no longer invisible.
- Queue depth and `failed` rows become things that must be watched. Nothing watches them yet.
- Event contracts stay transport-independent, so a handler can move between inline and deferrable by changing one field and where it is registered.

## Alternatives Considered

- **Kafka, RabbitMQ, or NATS.** Rejected. A separate broker to operate, with its own failure modes and delivery semantics, for a system whose entire event volume fits comfortably in a Postgres table. It would also break the single-transaction guarantee, which is the actual requirement — a broker publish cannot join the domain's database transaction, which is precisely the gap the outbox closes.
- **A separate queue database.** Rejected: contradicts ADR 0003 and would put the outbox write outside the domain transaction, destroying the guarantee.
- **Publish to the queue directly, after commit, no outbox.** Rejected: this is exactly the crash window being closed. The transaction is the only place the guarantee can be made.
- **Make every event durable, drop the inline path.** Rejected: most reactions do not need durability, and paying a database write plus worker round-trip for a cheap local reaction is cost without benefit. The `inline`/`deferrable` distinction already exists and is meaningful.
- **Keep durability inside `InProcessEventDispatcher`.** Rejected: it would couple event dispatch to the database and make the dispatcher untestable in isolation. Keeping it durability-free is why the same class can serve both runtimes.

## Revisit When

Failures show a pattern that needs backoff or a dead-letter queue; ordering per person becomes
required; queue depth or claim contention becomes a real bottleneck; or the same event genuinely
needs to reach a consumer outside Joby. The first three are Postgres-level changes. Only the last is
an argument for a broker, and it needs its own ADR.
