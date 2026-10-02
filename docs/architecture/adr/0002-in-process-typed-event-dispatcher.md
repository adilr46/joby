# ADR 0002 — In-Process Typed Event Dispatcher

- **Status:** Accepted — extended by [ADR 0004](0004-transactional-outbox-and-postgres-durable-queue.md)
- **Date:** 2026-08-12
- **Domains affected:** Cross-cutting

> **Extended, not superseded (2026-08-12).** Everything below still holds. The contract rules in
> particular are what made durable delivery possible without redefining a single event. What changed
> is only the delivery path for `deferrable` handlers: they no longer run inline, but through a
> transactional outbox and a Postgres-backed queue consumed by `apps/worker` (ADR 0004). Inline
> dispatch remains exactly as decided here. The "Revisit When" trigger at the foot of this ADR is
> what fired.

## Context

Domains must react to each other without writing into each other. Memory needs to know when evidence
is confirmed; Intelligence needs to know when an opportunity is imported; Development needs to know
when an outcome is observed. Direct cross-domain writes are forbidden (ADR 0001), so something must
carry meaningful state changes across boundaries.

At the same time there is no scale, throughput, or availability pressure that justifies a broker.
Introducing Kafka now would add operational surface, delivery semantics, and a schema registry to a
system that has no product features yet.

The real risk is not the lack of a broker. It is defining event contracts so tied to synchronous
in-process execution that moving one to asynchronous handling later would change what the event
*means* — e.g. events that carry live object references, mutable state, or an implicit expectation
that a handler's result affects the publisher.

## Decision

`packages/events` provides a small typed foundation and nothing more:

- A serialisable `EventEnvelope`: `id`, `name`, `occurredAt` (ISO-8601 UTC), `personId`, `payload`, `metadata`.
- A closed `EventName` union, each name mapped to its owning domain.
- A per-name payload map giving compile-time typing of `event.payload`.
- An `EventHandler` interface.
- `InProcessEventDispatcher` — synchronous, in-memory, no persistence, no retries.

Contract rules that keep events transport-agnostic:

1. **Payloads are JSON-serialisable.** No class instances, no functions, no live references.
2. **Payloads carry identifiers, not object graphs.** A handler re-reads current state from the owning domain.
3. **Events are facts in the past tense.** They describe what happened, never what should happen next. `EvidenceConfirmed`, not `ConfirmEvidence`.
4. **Publishers ignore handler outcomes.** No return values, no handler may block or fail the publisher's transaction.
5. **Publish after commit.** An event asserts something that is already durably true.
6. Handlers declare `delivery: 'inline' | 'deferrable'`. `deferrable` marks a handler that could move to `apps/worker` later without the event's meaning changing.
7. Handler failures are isolated and logged; they do not break the publisher or other handlers.

Initial events: `IdentityUpdated`, `EvidenceConfirmed`, `OpportunityImported`, `ApplicationSubmitted`,
`InterviewRecorded`, `OutcomeObserved`.

Events are for **meaningful state changes only** — not a general-purpose message bus and not a
substitute for calling a function.

## Consequences

- Cross-domain reaction without cross-domain writes, at near-zero infrastructure cost.
- Typing is compile-time only; there is no runtime schema validation. Acceptable in-process, and the first thing to add if events ever cross a process boundary.
- No durability: if the process dies between commit and dispatch, the event is lost. Accepted now; the migration path is a transactional outbox in `packages/database`, which the rules above make possible without touching event definitions.
- Rule 4 means events cannot be used for request/response. That is intended.

## Alternatives Considered

- **Kafka / a real broker.** Rejected: explicitly out of scope, and pure cost at this stage.
- **A database-backed queue now.** Rejected: solving durability before there is anything durable to lose. The outbox path is left open.
- **Untyped `emit(string, any)`.** Rejected: event names and payloads are product doctrine; they should not be stringly-typed.
- **Direct method calls between domains instead of events.** Retained where a synchronous result is genuinely needed via a domain's public API. Events are for notification, not for orchestration.

## Revisit When

A handler needs retries or guaranteed delivery, a handler's latency starts affecting request time,
or an event needs to cross a process boundary. First step then is a transactional outbox, not a broker.
