-- Opportunity capture (UC01) and opportunity understanding (UC02).
-- Owning modules: opportunity, and intelligence inside Translation (ADR 0003 — every table names
-- its owner; ADR 0025 — Opportunity owns the record and provenance, Intelligence owns the
-- interpretation).
--
--   Raw Opportunity -> Capture Evidence -> Understand -> Structured Opportunity
--
-- The split below is the acceptance criterion "raw evidence remains distinguishable from
-- interpreted understanding", expressed where it cannot be forgotten. Raw material lives in
-- `opportunity_*`; interpretation lives in `intelligence_*`. Neither module writes the other's
-- tables, and there is no column anywhere that mixes the two.

-- An Opportunity: anything a person could pursue.
--
-- **Not a job posting.** A posting is one kind of evidence attached to an opportunity, which is why
-- there is no url, deadline, salary, employment_type or posting_status column here — and must not
-- be one. A placement scheme, a research position, a competition and a speculative approach are all
-- opportunities, and several of them have no posting at all.
--
-- `title` and `organisation` are the caller's own labels for their record, deliberately nullable.
-- They are **not** the interpreted role and company: those are Intelligence's output and live in
-- `intelligence_opportunity_understanding`. A capture with neither is a normal case — "this thing
-- Sam forwarded me" is a real opportunity before anyone has read it.
CREATE TABLE opportunity (
    id           text        PRIMARY KEY,
    title        text,
    organisation text,
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- One piece of captured evidence about an opportunity. Many per opportunity.
--
-- Immutable: the repository exposes no UPDATE path. Postings are edited and deleted, and a person
-- may later need to know what it said when they applied — so re-capturing produces a new row rather
-- than overwriting this one. Interpretation improves; you cannot re-interpret what you overwrote.
CREATE TABLE opportunity_evidence (
    id             text        PRIMARY KEY,
    opportunity_id text        NOT NULL REFERENCES opportunity (id),

    -- What kind of material this is. Open enough to admit an email or a note, because those are
    -- how placement opportunities actually arrive.
    kind           text        NOT NULL CHECK (kind IN ('posting', 'description', 'email', 'note')),
    -- Where it came from, in the caller's words: a portal name, 'forwarded-email', a person.
    -- Free text, because the set of places an opportunity can come from is not closeable.
    source         text        NOT NULL,
    -- The source's own identifier where one exists. The strongest deduplication signal there is,
    -- and absent for anything that did not come from a system.
    external_ref   text,
    -- Where it was seen. Optional: a forwarded email has no URI, and requiring one would model the
    -- posting instead of the opportunity.
    uri            text,

    content_type   text        NOT NULL,
    -- The bytes exactly as received, unmodified. This is the raw side of the boundary; nothing
    -- interpreted is ever written here.
    content        bytea       NOT NULL,
    checksum       text        NOT NULL,

    captured_at    timestamptz NOT NULL DEFAULT now(),

    -- Capturing the same bytes for the same opportunity twice is one piece of evidence, not two,
    -- and must not schedule a second interpretation. The fast path checks; this enforces.
    CONSTRAINT opportunity_evidence_unique UNIQUE (opportunity_id, checksum)
);

CREATE INDEX opportunity_evidence_opportunity_idx
    ON opportunity_evidence (opportunity_id, captured_at);

-- Intelligence's interpretation of an opportunity (ADR 0025).
--
-- Owned by Intelligence, inside the Translation boundary. Deliberately in a different table
-- namespace from `opportunity_*`: Opportunity cannot write here, Intelligence cannot write there,
-- and no reader can confuse what the evidence said with what Joby made of it.
--
-- **No person appears in this table**, and no column may be added that would put one here. This is
-- one half of the Intelligence equation — what the opportunity is. What it means *for a person* is
-- `mapOpportunityToPerson`, which is computed per request and stored nowhere.
CREATE TABLE intelligence_opportunity_understanding (
    id             text        PRIMARY KEY,
    -- Opportunity's record, by reference. Not a foreign key on purpose: this is a cross-module
    -- reference, and an Intelligence row must not be deleted by another module's lifecycle
    -- (the same referential lesson as migration 0011).
    opportunity_id text        NOT NULL,

    -- Which reading of this opportunity. Re-interpreting after new evidence arrives produces a new
    -- revision rather than overwriting: an Adaptation Context already records
    -- `opportunity_revision` to reproduce its work, and a revision that silently changed underneath
    -- it would make that record a lie.
    revision       integer     NOT NULL,

    -- The structured understanding: role, company, requirements, conditions, attribution and
    -- uncertainty. JSONB because the shape is Intelligence's own and still moving; promoting a
    -- field to a column is a decision to make when a query needs it, not before.
    content        jsonb       NOT NULL,

    -- Which interpreter produced it, for provenance and reproducibility — the same reason a
    -- reconstruction proposal records its model.
    interpreter    text        NOT NULL,
    -- The evidence this reading was made from, by id. Attribution is not decoration: an
    -- understanding nobody can trace back to captured material is exactly what this architecture
    -- exists to prevent.
    evidence_ids   text[]      NOT NULL,

    created_at     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT intelligence_understanding_unique UNIQUE (opportunity_id, revision)
);

CREATE INDEX intelligence_understanding_latest_idx
    ON intelligence_opportunity_understanding (opportunity_id, revision DESC);
