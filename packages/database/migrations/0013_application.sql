-- Application: the durable structured observation of one Person x Opportunity interaction.
-- Owning module: application (ADR 0003 — every table names its owner; ADR 0031/0032 — Application is
-- its own semantic authority, independent of Translation).
--
--   O_n = (P_n, W_n, R_n, A_n, X_n, I_n, Y_n)
--
-- Seven epistemically distinct parts. The table split below is that distinction expressed where it
-- cannot be forgotten: each part lives in its own table (or its own JSONB column, where a part has
-- no independent lifecycle of its own), and none of them is a foreign key into Identity,
-- Representation, Opportunity or Adaptation's tables. Application references those authorities by
-- id and revision; it never joins into their schemas, and reading this schema alone must never look
-- like a second copy of any of them.

-- The root. One row per Person x Opportunity interaction.
--
-- No `stage` or `status` column here — the current stage is derived from `application_timeline_entry`
-- chronology (see the model's `deriveCurrentState`), never independently stored. A stage column beside
-- the timeline would be a second place the same fact could disagree with itself.
CREATE TABLE application (
    id             text        PRIMARY KEY,
    person_id      text        NOT NULL,
    -- Opportunity's identifier, by reference. Deliberately not a foreign key: this is a cross-module
    -- reference, and an Application row must not be deleted by another module's lifecycle — the same
    -- referential lesson recorded in migrations 0011 and 0012.
    opportunity_id text        NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),

    -- One Application per person per opportunity. A second would be a second answer to "what
    -- happened when this person applied here", and nothing downstream could choose between them.
    CONSTRAINT application_unique UNIQUE (person_id, opportunity_id)
);

CREATE INDEX application_person_idx ON application (person_id, created_at);

-- P_n, W_n, R_n, A_n — lineage used, all as one row.
--
-- Each of these four parts is references and revisions, never copies: the grounding Profile Unit
-- ids, the Identity revision, the Opportunity revision, which Representation was recommended versus
-- selected, and which Adaptation context and drafts were consulted. None of it is queried
-- relationally yet, and JSONB keeps that honest — promoting a field to a column is a decision to make
-- when a query needs it, not a speculative shape now.
--
-- `representation_overridden` is NOT a stored column: it is derived from `recommended` and
-- `selected` in application code, for the same reason current stage is derived rather than stored.
CREATE TABLE application_lineage (
    application_id       text        PRIMARY KEY REFERENCES application (id),

    -- P_n
    grounding_profile_unit_ids text[]  NOT NULL DEFAULT '{}',
    identity_revision          integer NOT NULL,
    user_context_used          jsonb,

    -- W_n
    opportunity_revision       integer NOT NULL,

    -- R_n
    recommended_representation_id text,
    selected_representation_id    text,
    representation_revision       integer,

    -- A_n
    adaptation_context_id         text,
    draft_ids                     text[]  NOT NULL DEFAULT '{}',

    recorded_at                   timestamptz NOT NULL DEFAULT now()
);

-- X_n — what was actually sent. Immutable: no UPDATE path in the repository.
--
-- Deliberately separate from A_n (`application_lineage.draft_ids`): what Joby produced and what the
-- person actually sent can differ, and only this table reflects what crossed the external boundary.
-- `source_draft_id` is a plain reference, not a foreign key into Adaptation's tables — Application
-- must not gain a way to reach into Adaptation's schema to satisfy a constraint.
CREATE TABLE application_submitted_material (
    id                text        PRIMARY KEY,
    application_id    text        NOT NULL REFERENCES application (id),
    kind              text        NOT NULL CHECK (kind IN ('cv', 'answer', 'cover_letter', 'document')),
    content           text,
    source_draft_id   text,
    edited_from_source boolean    NOT NULL DEFAULT false,
    submitted_at      timestamptz NOT NULL,
    recorded_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX application_submitted_material_application_idx
    ON application_submitted_material (application_id, submitted_at);

-- I_n — interaction history. Three append-only streams; none of them ever updated in place.

-- Lifecycle. A correction is a new row `supersedes`ing an earlier one — the superseded row stays, so
-- what was believed at the time remains inspectable. `current_state` is computed from this table at
-- read time and stored nowhere.
CREATE TABLE application_timeline_entry (
    id             text        PRIMARY KEY,
    application_id text        NOT NULL REFERENCES application (id),
    stage          text        NOT NULL CHECK (stage IN (
                       'drafting', 'submitted', 'under_review', 'screening',
                       'interviewing', 'offer', 'rejected', 'withdrawn')),
    occurred_at    timestamptz NOT NULL,
    note           text,
    -- The entry this corrects. Not a foreign key with ON DELETE: nothing here is ever deleted, and a
    -- dangling reference to a superseded entry is meaningless because the superseded entry is never
    -- removed either.
    supersedes     text,
    recorded_at    timestamptz NOT NULL DEFAULT now(),
    recorded_by    text        NOT NULL
);

CREATE INDEX application_timeline_entry_application_idx
    ON application_timeline_entry (application_id, occurred_at);

-- Communications. Meaningful exchanges, not a message-log mirror — that boundary is enforced by
-- convention at the call site, the same way Career Memory's "meaningful vs noise" line is.
CREATE TABLE application_communication (
    id             text        PRIMARY KEY,
    application_id text        NOT NULL REFERENCES application (id),
    direction      text        NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    channel        text        NOT NULL,
    summary        text        NOT NULL,
    occurred_at    timestamptz NOT NULL,
    recorded_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX application_communication_application_idx
    ON application_communication (application_id, occurred_at);

-- Interview stages: what happened, and the person's own reflection afterwards. `reflection` is their
-- account in their own words — never a system-generated score, and nothing here computes one.
CREATE TABLE application_interview_stage (
    id             text        PRIMARY KEY,
    application_id text        NOT NULL REFERENCES application (id),
    kind           text        NOT NULL CHECK (kind IN (
                       'phone', 'video', 'in_person', 'assessment_centre', 'take_home')),
    occurred_at    timestamptz,
    observations   text[]      NOT NULL DEFAULT '{}',
    reflection     text,
    recorded_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX application_interview_stage_application_idx
    ON application_interview_stage (application_id, recorded_at);

-- Y_n — resolved outcomes. Deliberately its own table, separate from the timeline: a stage is a fact
-- about progress through the process, an outcome is a fact about how the world responded, and
-- collapsing them invites reading causation into two facts that merely happened in sequence.
CREATE TABLE application_outcome (
    id             text        PRIMARY KEY,
    application_id text        NOT NULL REFERENCES application (id),
    kind           text        NOT NULL CHECK (kind IN (
                       'progressed', 'offer', 'rejection', 'withdrawn', 'no_response')),
    occurred_at    timestamptz NOT NULL,
    note           text,
    recorded_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX application_outcome_application_idx ON application_outcome (application_id, occurred_at);
