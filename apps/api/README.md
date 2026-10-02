# apps/api

The main backend. **Not yet populated.**

## What it is

The runtime that hosts most domain packages. It depends on them **directly** — several domains run
inside this one process, and that is intended (ADR 0001).

## Rules

- The API composes domains; it does not contain domain logic. Business rules live in `packages/<domain>`.
- **No network calls between domains inside this process.** Import the domain's public API.
- The API owns the inline dispatcher and the `TransactionalEventPublisher`, and wires **inline handlers only** at startup. Construct the dispatcher with `accepts: 'inline'` — a deferrable handler registered here would run inline *and* in the worker.
- Two publish moments, and the difference matters (ADR 0004): `recordDurable(tx, event)` goes **inside** the domain transaction; `publishCommitted(event)` goes **after** commit. Writing the outbox row after commit silently destroys the durability guarantee.
- Inline events are published **after commit**, never inside a transaction.
- Anything long-running — AI work, extraction, research — is handed to `apps/worker` rather than run in a request.

## Not here, deliberately

Seven services. One API hosting seven domain packages is the architecture, not a stepping stone
that must be escaped.
