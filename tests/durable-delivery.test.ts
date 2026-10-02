/**
 * The ADR 0004 guarantees, against a real database.
 *
 * These test *behaviour under failure*, not class structure. Every one of them corresponds to
 * something that will actually happen in production: a transaction rolls back, a worker dies
 * mid-handler, a message is delivered twice, two workers poll at the same instant.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PostgresDurableQueue,
  PostgresOutboxStore,
  oncePerEvent,
  type Database,
} from '@joby/database';
import {
  createEvent,
  InProcessEventDispatcher,
  QueueEventConsumer,
  TransactionalEventPublisher,
  type EventHandler,
  type JobyEvent,
} from '@joby/events';

import {
  connectTestDatabase,
  createDeliveryProbeTable,
  hasDatabase,
  truncateAll,
} from './support/database';

const describeIntegration = hasDatabase
  ? describe
  : describe.skip.bind(null) as typeof describe;

if (!hasDatabase) {
  console.warn(
    '\n[tests] SKIPPING durable-delivery integration tests: DATABASE_URL is not set.\n' +
      '        Run `pnpm db:up` and set DATABASE_URL to run them.\n',
  );
}

function probeEvent(identityId: string): JobyEvent<'IdentityUpdated'> {
  return createEvent('IdentityUpdated', {
    personId: 'foundation-probe',
    payload: { identityId, changedFields: ['note'], revision: 1, userConfirmed: true },
    metadata: { source: 'api', actor: { kind: 'system', component: 'test' } },
  });
}

describeIntegration('durable delivery', () => {
  let db: Database;
  let publisher: TransactionalEventPublisher;

  beforeAll(async () => {
    db = await connectTestDatabase();
    await createDeliveryProbeTable(db);
  });

  afterAll(async () => {
    await db?.close();
  });

  beforeEach(async () => {
    await truncateAll(db);
    await db.query('TRUNCATE test_delivery_probe');
    publisher = new TransactionalEventPublisher({
      outbox: new PostgresOutboxStore(),
      inline: new InProcessEventDispatcher({ accepts: 'inline' }),
    });
  });

  describe('the outbox commits with the domain write', () => {
    it('persists both when the transaction commits', async () => {
      const event = probeEvent('probe-1');

      await db.transaction(async (tx) => {
        await tx.query('INSERT INTO test_delivery_probe (id, note) VALUES ($1, $2)', ['probe-1', 'x']);
        await publisher.recordDurable(tx, event);
      });

      const probes = await db.query('SELECT id FROM test_delivery_probe');
      const outbox = await db.query<{ event_id: string; status: string }>('SELECT event_id, status FROM event_outbox');

      expect(probes.rowCount).toBe(1);
      expect(outbox.rows[0]?.event_id).toBe(event.id);
      expect(outbox.rows[0]?.status).toBe('pending');
    });

    it('persists neither when the transaction rolls back', async () => {
      // The failure arrives *after* both writes — the case where a naive implementation has
      // already published and cannot take it back.
      await expect(
        db.transaction(async (tx) => {
          await tx.query('INSERT INTO test_delivery_probe (id, note) VALUES ($1, $2)', ['probe-2', 'x']);
          await publisher.recordDurable(tx, probeEvent('probe-2'));
          throw new Error('domain logic failed after both writes');
        }),
      ).rejects.toThrow('domain logic failed');

      expect((await db.query('SELECT 1 FROM test_delivery_probe')).rowCount).toBe(0);
      expect((await db.query('SELECT 1 FROM event_outbox')).rowCount).toBe(0);
    });

    it('refuses to write outside a transaction rather than losing the guarantee', async () => {
      // Passing anything that is not an open transaction must fail loudly. Silently writing
      // on another connection is the bug this exists to prevent.
      await expect(publisher.recordDurable({} as never, probeEvent('probe-3'))).rejects.toThrow(
        /open Joby transaction/,
      );
    });
  });

  describe('the queue', () => {
    async function enqueue(identityId: string): Promise<JobyEvent<'IdentityUpdated'>> {
      const event = probeEvent(identityId);
      await db.transaction(async (tx) => {
        await tx.query('INSERT INTO test_delivery_probe (id, note) VALUES ($1, $2)', [identityId, 'x']);
        await publisher.recordDurable(tx, event);
      });
      return event;
    }

    it('returns the envelope unaltered after a round trip through jsonb', async () => {
      const event = await enqueue('probe-4');
      const queue = new PostgresDurableQueue(db);

      const [message] = await queue.claim({ limit: 10 });

      expect(message?.event).toEqual(event);
      expect(message?.attempts).toBe(1);
    });

    it('does not hand the same message to two concurrent claimers', async () => {
      await enqueue('probe-5');
      const queue = new PostgresDurableQueue(db);

      const [first, second] = await Promise.all([
        queue.claim({ limit: 10 }),
        queue.claim({ limit: 10 }),
      ]);

      expect((first?.length ?? 0) + (second?.length ?? 0)).toBe(1);
    });

    it('makes an abandoned claim claimable again', async () => {
      // A worker that died mid-handler leaves the row in `processing` forever otherwise.
      const event = await enqueue('probe-6');
      const impatient = new PostgresDurableQueue(db, { reclaimAfterMs: 0 });

      const first = await impatient.claim({ limit: 10 });
      const second = await impatient.claim({ limit: 10 });

      expect(first[0]?.eventId).toBe(event.id);
      expect(second[0]?.eventId).toBe(event.id);
      expect(second[0]?.attempts).toBe(2);
    });

    it('does not redeliver an acked message', async () => {
      await enqueue('probe-7');
      const queue = new PostgresDurableQueue(db, { reclaimAfterMs: 0 });

      const [message] = await queue.claim({ limit: 10 });
      await queue.ack(message!.eventId);

      expect(await queue.claim({ limit: 10 })).toHaveLength(0);
    });

    it('returns a released message to pending, with the reason kept', async () => {
      await enqueue('probe-8');
      const queue = new PostgresDurableQueue(db);

      const [message] = await queue.claim({ limit: 10 });
      await queue.release(message!.eventId, { message: 'handler exploded' });

      const { rows } = await db.query<{ status: string; last_error: string }>(
        'SELECT status, last_error FROM event_outbox',
      );
      expect(rows[0]?.status).toBe('pending');
      expect(rows[0]?.last_error).toBe('handler exploded');
      expect(await queue.claim({ limit: 10 })).toHaveLength(1);
    });
  });

  describe('worker consumption', () => {
    async function enqueue(identityId: string): Promise<JobyEvent<'IdentityUpdated'>> {
      const event = probeEvent(identityId);
      await db.transaction(async (tx) => {
        await tx.query('INSERT INTO test_delivery_probe (id, note) VALUES ($1, $2)', [identityId, 'x']);
        await publisher.recordDurable(tx, event);
      });
      return event;
    }

    function appendingHandler(id = 'identity.foundation-probe'): EventHandler<'IdentityUpdated'> {
      return {
        id,
        module: 'durable_identity',
        handles: 'IdentityUpdated',
        delivery: 'deferrable',
        async handle(event) {
          await db.transaction(async (tx) => {
            await oncePerEvent(tx, event.id, id, async (inTx) => {
              await inTx.query(`UPDATE test_delivery_probe SET note = note || '!' WHERE id = $1`, [
                event.payload.identityId,
              ]);
            });
          });
        },
      };
    }

    function consumerWith(...handlers: EventHandler<'IdentityUpdated'>[]) {
      const dispatcher = new InProcessEventDispatcher({ accepts: 'deferrable', onError: () => {} });
      for (const handler of handlers) dispatcher.subscribe(handler);
      return new QueueEventConsumer({
        queue: new PostgresDurableQueue(db, { reclaimAfterMs: 0 }),
        handlers: dispatcher,
      });
    }

    it('processes a claimed message and acks it', async () => {
      await enqueue('probe-9');

      const result = await consumerWith(appendingHandler()).runOnce();

      expect(result).toEqual({ claimed: 1, acked: 1, released: 0 });
      const { rows } = await db.query<{ note: string }>('SELECT note FROM test_delivery_probe');
      expect(rows[0]?.note).toBe('x!');
    });

    it('is idempotent under duplicate delivery of the same event id', async () => {
      // The core at-least-once guarantee. Delivered twice, the state must be identical —
      // hence '!' appended once, not twice.
      const event = await enqueue('probe-10');
      const consumer = consumerWith(appendingHandler());

      await consumer.runOnce();
      // Force redelivery of the very same envelope, as a reclaim or a duplicate ack loss would.
      await db.query(`UPDATE event_outbox SET status = 'pending', claimed_at = NULL WHERE event_id = $1`, [
        event.id,
      ]);
      await consumer.runOnce();

      const { rows } = await db.query<{ note: string }>('SELECT note FROM test_delivery_probe');
      expect(rows[0]?.note).toBe('x!');
    });

    it('releases rather than acks when a handler fails, and one failure does not strand the batch', async () => {
      await enqueue('probe-11');

      const failing: EventHandler<'IdentityUpdated'> = {
        id: 'identity.always-fails',
        module: 'durable_identity',
        handles: 'IdentityUpdated',
        delivery: 'deferrable',
        handle: async () => {
          throw new Error('boom');
        },
      };
      const succeeding = vi.fn();

      const result = await consumerWith(failing, {
        ...appendingHandler('identity.other'),
        handle: succeeding,
      }).runOnce();

      expect(result).toEqual({ claimed: 1, acked: 0, released: 1 });
      // The other handler still ran — failures are isolated, not batch-fatal.
      expect(succeeding).toHaveBeenCalledOnce();

      const { rows } = await db.query<{ status: string; last_error: string }>(
        'SELECT status, last_error FROM event_outbox',
      );
      expect(rows[0]?.status).toBe('pending');
      expect(rows[0]?.last_error).toContain('identity.always-fails');
    });

    it('does not consume the work of a handler whose transaction rolled back', async () => {
      // Claim-and-work must commit together. If the claim survived a failed handler, the
      // event would be skipped forever — silently, and only in production.
      const event = await enqueue('probe-12');

      const brokenAfterClaim: EventHandler<'IdentityUpdated'> = {
        id: 'identity.rolls-back',
        module: 'durable_identity',
        handles: 'IdentityUpdated',
        delivery: 'deferrable',
        async handle(e) {
          await db.transaction(async (tx) => {
            await oncePerEvent(tx, e.id, 'identity.rolls-back', async (inTx) => {
              await inTx.query(`UPDATE test_delivery_probe SET note = note || '?' WHERE id = $1`, [
                e.payload.identityId,
              ]);
            });
            throw new Error('failed after claiming');
          });
        },
      };

      await consumerWith(brokenAfterClaim).runOnce();

      const claims = await db.query('SELECT 1 FROM processed_events WHERE event_id = $1', [event.id]);
      const probe = await db.query<{ note: string }>('SELECT note FROM test_delivery_probe');

      expect(claims.rowCount).toBe(0);
      expect(probe.rows[0]?.note).toBe('x');
    });
  });
});
