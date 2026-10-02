# apps/worker

Background processing for longer-running AI and extraction work, and **the consumer of all deferrable
events**. Contracts established; no workflows implemented.

## Why it exists as a separate runtime

Two real operational reasons, which is the bar for a separate runtime (ADR 0001):

1. AI and extraction work takes tens of seconds to minutes and must never sit in a request path.
2. Deferrable events need a consumer that can fail and restart without losing work (ADR 0004).

The second one changes the worker's status: it is now required for **correctness**, not just
latency. A stopped worker means deferrable events accumulate as `pending` in the outbox. They are
not lost — that is the guarantee — but nothing downstream of them happens until it runs.

## Responsibility

Consume the durable queue and run deferrable handlers. Concretely, the worker composes what
`packages/events` provides and adds nothing architectural of its own:

```ts
const handlers = new InProcessEventDispatcher({ accepts: 'deferrable' });
handlers.subscribe(/* the deferrable handlers this runtime owns */);

const consumer = new QueueEventConsumer({ queue, handlers });
await consumer.runOnce({ limit: 10 });   // claim → dispatch → ack or release
```

- `accepts: 'deferrable'` is what stops a handler being registered here *and* in the API, where it would run twice.
- A message is acked only when every handler succeeded; any failure releases it for redelivery.
- The loop that calls `runOnce` repeatedly, its polling interval, and shutdown handling are this runtime's concern and are not written yet.

## Worker categories

The worker will host several categories of work. They share this runtime; they are not separate
services.

| Category | Examples |
|---|---|
| AI processing | EvidenceItem generation, interview intelligence |
| Document processing | CV extraction |
| Opportunity processing | Opportunity extraction, company research |
| Portal execution | Later. Needs its own ADR before a browser runtime is added. |

**None of these are implemented.** Do not implement them as part of infrastructure work.

## Rules

- The worker uses the same domain packages as the API. It is a different runtime, not a different architecture.
- Handlers marked `deferrable` in `packages/events` run here, and only here.
- The worker is where the **Slower Learning Loop** runs (ADR 0006). Handlers that update Learned State / PCI must be conservative — a single event never creates a durable trait — and must not learn from operational noise: portal retries, dropdown errors, captchas, transient failures.
- **Every handler must be idempotent, keyed on `event.id`.** Delivery is at-least-once: the worker can die after a handler succeeds but before the ack, and the message will come back.
- Worker output that constitutes an AI claim about a person is a **proposal**. It never writes Explicit State directly (Identity doctrine). Durable delivery does not make AI output authoritative.
- A handler writes only to its own domain's data, exactly as inline handlers do. Running in the worker changes nothing about domain ownership.
- Long-running work must be resumable or safely re-runnable. Assume it will be interrupted.

## Status

**Nothing here runs.** There is no application code in this directory, no build tooling, and no
database layer — so the `DurableQueue` the consumer needs has no implementation. What exists is the
contract the worker will compose (`QueueEventConsumer` in `packages/events`), not a running worker.
