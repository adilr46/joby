-- Identity: Identity Representation — persistent, reusable, non-canonical projections.
-- Owning domain: identity (ADR 0003, ADR 0014).
--
--   V_i = P_i(E_t)
--
-- A named lens a person keeps and returns to: "Markets", "Investment Banking", "Software
-- Engineering". Distinct from Adaptation's A^C = T(E_t, L_t, C), which is temporary and tied to one
-- opportunity.
--
-- **This table stores a lens, never a fact.** There is no content, snapshot, node-list, section or
-- summary column, and there must never be one: the representation's content is derived from
-- Reconstructed State at read time, exactly as the Permanent Identity View is (ADR 0009). A column
-- holding derived facts here would be a second, staler copy of the person's history wearing a
-- performance optimisation's clothes — which is the failure Durable Identity exists to prevent.
--
-- There is also no opportunity_id, job_description or requirements column, and there must never be
-- one. A representation tied to one opportunity is Adapted State, and Adapted State belongs to
-- Adaptation, temporarily (ADR 0012, ADR 0013).
--
-- Later slices add persistent *user decisions* over this lens — selection/hiding, ordering and
-- emphasis, wording. Those arrive as their own rows keyed by canonical node id, so a decision can
-- always be read as "what the user chose about this fact", never as the fact itself.
CREATE TABLE identity_representation (
    id          text        PRIMARY KEY,
    person_id   text        NOT NULL REFERENCES identity_person (id),

    -- What the person calls it. Theirs, not a taxonomy Joby imposes.
    name        text        NOT NULL,
    -- The lens, in the person's own words. Deliberately opaque free text, for the same reason
    -- Stated Context is not decomposed (ADR 0011): a schema written first limits what someone may
    -- say about their own professional intent to what was imagined in advance.
    purpose     text,

    -- Optimistic concurrency for the decisions later slices will hang off this row.
    revision    integer     NOT NULL DEFAULT 1,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    created_by  text        NOT NULL,

    CONSTRAINT identity_representation_name_present CHECK (btrim(name) <> '')
);

-- One "Markets" per person. A second representation with the same name is not a new lens, it is a
-- duplicate the person will have to tell apart later with no way to.
CREATE UNIQUE INDEX identity_representation_person_name_idx
    ON identity_representation (person_id, lower(btrim(name)));

CREATE INDEX identity_representation_person_idx ON identity_representation (person_id, created_at);
