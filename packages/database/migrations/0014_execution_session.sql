-- Execution: the Application Session, one row per active application attempt.
-- Owning module: execution, inside the Translation Service (ADR 0003 — every table names its owner;
-- ADR 0031 — Execution owns temporary attempts and operational execution state).
--
--   Execution   = what Joby attempts.
--   Application = what is actually happening and what actually happened.
--
-- This table is the "attempting" half. It is durable enough to survive a restart, and that is the
-- only thing it shares with Application's own tables: nothing here is a fact about what happened,
-- only about what Execution is currently attempting. There is no foreign key into `application*`,
-- `opportunity*`, `adaptation_*` or `identity_*` tables — cross-module references are ids, not
-- constraints, for the same referential reason recorded in migrations 0011-0013.

CREATE TABLE execution_session (
    id              text        PRIMARY KEY,
    person_id       text        NOT NULL,
    opportunity_id  text        NOT NULL,
    -- A session may exist before a durable Application does. Linking them is a composition-root
    -- decision this migration does not make (ADR 0033 already leaves this open).
    application_id  text,

    -- Job / Company context (W_n-adjacent, but never a copy of Opportunity's understanding — a
    -- reference and revision, plus the two fields carried for display).
    opportunity_revision integer NOT NULL,
    role                  text,
    company               text,

    -- Portal context: navigation, not content. `portal_kind` is free text: Portal is
    -- infrastructure with no vocabulary of its own to enforce here (ADR 0031).
    portal_kind      text,
    current_step_id  text,

    -- Working application state: what Execution currently intends to submit. Never X_n — that is
    -- Application's, immutable, and written only once something actually crosses the boundary.
    -- `portal_field_values` is the single home for filled-in values, mechanical or otherwise;
    -- keeping only one column for this stops portal context and working state from disagreeing
    -- about which value is current.
    intent                jsonb,
    portal_field_values   jsonb  NOT NULL DEFAULT '{}',

    -- Current execution level and pause state. Deliberately disjoint from Application's timeline
    -- vocabulary (migration 0013) — this is the mechanical surface of one attempt, not a dated fact
    -- about the interaction.
    execution_level  text        NOT NULL DEFAULT 'not_started'
                       CHECK (execution_level IN (
                         'not_started', 'preparing', 'awaiting_input',
                         'ready_to_submit', 'submitted', 'failed')),
    paused           boolean     NOT NULL DEFAULT false,

    -- Requirements and session memory. JSONB: internal shape, no independent lifecycle of its own,
    -- and promoting a field to a relational column is a decision for when a query needs it.
    requirements     jsonb       NOT NULL DEFAULT '[]',
    memory           jsonb       NOT NULL DEFAULT '{"notes": []}',

    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),

    -- One active session per person per opportunity. A second concurrent attempt at the same
    -- opportunity is a later product question, not one this slice answers by allowing silent
    -- duplicates that nothing downstream could choose between.
    CONSTRAINT execution_session_unique UNIQUE (person_id, opportunity_id)
);

CREATE INDEX execution_session_person_idx ON execution_session (person_id, updated_at);
