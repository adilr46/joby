# database

The shared persistence layer. **One PostgreSQL database** (ADR 0003).

This package owns the connection, transactions, migrations, and the ADR 0004 delivery
infrastructure. It owns **no domain data**: every domain owns its own tables and its own
repositories, in its own package. A table that belongs to a domain does not get a repository here
because it was convenient.

## What is here

| | |
|---|---|
| `client.ts` | Pool, `Queryable` / `Transaction` / `Database`, `asTransaction` |
| `migrator.ts` | Forward-only, checksummed migrations; `migrate-cli.ts` is `pnpm db:migrate` |
| `outbox-store.ts` | `PostgresOutboxStore` — the ADR 0004 `OutboxStore` |
| `durable-queue.ts` | `PostgresDurableQueue` — the ADR 0004 `DurableQueue` |
| `idempotency.ts` | `oncePerEvent` — at-least-once survival for deferrable handlers |
| `migrations/` | Applied in filename order, once, immutably |

## Transactions are explicit

A repository that must participate in a caller's transaction **takes it as a parameter**. There is
no ambient or async-local "current transaction".

```ts
await db.transaction(async (tx) => {
  await repository.save(tx, thing);        // domain write
  await publisher.recordDurable(tx, event); // outbox row, same transaction
});
await publisher.publishCommitted(event);    // inline handlers, after commit
```

ADR 0004's guarantee is that those two writes commit together. Ambient context hides which
transaction a write is in — which is precisely the thing that has to be visible at the call site.
`recordDurable` outside a transaction throws rather than silently writing on another connection.

## Outbox and queue are one table

`event_outbox` is both. The outbox row *is* the queue message. Two tables would need a relay between
them, and a relay is a new place for an event to be lost — the failure the outbox exists to prevent.
`DurableQueue` stays a separate interface, so the substrate can be replaced without touching domain
code.

Claiming uses `FOR UPDATE SKIP LOCKED`. A claim held longer than `reclaimAfterMs` (default 60s) is
taken by another worker, because a worker can die mid-handler. **Redelivery is routine, not
exceptional** — which is why handler idempotency is enforced by the `processed_events` primary key
and never by a lookup:

```ts
await db.transaction(async (tx) => {
  await oncePerEvent(tx, event.id, 'identity.my-handler', async (inTx) => {
    // ...the work. Commits with the claim, or not at all.
  });
});
```

Not here, deliberately (ADR 0004): retry backoff, dead-letter handling, replay, monitoring. Add them
when a real failure pattern exists to design against, and write the ADR.

## Migrations

Forward-only. Applied once, in filename order, each in its own transaction, checksummed — editing an
applied migration is an error, because it means one database has a schema nobody else does. There is
no `down`: reversing a schema over data already written is a rewrite, not a rollback.
