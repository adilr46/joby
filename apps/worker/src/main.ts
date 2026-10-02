/**
 * `apps/worker` — the deferrable runtime.
 *
 * Two kinds of durable work, polled by one process:
 *
 *  - **Deferrable events** from the transactional outbox (ADR 0004).
 *  - **Identity reconstruction jobs**, an Identity-owned durable job table (plan 002). Not an
 *    event, because "this source still needs extracting" is not a fact about a person's career.
 *
 * Both are claimed with `FOR UPDATE SKIP LOCKED` and both reclaim abandoned claims, so both are
 * at-least-once and both must be idempotent.
 */

import {
  createDatabase,
  databaseConfigFromEnv,
  PostgresDurableQueue,
  type Database,
} from '@joby/database';
import { InProcessEventDispatcher, QueueEventConsumer } from '@joby/events';
import { createIdentityRuntime } from '@joby/identity/runtime';
import { createOpportunity, createOpportunityUnderstanding } from '@joby/opportunity';
import { createCanonicalFactRemovedHandler } from '@joby/identity/representation/runtime';

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 1000);
const BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE ?? 10);

const db: Database = createDatabase(databaseConfigFromEnv());

// `accepts: 'deferrable'` is the guard: an inline handler registered here would throw at startup
// rather than quietly running in the wrong runtime. No handlers yet — R1 publishes no events.
const handlers = new InProcessEventDispatcher({ accepts: 'deferrable' });
handlers.subscribe(createCanonicalFactRemovedHandler(db));
const events = new QueueEventConsumer({ queue: new PostgresDurableQueue(db), handlers });

// From `/runtime`: the reconstruction loop is a composition concern, not something another domain
// should be able to reach.
const identity = createIdentityRuntime({ db });

/**
 * UC02 — reading captured opportunities into structured understanding.
 *
 * Polled rather than event-driven, and the reason is a real constraint rather than convenience:
 * every Joby event is about exactly one person, and capturing an opportunity is not (ADR 0028).
 * Inventing a person to satisfy the envelope would be worse than polling a bounded window.
 *
 * Idempotent by evidence set: an opportunity whose current reading was already made from exactly
 * this evidence is skipped, so the loop cannot manufacture revisions.
 */
const opportunityRecords = createOpportunity({ db });
const understanding = createOpportunityUnderstanding({
  db,
  opportunities: {
    listSummaries: (options) => opportunityRecords.listSummaries(options),
    readEvidence: (opportunityId) => opportunityRecords.readEvidenceText(opportunityId),
  },
});

let running = true;
let idle: Promise<void> = Promise.resolve();

async function loop(): Promise<void> {
  while (running) {
    let worked = false;

    try {
      const delivered = await events.runOnce({ limit: BATCH_SIZE });
      if (delivered.claimed > 0) {
        worked = true;
        console.log(
          `[worker] events: claimed ${delivered.claimed}, acked ${delivered.acked}, released ${delivered.released}`,
        );
      }
    } catch (error) {
      // The queue itself failed, not a handler — handler failures are already isolated. Keep the
      // loop alive; a dead worker strands both queues.
      console.error('[worker] event poll failed', error);
    }

    try {
      const reconstructed = await identity.runReconstruction({ limit: BATCH_SIZE });
      if (reconstructed.claimed > 0) {
        worked = true;
        console.log(
          `[worker] reconstruction: claimed ${reconstructed.claimed}, succeeded ${reconstructed.succeeded}, ` +
            `failed ${reconstructed.failed}, skipped ${reconstructed.skipped}`,
        );
      }
    } catch (error) {
      console.error('[worker] reconstruction poll failed', error);
    }

    try {
      const understood = await understanding.understandOutstanding({ limit: BATCH_SIZE });
      // **A failure is not productive work.** Counting it would skip the sleep, and one opportunity
      // that can never be read would spin this process at full speed forever, starving the outbox
      // and reconstruction polls sharing the loop.
      if (understood.understood > 0) worked = true;
      if (understood.understood > 0 || understood.failed > 0) {
        console.log(
          `[worker] understanding: considered ${understood.considered}, understood ` +
            `${understood.understood}, skipped ${understood.skipped}, failed ${understood.failed}`,
        );
      }
    } catch (error) {
      console.error('[worker] opportunity understanding poll failed', error);
    }

    // Work was waiting; look again immediately rather than sleeping through a backlog.
    if (!worked) await sleep(POLL_INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

console.log(`[worker] started, polling every ${POLL_INTERVAL_MS}ms`);
idle = loop();

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] ${signal} — finishing current batch`);
  running = false;
  // Let the in-flight batch settle. Being killed mid-extraction is survivable — the claim times
  // out and the job is retried — but a clean stop avoids the redelivery entirely.
  await idle;
  await db.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
