-- Durable event delivery (ADR 0004).
--
-- One table serves both the transactional outbox and the durable queue. The outbox row *is*
-- the queue message: adding a second table would need a relay between them, and a relay is a
-- new place for an event to be lost — the exact failure the outbox exists to prevent.
-- `DurableQueue` remains a separate interface, so a different substrate can replace this
-- without touching domain code.
--
-- `event_id` is text, not uuid: the envelope contract types it as a string, and the storage
-- layer does not get to narrow a domain contract.

CREATE TABLE event_outbox (
    event_id     text        PRIMARY KEY,
    event_name   text        NOT NULL,
    -- The complete envelope, unmodified. Delivery must never alter an event.
    envelope     jsonb       NOT NULL,
    -- When the domain transaction ran. Not the envelope's occurredAt.
    created_at   timestamptz NOT NULL DEFAULT now(),
    status       text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
    claimed_at   timestamptz,
    processed_at timestamptz,
    attempts     integer     NOT NULL DEFAULT 0,
    last_error   text
);

-- Claim order: oldest pending first. Partial, because processed rows accumulate and are
-- never claimed again.
CREATE INDEX event_outbox_claimable_idx
    ON event_outbox (created_at)
    WHERE status = 'pending';

-- Finding claims abandoned by a worker that died mid-handler.
CREATE INDEX event_outbox_in_flight_idx
    ON event_outbox (claimed_at)
    WHERE status = 'processing';

-- Handler-level idempotency (ADR 0004: delivery is at-least-once).
--
-- The primary key is the enforcement. A handler inserts here inside its own transaction and
-- skips its work if the insert conflicts. Check-then-act is not idempotency under concurrency;
-- this is why the constraint exists rather than a lookup helper.
CREATE TABLE processed_events (
    event_id     text        NOT NULL,
    handler_id   text        NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, handler_id)
);
