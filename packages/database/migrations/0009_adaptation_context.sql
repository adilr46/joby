-- Adaptation: the temporary context for one opportunity (UC01).
-- Owning domain: identity, in its Adaptation module (ADR 0003, ADR 0012, ADR 0018).
--
--   P_i(E_t) + C_opportunity + C_user  ->  Adaptation Context
--
-- **Temporary operational state, not person-state.** Persisting it does not make it Durable
-- Identity: it is context-keyed, replaceable and removable, and nothing here is ever read as a fact
-- about the person (ADR 0012).
--
-- The table holds **references and revisions, never copies**:
--
--   * the opportunity belongs to Discovery, and its understanding to Intelligence;
--   * the identity and the lens belong to Identity;
--   * this row records *which* of each the context was built from.
--
-- So there is no role, company, job description, requirement, condition or capability column, and
-- there must never be one. Adaptation is not a second opportunity store, and it is not a second copy
-- of the person. Everything Module 1 shows is derived at read time from the owners of those things.
--
-- ADR 0013 §10 defers retention, versioning, refresh triggers and reconciliation. **None of that is
-- resolved here**: this is one row per context, created once, with no lifecycle machinery, because
-- this slice does not need any and hardening a deferred decision in passing is how it gets lost.
CREATE TABLE adaptation_context (
    id                   text        PRIMARY KEY,
    person_id            text        NOT NULL REFERENCES identity_person (id),

    -- The lens this adaptation starts from. NULL is normal and supported: `P_i` is optional, and a
    -- person applying outside every lens they keep is not a degraded case (ADR 0016).
    representation_id    text        REFERENCES identity_representation (id) ON DELETE SET NULL,

    -- Discovery's opportunity, by reference. Deliberately not a foreign key: Discovery has no tables
    -- yet, and inventing one here would make Adaptation the owner of the thing it is supposed to
    -- borrow.
    opportunity_id       text        NOT NULL,
    -- The Intelligence understanding revision this context was built from.
    opportunity_revision integer     NOT NULL,
    -- The canonical Explicit State revision this context was built from.
    identity_revision    integer     NOT NULL,

    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           text        NOT NULL,

    -- One context per person per opportunity. A second would be a second answer to "what is this
    -- application's scope?", and the later modules would have no way to choose.
    CONSTRAINT adaptation_context_unique UNIQUE (person_id, opportunity_id)
);

CREATE INDEX adaptation_context_person_idx ON adaptation_context (person_id, created_at);
