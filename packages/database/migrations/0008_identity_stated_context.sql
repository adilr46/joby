-- Identity: Stated Context (X) — the half of Explicit State only the user writes.
-- Owning domain: identity (ADR 0003, ADR 0011, ADR 0017).
--
--   X = (CareerDirection, Preferences, Constraints)
--
-- Present in the read model and empty since Release 2, because no use case captured it (plan `000`
-- §3.6). This is that use case. Nothing here is ever written by reconstruction, extraction or any
-- other AI path: **only the user writes X** (ADR 0011 invariant 4).
--
-- Career direction and preferences stay deliberately opaque — free text, in the person's words —
-- for the reason ADR 0011 gives: a schema written first limits what someone may say about their own
-- life to what was imagined in advance.

CREATE TABLE identity_stated_context (
    person_id        text        PRIMARY KEY REFERENCES identity_person (id),

    -- Where they currently believe they are going. Explicit input, never an inferred trait
    -- (ADR 0008). Nothing may derive this from what they have done.
    career_direction text,
    -- Free text, ordered as the person gave them.
    preferences      jsonb       NOT NULL DEFAULT '[]'::jsonb,
    -- **Free-text constraints remain**, alongside the typed conditions below. The taxonomy covers
    -- what has to be machine-compared; everything else a person needs to say about their situation
    -- still has somewhere to go, unflattened.
    constraints      jsonb       NOT NULL DEFAULT '[]'::jsonb,

    stated_at        timestamptz NOT NULL DEFAULT now(),
    stated_by        text        NOT NULL
);

-- Typed user conditions: the small part of Constraints that must be comparable against an
-- opportunity's stated conditions (ADR 0017).
--
-- The vocabulary is **closed and small**, for the same reason the relation vocabulary is (ADR 0009):
-- a condition kind that means nothing in particular cannot be compared or explained. It is drawn
-- from the placement wedge and grows only when a real comparison needs it.
--
-- Values are held as the person wrote them — 'Bristol', 'Bath', '12 months', 'September 2026'. A
-- normalised comparison happens at read time in Adaptation; nothing here reshapes what they said,
-- and nothing infers a condition they did not state.
CREATE TABLE identity_user_condition (
    id         text        PRIMARY KEY,
    person_id  text        NOT NULL REFERENCES identity_person (id),

    kind       text        NOT NULL CHECK (kind IN (
                              'location',
                              'duration',
                              'work_arrangement',
                              'start_date',
                              'work_authorisation',
                              'sponsorship',
                              'availability')),

    -- One or more acceptable values. A person who will work in Bristol *or* Bath has one location
    -- condition with two values, not two conditions that contradict each other.
    values     jsonb       NOT NULL,
    -- Anything the kinds above cannot carry, in their own words.
    note       text,

    stated_at  timestamptz NOT NULL DEFAULT now(),
    stated_by  text        NOT NULL,

    -- One statement per kind. Two would be two answers to the same question about their life.
    CONSTRAINT identity_user_condition_unique UNIQUE (person_id, kind),
    -- A condition asserting nothing is not a condition; to remove one, delete it.
    CONSTRAINT identity_user_condition_values CHECK (jsonb_array_length(values) > 0)
);

CREATE INDEX identity_user_condition_person_idx ON identity_user_condition (person_id);
