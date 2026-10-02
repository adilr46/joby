-- Identity: canonical Explicit State — Reconstructed State R = (Structure, Activity, Relations).
-- Owning domain: identity (ADR 0003, ADR 0009, ADR 0011).
--
-- This is the first canonical person-state in Joby. Until now "AI output cannot become truth" was
-- guaranteed by there being nowhere for it to go; from here it is guaranteed by the write path.
--
-- Still absent, deliberately:
--   * Stated Context (X) — only the user may write it, and no use case captures it yet.
--   * Learned State (L) / PCI — the Slower Learning Loop's territory, not this slice's.
--   * Education / Experience / Projects / Skills — projections, never stores (ADR 0009).

-- Optimistic concurrency for whole-set transitions (confirmation). Also the `revision` carried in
-- the IdentityUpdated payload.
ALTER TABLE identity_durable_identity
    ADD COLUMN revision integer NOT NULL DEFAULT 0;

-- Canonical Structure and Activity.
--
-- One table with a discriminator rather than two: relations point at either kind, and a single
-- node identity space gives those endpoints real foreign keys instead of a polymorphic id that
-- nothing can enforce. The CHECK constraints below keep Structure and Activity genuinely distinct
-- — a node cannot carry the other's columns.
CREATE TABLE identity_explicit_node (
    id              text        PRIMARY KEY,
    person_id       text        NOT NULL REFERENCES identity_person (id),
    node_type       text        NOT NULL CHECK (node_type IN ('structure', 'activity')),

    label           text        NOT NULL,

    -- Structure only.
    structure_kind  text        CHECK (structure_kind IS NULL OR structure_kind IN
                                ('institution', 'organisation', 'programme', 'role', 'engagement', 'team', 'period')),
    -- Dates are text, verbatim from the source. A date type would force a precision the source
    -- does not have, and the pressure would be to invent the missing part (ADR 0009).
    started_at      text,
    ended_at        text,

    -- Activity only: aᵢ = (Contribution, Capability, Consequence), independently nullable.
    contribution    text,
    capability      jsonb,
    consequence     text,

    epistemic_status text       NOT NULL CHECK (epistemic_status IN ('observed', 'inferred', 'hypothesized')),
    -- Per-node optimistic concurrency, so two corrections to different facts do not conflict.
    revision        integer     NOT NULL DEFAULT 1,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    -- Structure carries no activity components, and vice versa.
    CONSTRAINT identity_node_shape CHECK (
        (node_type = 'structure'
             AND structure_kind IS NOT NULL
             AND contribution IS NULL AND capability IS NULL AND consequence IS NULL)
        OR
        (node_type = 'activity'
             AND structure_kind IS NULL AND started_at IS NULL AND ended_at IS NULL
             -- Sparse is valid; empty is not. Any subset of the three, but never none of them:
             -- an activity asserting nothing about the person is not a fact, it is padding.
             AND (contribution IS NOT NULL OR capability IS NOT NULL OR consequence IS NOT NULL))
    )
);

CREATE INDEX identity_node_person_idx ON identity_explicit_node (person_id, node_type);

-- Canonical Relations. The vocabulary stays small and closed here as well as in code (ADR 0009):
-- adding a kind is a decision, not a convenience. There is deliberately no `related_to`.
--
-- ON DELETE CASCADE: removing a node removes the edges that pointed at it, because an edge to a
-- node that no longer exists is a claim about a connection that no longer exists.
CREATE TABLE identity_relation (
    id               text        PRIMARY KEY,
    person_id        text        NOT NULL REFERENCES identity_person (id),
    kind             text        NOT NULL CHECK (kind IN ('occurred_within', 'associated_with', 'uses_capability')),
    from_node_id     text        NOT NULL REFERENCES identity_explicit_node (id) ON DELETE CASCADE,
    to_node_id       text        NOT NULL REFERENCES identity_explicit_node (id) ON DELETE CASCADE,
    epistemic_status text        NOT NULL CHECK (epistemic_status IN ('observed', 'inferred', 'hypothesized')),
    revision         integer     NOT NULL DEFAULT 1,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT identity_relation_not_self CHECK (from_node_id <> to_node_id),
    CONSTRAINT identity_relation_unique UNIQUE (from_node_id, to_node_id, kind)
);

CREATE INDEX identity_relation_person_idx ON identity_relation (person_id);

-- Atomic provenance: where each confirmed fact came from.
--
-- Owned by Identity, and distinct from Memory's EvidenceItems: this answers "where did this fact
-- come from", not "what evidence backs this claim in a representation" (plan 003).
--
-- A node may accumulate several rows — that is how Release 3 enrichment adds a second source to an
-- existing fact rather than creating a near-duplicate of it.
CREATE TABLE identity_provenance (
    id             text        PRIMARY KEY,
    person_id      text        NOT NULL REFERENCES identity_person (id),
    subject_type   text        NOT NULL CHECK (subject_type IN ('node', 'relation')),
    subject_id     text        NOT NULL,

    -- How this fact came to be true. User-authored facts have no source and no quote, and saying
    -- so explicitly is what stops them being mistaken for something a document supports.
    origin         text        NOT NULL CHECK (origin IN ('reconstruction', 'user_supplement', 'user_correction')),

    source_id      text        REFERENCES identity_professional_source (id),
    proposal_id    text        REFERENCES identity_reconstruction_proposal (id),
    -- The id of the proposed item this came from, so a confirmed fact can be traced back to
    -- exactly what the model proposed and what the user did to it.
    proposal_item_id text,
    -- Verbatim from the source. Provenance you cannot check is not provenance.
    quote          text,
    start_offset   integer,
    end_offset     integer,

    recorded_at    timestamptz NOT NULL DEFAULT now(),
    recorded_by    text        NOT NULL,

    -- Reconstruction-derived provenance must cite a source; user-authored must not pretend to.
    CONSTRAINT identity_provenance_origin CHECK (
        (origin = 'reconstruction' AND source_id IS NOT NULL AND quote IS NOT NULL)
        OR (origin IN ('user_supplement', 'user_correction') AND quote IS NULL)
    )
);

CREATE INDEX identity_provenance_subject_idx ON identity_provenance (subject_type, subject_id);
CREATE INDEX identity_provenance_source_idx ON identity_provenance (source_id);

-- Review history: the act of confirming one proposal.
CREATE TABLE identity_review (
    id           text        PRIMARY KEY,
    person_id    text        NOT NULL REFERENCES identity_person (id),
    proposal_id  text        NOT NULL REFERENCES identity_reconstruction_proposal (id),
    -- The identity revision this confirmation produced.
    revision     integer     NOT NULL,
    confirmed_at timestamptz NOT NULL DEFAULT now(),
    confirmed_by text        NOT NULL
);

-- One confirmation per proposal. Re-confirming is not an idempotent no-op, it is a second
-- application of the same proposed facts, which would duplicate the person's history.
CREATE UNIQUE INDEX identity_review_proposal_idx ON identity_review (proposal_id);

-- Per-item decision history: what was proposed, what the user did to it, and what it became.
--
-- This is what makes the confirmation explainable months later — "why is this in my identity, and
-- did I change it?" — and what proves the retained set was reviewed rather than bulk-accepted.
CREATE TABLE identity_review_decision (
    id               text        PRIMARY KEY,
    review_id        text        NOT NULL REFERENCES identity_review (id),
    -- NULL for a supplement: the user added a fact the proposal never contained.
    proposal_item_id text,
    decision         text        NOT NULL CHECK (decision IN ('retain', 'edit', 'exclude', 'reject', 'supplement')),
    -- What the model proposed, frozen. The proposal row also holds it, but freezing it here keeps
    -- the decision readable on its own and survives any later reinterpretation of the proposal.
    proposed         jsonb,
    -- What the user changed it to, for 'edit' and 'supplement'.
    edited           jsonb,
    -- The canonical node or relation this became, when it was applied.
    applied_type     text        CHECK (applied_type IS NULL OR applied_type IN ('node', 'relation')),
    applied_id       text
);

CREATE INDEX identity_review_decision_review_idx ON identity_review_decision (review_id);

-- Correction history: direct user changes to canonical Explicit State, without reconstruction.
CREATE TABLE identity_correction (
    id           text        PRIMARY KEY,
    person_id    text        NOT NULL REFERENCES identity_person (id),
    subject_type text        NOT NULL CHECK (subject_type IN ('node', 'relation')),
    subject_id   text        NOT NULL,
    operation    text        NOT NULL CHECK (operation IN ('add', 'update', 'remove')),
    -- Before and after, so a correction can be explained and audited. `before` is NULL on add;
    -- `after` is NULL on remove.
    before       jsonb,
    after        jsonb,
    corrected_at timestamptz NOT NULL DEFAULT now(),
    corrected_by text        NOT NULL
);

CREATE INDEX identity_correction_person_idx ON identity_correction (person_id, corrected_at DESC);
CREATE INDEX identity_correction_subject_idx ON identity_correction (subject_type, subject_id);

-- Proposals gain the reviewed states. R1 could only produce 'proposed'.
ALTER TABLE identity_reconstruction_proposal
    DROP CONSTRAINT identity_reconstruction_proposal_status_check;

ALTER TABLE identity_reconstruction_proposal
    ADD CONSTRAINT identity_reconstruction_proposal_status_check
    CHECK (status IN ('proposed', 'confirmed'));
