-- Identity: professional sources beyond the CV, and GitHub repository selection.
-- Owning domain: identity (ADR 0003).
--
-- The Explicit State model is untouched. A new source type must not change what Explicit State
-- *is* — that is the whole point of the professional-source abstraction (roadmap R3).

-- A source is no longer only an uploaded CV. GitHub repository metadata is stored the same way:
-- the exact bytes Joby received, so provenance, dedup and reprocessing all work identically.
ALTER TABLE identity_professional_source
    DROP CONSTRAINT identity_professional_source_kind_check;

ALTER TABLE identity_professional_source
    ADD CONSTRAINT identity_professional_source_kind_check
    CHECK (kind IN ('cv', 'github_repository'));

-- A repository may be public. A CV is not. Visibility travels with the source and constrains
-- everything derived from it — a fact whose only evidence is a private repo must not be disclosed
-- because it reached Explicit State.
ALTER TABLE identity_professional_source
    DROP CONSTRAINT identity_professional_source_visibility_check;

ALTER TABLE identity_professional_source
    ADD CONSTRAINT identity_professional_source_visibility_check
    CHECK (visibility IN ('private', 'public'));

-- The source's own identifier at origin, e.g. 'octocat/rota-scheduler'. Lets a refresh find the
-- source it replaces without matching on content.
ALTER TABLE identity_professional_source
    ADD COLUMN external_ref text;

-- What the source looked like when captured, e.g. a pushed-at timestamp. A refresh that finds an
-- unchanged version does no work, which is what stops re-ingestion manufacturing churn.
ALTER TABLE identity_professional_source
    ADD COLUMN source_version text;

CREATE INDEX identity_source_external_ref_idx
    ON identity_professional_source (person_id, kind, external_ref);

-- A connected GitHub account.
--
-- Deliberately holds NO credential. Storing an OAuth token needs a secrets decision that has not
-- been made, and inventing one here would bury it in a migration. Credentials are supplied to the
-- client at call time; this records which account the user connected, and when.
CREATE TABLE identity_github_connection (
    id            text        PRIMARY KEY,
    person_id     text        NOT NULL REFERENCES identity_person (id),
    account_login text        NOT NULL,
    connected_at  timestamptz NOT NULL DEFAULT now(),
    -- One connected account per person for now. A second would need a decision about which one
    -- a repository belongs to.
    CONSTRAINT identity_github_connection_person UNIQUE (person_id)
);

-- Which repositories the user has allowed Joby to look at.
--
-- This table is the permission. Ingestion reads it and asks GitHub about nothing else — an
-- unselected repository is never fetched, not fetched-then-filtered.
CREATE TABLE identity_repository_selection (
    id            text        PRIMARY KEY,
    person_id     text        NOT NULL REFERENCES identity_person (id),
    connection_id text        NOT NULL REFERENCES identity_github_connection (id),
    -- 'owner/name'.
    full_name     text        NOT NULL,
    selected      boolean     NOT NULL DEFAULT true,
    -- Recorded at selection time so a private repo is known to be private before anything is
    -- derived from it.
    is_private    boolean     NOT NULL DEFAULT true,
    selected_at   timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT identity_repository_selection_unique UNIQUE (person_id, full_name)
);

CREATE INDEX identity_repository_selection_active_idx
    ON identity_repository_selection (person_id)
    WHERE selected;

-- Reconstruction jobs gain a trigger: every one traces to something the user did.
--
-- There is no 'scheduled' or 'periodic' value, and adding one would be a product decision, not a
-- convenience — Joby does not crawl (ADR 0010).
ALTER TABLE identity_reconstruction_job
    ADD COLUMN trigger text NOT NULL DEFAULT 'source_added'
    CHECK (trigger IN ('source_added', 'selection_changed', 'refresh'));
