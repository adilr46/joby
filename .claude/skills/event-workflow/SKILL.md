---
name: event-workflow
description: Use whenever adding or changing a meaningful domain event — deciding the owning publisher, meaning, payload, inline vs deferrable delivery, transaction and outbox requirements, worker consumer, idempotency, and downstream effects. Use before writing any event code.
---

# Event Workflow

Use this before adding or changing an event. Events are contracts other domains depend on; changing
one after subscribers exist is expensive.

## What already exists — do not rebuild it

`packages/events` provides all of this. Compose it; never create a parallel mechanism:

- typed, transport-independent `EventEnvelope` — `id`, `name`, `occurredAt`, `personId`, `payload`, actor metadata, correlation and causation ids
- a **closed** `EventName` union of six events, each mapped to its owning domain
- `EventHandler` with `delivery: 'inline' | 'deferrable'`
- `InProcessEventDispatcher` (inline delivery, and handler execution in the worker)
- `TransactionalEventPublisher` — `recordDurable(tx, event)` and `publishCommitted(event)`
- `OutboxStore` and `DurableQueue` contracts
- `QueueEventConsumer`
- `serializeEvent` / `parseEvent`
- ADR 0002 (contracts, inline) and ADR 0004 (durable delivery)

If you're about to write an emitter, a job queue, a second dispatcher, or a bespoke retry loop —
stop. It exists.

## First: does this need an event at all?

Most things don't.

An event is a **meaningful state change in the person's career reality** that other domains may care
about. It is not a function call, not a notification mechanism, not a log line, not a way to avoid
importing a domain's public API.

Do **not** create an event for: an internal implementation step, a UI action, something only its own
domain reacts to, or something needing a return value. Events are one-way; if you need a result, call
the domain's public API.

Adding a name to the closed union is a product decision. If it isn't meaningful outside the domain
that produced it, it's a method.

## Decide, for each event

### 1. Owning publisher

Exactly one domain publishes it — the one that owns the state that changed. Any domain may subscribe.
If two domains could plausibly publish it, the boundary is wrong or it's two different events.

### 2. Meaning

One sentence, in the terms of `JOBY_MEMORY.md`. Past tense: a fact that is **already durably true**.
`EvidenceConfirmed`, never `ConfirmEvidence`. An event that reads like an instruction is a command in
disguise, and commands don't belong here.

Write the meaning down. It must not change later because of how the event ends up being delivered.

### 3. Payload

- JSON-serialisable. No class instances, no functions, no live references.
- **Identifiers, not object graphs.** Handlers re-read current state from the owning domain — by delivery time the world may have moved.
- Enough context to decide *whether* to act; never enough to avoid asking the owner.
- Minimal. Add fields when a subscriber genuinely needs them, not in anticipation.
- Carry epistemic status explicitly where it applies, so no subscriber has to assume.

### 4. Inline or deferrable

A property of each **handler**, not of the event. One event may have both.

| Inline | Deferrable |
|---|---|
| Immediate, cheap, local | Slow, external, or must not be lost |
| No durability, no retries | Survives process failure |
| Runs in `apps/api` after commit | Runs in `apps/worker` from the queue |

Choose deferrable if it does AI work, network calls, or heavy processing — **or if losing it would be
a correctness problem**. That second test is the one people skip.

### 5. Transaction and outbox

- **Any deferrable handler** ⟹ `recordDurable(tx, event)` **inside** the domain transaction, so the outbox row and the domain write commit together. After commit is too late and silently destroys the guarantee.
- Inline only ⟹ `publishCommitted(event)` after commit. Never inside a transaction.
- Both ⟹ both, in that order.

Keep transactions short. No network or AI calls inside one.

### 6. Worker consumer

Deferrable handlers are registered in `apps/worker` on a dispatcher constructed with
`accepts: 'deferrable'` — that's what stops a handler running inline *and* in the worker. The worker
composes `QueueEventConsumer`; it doesn't build its own.

### 7. Idempotency

**Delivery is at-least-once.** A worker can die after a handler succeeds but before the ack.

Every deferrable handler must be idempotent, **keyed on `event.id`**. Enforce it with a uniqueness
constraint, an upsert, or a processed-events record — check-then-act is not idempotency under
concurrency. Never key on payload content or timestamps.

Test it: deliver the same `event.id` twice and assert the outcome is identical.

### 8. Downstream effects

List every subscriber and what each does. Then check:

- Does any handler write another domain's data? It must not.
- Does any handler write Explicit State from AI output without a human gate? It must not.
- Does one event cascade into publishing others? Trace the chain; make sure it terminates and that causation ids are set.
- What breaks if a handler never runs, or runs twice, or runs an hour late? All three will happen.

## Changing an existing event

Adding an optional payload field is usually safe. Anything else is a contract change:

- **Never change what an event means.** Publish a new event instead.
- Removing or renaming a field, or narrowing a type, breaks subscribers — find them all first.
- Old envelopes already sit in the outbox and may be parsed by newer code. A change that can't read yesterday's rows is a breaking change.
- **Never change an event because of how it is delivered.** If a change only makes sense for one delivery path, it's wrong.

## Finish

Update `packages/events/README.md`'s event table. Add tests for duplicate delivery and partial
failure (`test-engineer`). If a decision here was consequential — a new delivery guarantee, a changed
meaning — write an ADR. Use `backend-engineer` for publication and `worker-engineer` for consumption.
