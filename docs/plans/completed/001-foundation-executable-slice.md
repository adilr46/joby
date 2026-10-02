# 001 — Foundation: make a vertical slice executable

## Goal

Nothing in this repository has ever executed. Make one transactional flow run end to end —
**API request → domain write + outbox row in one transaction → durable queue → worker handler** —
so Release 1 (UC01–UC03) has ground to stand on. No Identity product behaviour in this plan.

## Deviation from `vertical-slice` (declared, per plan 000 §3.4)

`vertical-slice` requires vertical, not horizontal, work. Foundation is horizontal by nature. The
deviation is bounded by scope: **build only what the R1 slice will execute.** Anything not exercised
by "upload a CV, extract asynchronously, produce a draft" is out of scope, listed below, and stays
out. Nothing durable is being decided; no ADR required.

## Domains affected

- `packages/database` — owns the client, migrations, and the ADR 0004 `OutboxStore` / `DurableQueue`
  implementations. Owed since ADR 0004 was accepted.
- `packages/events` — exists as source; gains a build and its first execution. **No contract changes.**
- `apps/api`, `apps/worker` — become runnable processes.
- `apps/web` — deferred to R1, where it has an actual screen to render.

## Doctrine check

- ADR 0003 — one Postgres database, ownership by convention. No second store.
- ADR 0004 — the outbox row is written **inside** the domain transaction. The migration and the
  `OutboxStore` API must make it hard to do otherwise: `recordDurable` takes a transaction handle
  and there is no post-commit variant of it.
- Deferrable handlers are idempotent on `event.id`, enforced by a uniqueness constraint, not
  check-then-act.
- Root rule: no new deployed service, no broker, no second runtime. Postgres and Node only.

## Events

None added or changed. The closed six-name union is untouched. The flow is exercised with an
existing event name in a test fixture, not a new one.

## Steps (each independently verifiable)

1. **Workspace tooling** — pnpm workspace, root `package.json`, `tsconfig.base.json`, per-package
   manifests and `tsconfig`. Verify: `pnpm typecheck` passes across the workspace.
2. **Test runner** — Vitest at the root, projects per package. Verify: an empty run reports 0 failures.
3. **`packages/events` compiles and its unit behaviour is covered** — dispatcher delivery filtering,
   serialize/parse round-trip. Verify: tests pass. *This is the first time this code has ever run.*
4. **Postgres locally** — `docker-compose.yml`, one database. Verify: connection succeeds.
5. **`packages/database`** — pool/client, transaction propagation (a `tx` handle threaded through
   repositories, no ambient async-local magic), forward-only migration runner. Verify: migrations
   apply to a clean database, and are idempotent on re-run.
6. **Migration: `event_outbox` and the queue table**, plus a processed-events table for idempotency.
   Verify: schema present, constraints assert what they claim.
   *Changed during implementation:* **one** table, not two. The outbox row *is* the queue message;
   a second table needs a relay between them, and a relay is a new place to lose an event —
   the failure the outbox exists to prevent. `DurableQueue` stays a separate interface, so the
   substrate can still be replaced without touching domain code.
7. **`OutboxStore` + `DurableQueue` implementations.** Verify: outbox row and domain row commit or
   roll back together, under an induced failure.
8. **`apps/api`** — a minimal HTTP process that opens a transaction, writes a row, records a
   deferrable event in the same transaction, commits. Verify: `curl` produces both rows.
9. **`apps/worker`** — a run loop composing `QueueEventConsumer`, with claim/ack/failure handling and
   clean shutdown. Verify: the row written by step 8 is processed by a handler, exactly once.
10. **Duplicate delivery and partial failure tests** (`test-engineer`). Verify: the same `event.id`
    delivered twice yields an identical final state; a worker killed after handling but before ack
    does not double-apply.

## Verification

`pnpm typecheck`, `pnpm test`, and a manually driven run of steps 8–9 against a real Postgres in
Docker with output pasted into the consolidation note. "It compiles" is not verification here —
the point of this plan is that something finally *runs*.

## Out of scope

- Any Identity domain concept: Person, Durable Identity, Explicit State, sources, drafts.
- `apps/web` and any UI.
- Retry backoff, dead-letter queues, event replay, queue monitoring (deferred in `CURRENT_STATE.md`).
- Auth, deployment, CI, containerised app images.
- An ORM. Raw SQL against `pg` until a repository proves it insufficient (Tier 3 choice, revisitable).
- Domain-local `CLAUDE.md` files and ADR 0009 — they belong to R1/R2, tracked in plan 000 §3.

## What actually happened

All ten steps done and verified on 2026-08-13. `pnpm typecheck` clean; `pnpm test` — 26 tests,
14 unit + 12 integration against PostgreSQL 17 in Docker. **`packages/events` executed for the
first time.** The API and worker were run as real processes: `POST /internal/foundation-probe`
wrote the probe row and the outbox row in one transaction, and the worker claimed, handled and
acked it, leaving `status = processed` and a `processed_events` claim.

Two decisions worth carrying forward, and one finding that lands on Release 1:

1. **One table for outbox and queue** — recorded above at step 6.
2. **Reclaim, not just claim.** `PostgresDurableQueue` takes `reclaimAfterMs` (default 60s), because
   the `DurableQueue` contract requires a claim abandoned by a dead worker to become claimable
   again. That makes redelivery routine rather than exceptional, which is why handler idempotency
   is enforced by a primary key (`processed_events`) and not by a lookup.
3. **Finding for R1 — a durable job has no home in the current event union.** `parseEvent` accepts
   only the six names in the closed `EventName` union, so the durable path can transport nothing
   else. Release 4 explicitly allows source capture to schedule reconstruction as *either* a
   meaningful source event *or* a domain-owned durable job — but only the first is currently
   possible. "Schedule extraction of this CV" is not a meaningful fact about a person's career, so
   naming it as an event to fit the transport would be the misuse `event-workflow` forbids.
   **R1 must decide this deliberately**: add a genuinely meaningful `SourceCaptured` event to the
   union, or add an Identity-owned durable job table alongside the outbox. Not settled here.

The Foundation probe (`foundation_probe` table, `apps/api/src/foundation-probe.ts`,
`apps/worker/src/handlers/foundation-probe-handler.ts`) is scaffolding and is **deleted by R1**.
It publishes `IdentityUpdated` for a synthetic person behind an env flag that is off by default;
nothing else in Joby may copy that pattern.

Not done, deliberately: `apps/web` (no screen to render until R1), and the git repository is still
uninitialised — that is the user's call, not the plan's.
