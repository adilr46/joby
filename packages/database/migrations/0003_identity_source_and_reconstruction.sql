-- Identity: professional sources, reconstruction jobs, reconstruction proposals.
-- Owning domain: identity (ADR 0003 — every table names its owner).
--
-- What is deliberately NOT here: any canonical Explicit State table. Release 1 produces
-- proposals only. Canonical Reconstructed State (Structure/Activity/Relations) arrives in
-- Release 2, behind user confirmation. Stated Context has no table in any release until a use
-- case captures it, because only the user may write it (ADR 0011).

-- Plan 001 scaffolding, as promised. The ADR 0004 guarantees are now covered by tests that
-- create their own table instead of borrowing a production one.
DROP TABLE IF EXISTS foundation_probe;

-- The Person: the primitive, created with the first professional source, unclaimed (ADR 0010).
-- No account, email, or verification column belongs here or in any table below.
CREATE TABLE identity_person (
    id         text        PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- The Durable Identity root. Separate from the Person because the Person is the subject and the
-- Durable Identity is what Joby holds about them — one each, but they are not the same thing.
CREATE TABLE identity_durable_identity (
    id         text        PRIMARY KEY,
    person_id  text        NOT NULL UNIQUE REFERENCES identity_person (id),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- A captured professional source. Immutable: no UPDATE path exists in the repository, because
-- extraction improves and you cannot re-extract from something you overwrote.
--
-- `captured_at` is lifecycle fact one. It is NOT a status column, and no reconstruction outcome
-- is ever written back here — the facts stay separate (roadmap R1).
CREATE TABLE identity_professional_source (
    id           text        PRIMARY KEY,
    person_id    text        NOT NULL REFERENCES identity_person (id),
    kind         text        NOT NULL CHECK (kind IN ('cv')),
    content_type text        NOT NULL,
    filename     text,
    -- The bytes exactly as received. Postgres is the v1 store (roadmap Tier 2).
    content      bytea       NOT NULL,
    byte_size    integer     NOT NULL,
    -- sha256 of content. Dedup and idempotency for re-uploads of the same file.
    checksum     text        NOT NULL,
    -- Private by default. Visibility must survive extraction and projection.
    visibility   text        NOT NULL DEFAULT 'private' CHECK (visibility IN ('private')),
    captured_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX identity_source_person_idx ON identity_professional_source (person_id, captured_at DESC);
-- One stored copy per identical upload, per person: re-uploading the same CV is not a new source.
CREATE UNIQUE INDEX identity_source_dedup_idx ON identity_professional_source (person_id, checksum);

-- An Identity-owned durable job. Written in the same transaction as the source it reconstructs,
-- which is what makes "captured but never reconstructed" impossible.
--
-- Not an event: "this source still needs extracting" is not a meaningful fact about a person's
-- career, and the closed EventName union carries only facts that are (plan 002).
--
-- `status` here is the job's own lifecycle, not the source's and not the identity's.
CREATE TABLE identity_reconstruction_job (
    id           text        PRIMARY KEY,
    person_id    text        NOT NULL REFERENCES identity_person (id),
    source_id    text        NOT NULL REFERENCES identity_professional_source (id),
    status       text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
    attempts     integer     NOT NULL DEFAULT 0,
    claimed_at   timestamptz,
    completed_at timestamptz,
    -- A failed extraction is preserved for diagnosis and retry. The source is never lost with it.
    last_error   text,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX identity_job_claimable_idx ON identity_reconstruction_job (created_at)
    WHERE status = 'pending';
CREATE INDEX identity_job_in_flight_idx ON identity_reconstruction_job (claimed_at)
    WHERE status = 'processing';
-- One live job per source. A retry reuses the row; it does not queue a second reconstruction.
CREATE UNIQUE INDEX identity_job_source_idx ON identity_reconstruction_job (source_id);

-- The reconstruction proposal: lifecycle fact two, and the only output of extraction.
--
-- Nothing in here is true about the person yet. It is what a model proposed, pending review.
-- Release 2 adds the review decisions and the atomic transition into canonical R.
--
-- The proposed graph is JSONB: a draft's shape will change as extraction improves, and drafts are
-- not queried relationally. Canonical Reconstructed State in R2 is a separate decision.
CREATE TABLE identity_reconstruction_proposal (
    id           text        PRIMARY KEY,
    person_id    text        NOT NULL REFERENCES identity_person (id),
    source_id    text        NOT NULL REFERENCES identity_professional_source (id),
    job_id       text        NOT NULL REFERENCES identity_reconstruction_job (id),
    -- 'proposed' is the only status this release can produce. R2 adds the reviewed states.
    status       text        NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed')),
    -- Which extractor and model produced this, for provenance and for reproducibility.
    extractor    text        NOT NULL,
    model        text        NOT NULL,
    -- { structure[], activities[], relations[], conflicts[] } — each item carrying its own id,
    -- epistemic status, uncertainty and source references.
    proposal     jsonb       NOT NULL,
    generated_at timestamptz NOT NULL DEFAULT now()
);

-- One proposal per job. Redelivery or a retry after a partial failure must not produce a second.
CREATE UNIQUE INDEX identity_proposal_job_idx ON identity_reconstruction_proposal (job_id);
CREATE INDEX identity_proposal_person_idx ON identity_reconstruction_proposal (person_id, generated_at DESC);
