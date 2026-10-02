-- Written representation (UC10, UC11): references, elicited input, drafts.
-- Owning domains: identity (references), identity/adaptation (the rest). ADRs 0021, 0022.

-- Persistent, user-owned **expression** material: writing samples, previous cover letters,
-- previous application answers (ADR 0021).
--
-- Its own table, not `identity_professional_source`, and that is the point. Source capture schedules
-- reconstruction in the same transaction; a reference must never be reconstructed from, because a
-- previous cover letter is full of claims written for a different audience — possibly overstated,
-- possibly no longer true. Sharing the sources table would make "do not reconstruct this one" a
-- conditional in a critical path. Here it is a property of the schema: no job table references this,
-- so there is no path from a reference into Explicit State at all.
--
--   answers: how does this person write?     not: what has this person done?
CREATE TABLE identity_representation_reference (
    id           text        PRIMARY KEY,
    person_id    text        NOT NULL REFERENCES identity_person (id),

    kind         text        NOT NULL CHECK (kind IN (
                                'writing_sample',
                                'cover_letter',
                                'application_answer')),
    -- The person's own name for it, so they can tell two apart when choosing.
    label        text        NOT NULL,
    -- The material itself, immutably. There is deliberately no update path: a reference is a
    -- record of how they wrote once, and editing it would make it something else.
    content      text        NOT NULL,
    checksum     text        NOT NULL,

    captured_at  timestamptz NOT NULL DEFAULT now(),
    provided_by  text        NOT NULL,

    CONSTRAINT identity_representation_reference_content CHECK (btrim(content) <> ''),
    -- The same material twice is one reference, not two votes on how they write.
    CONSTRAINT identity_representation_reference_unique UNIQUE (person_id, checksum)
);

CREATE INDEX identity_representation_reference_person_idx
    ON identity_representation_reference (person_id, captured_at DESC);

-- What the person told Joby for **this opportunity**, because Joby could not safely infer it.
--
-- Keyed by the adaptation context rather than by surface, so an answer and a cover letter for the
-- same opportunity share it (acceptance 12): asking someone twice why they want the same job is a
-- product failure, and two generators inventing separate motivations is worse.
--
-- **This is meaning, not professional fact.** The kinds below are intent, motivation, disclosure and
-- context — things only the person can supply. A new professional claim does not belong here: it goes
-- through Identity, confirmed, or it does not get used (ADR 0022).
--
-- Operational and context-scoped. It never becomes Explicit State or PCI on its own.
CREATE TABLE adaptation_application_input (
    id           text        PRIMARY KEY,
    context_id   text        NOT NULL REFERENCES adaptation_context (id) ON DELETE CASCADE,

    kind         text        NOT NULL CHECK (kind IN ('motivation', 'timing', 'disclosure', 'context')),
    -- The question Joby asked, kept so the answer can be read back with what it answered.
    prompt       text        NOT NULL,
    answer       text        NOT NULL,

    provided_at  timestamptz NOT NULL DEFAULT now(),
    provided_by  text        NOT NULL,

    CONSTRAINT adaptation_application_input_answer CHECK (btrim(answer) <> ''),
    -- One current answer per kind per opportunity. Re-answering replaces; it does not accumulate
    -- contradictory statements of the same intent.
    CONSTRAINT adaptation_application_input_unique UNIQUE (context_id, kind)
);

CREATE INDEX adaptation_application_input_context_idx ON adaptation_application_input (context_id);

-- A generated draft, and the user's edits to it.
--
-- **A draft is not a submission.** Nothing here is an Application Record: `submitted_at` does not
-- exist, and no column can express that this went anywhere. Execution freezes what actually entered
-- the world, on submission, in its own record (ADRs 0013, 0022).
--
-- Temporary Adaptation-owned working state. Persisted because a user edit cannot be recomputed from
-- the inputs — which is exactly the trigger ADR 0019 named for making Adapted State durable.
CREATE TABLE adaptation_representation_draft (
    id            text        PRIMARY KEY,
    context_id    text        NOT NULL REFERENCES adaptation_context (id) ON DELETE CASCADE,

    surface       text        NOT NULL CHECK (surface IN ('application_answer', 'cover_letter')),
    -- The application question, for an answer. Absent for a cover letter.
    question      text,
    -- Word/character limits and format, as the posting stated them.
    constraints   jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- The generated content, as segments carrying what each is grounded in. Structured rather than
    -- prose so grounding survives storage and can be checked, shown and re-checked after an edit.
    content       jsonb       NOT NULL,
    -- What produced it: the writer's name and model, for provenance and reproducibility.
    writer        text        NOT NULL,
    model         text        NOT NULL,

    -- The user's edit, when they have made one. The generated content above is kept beside it, so
    -- "what Joby wrote" and "what the person decided" never collapse into each other.
    edited_content jsonb,
    edited_at      timestamptz,
    edited_by      text,

    generated_at  timestamptz NOT NULL DEFAULT now(),
    generated_by  text        NOT NULL,
    -- Guards concurrent edits, the same optimistic-concurrency shape used everywhere else.
    revision      integer     NOT NULL DEFAULT 1
);

-- One current draft per surface per question per opportunity. Regenerating replaces it: a draft is
-- working state, and keeping every attempt would make the useful one unfindable.
--
-- Two partial indexes rather than one constraint, because a cover letter has no question and SQL
-- treats NULLs as distinct — a plain UNIQUE would let a person accumulate unlimited cover letters
-- for one opportunity and never notice.
CREATE UNIQUE INDEX adaptation_representation_draft_question_idx
    ON adaptation_representation_draft (context_id, surface, question)
    WHERE question IS NOT NULL;

CREATE UNIQUE INDEX adaptation_representation_draft_surface_idx
    ON adaptation_representation_draft (context_id, surface)
    WHERE question IS NULL;

CREATE INDEX adaptation_representation_draft_context_idx
    ON adaptation_representation_draft (context_id, generated_at DESC);
