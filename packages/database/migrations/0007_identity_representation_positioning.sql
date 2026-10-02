-- Identity Representation: the positioning decision layer.
-- Owning domain: identity (ADR 0014, ADR 0015).
--
--   E_t + Decisions_i -> V_i
--
-- A lens becomes a *positioning* lens here: which canonical evidence it includes, in what order,
-- with what emphasis, and in what context-independent wording. Slice 1 stored the lens; this stores
-- what the person decided **about canonical facts**.
--
-- The rule that makes this safe is the foreign key below. A decision cannot exist without the
-- canonical node it is about, so a representation can never hold a fact — only a choice about one.
-- Nothing here copies a label, a contribution, a date or a consequence out of Explicit State.
--
-- `identity_representation` itself gains no columns. Its pinned column list from slice 1 still
-- holds, which is the cheapest available proof that the lens row never became a profile.

CREATE TABLE identity_representation_decision (
    id                text        PRIMARY KEY,
    representation_id text        NOT NULL REFERENCES identity_representation (id) ON DELETE CASCADE,

    -- The canonical fact this decision is about. ON DELETE CASCADE because a decision about a fact
    -- that no longer exists is meaningless — and leaving it would let a removed fact reappear the
    -- moment an id was reused.
    node_id           text        NOT NULL REFERENCES identity_explicit_node (id) ON DELETE CASCADE,

    -- UC05: include or hide. Hiding is a positioning choice in *this* lens and nothing more: the
    -- fact stays canonical, stays readable through Durable Identity, and stays available to
    -- Adaptation (ADR 0015). This column must never be read as "not true" or "not usable".
    included          boolean     NOT NULL DEFAULT true,

    -- UC06: rank within the lens. Lower is higher priority; NULL is unranked and sorts after
    -- everything ranked. Deliberately sparse — a person ranks the two things that matter, not
    -- every fact they have ever recorded.
    priority          integer     CHECK (priority IS NULL OR priority >= 0),

    -- UC07: per-fact emphasis. NULL is neutral, which is a real answer and the default.
    emphasis          text        CHECK (emphasis IS NULL OR emphasis IN ('emphasised', 'de_emphasised')),

    -- UC08: context-independent wording for this fact in this lens. Presentation, not truth: the
    -- canonical label and provenance travel beside it on every read, so framing can reinterpret how
    -- something is said without changing, replacing or obscuring what is recorded.
    --
    -- General positioning only. Wording aimed at one employer or posting is Adapted State.
    framing           text,

    decided_at        timestamptz NOT NULL DEFAULT now(),
    decided_by        text        NOT NULL,

    -- One decision per fact per lens. Two would be two answers to the same question.
    CONSTRAINT identity_representation_decision_unique UNIQUE (representation_id, node_id)
);

CREATE INDEX identity_representation_decision_rep_idx
    ON identity_representation_decision (representation_id);
CREATE INDEX identity_representation_decision_node_idx
    ON identity_representation_decision (node_id);

-- UC07, at the level of the lens rather than one fact: the reusable positioning themes a
-- representation generally leads with — "quantitative reasoning", "decision-making under
-- uncertainty".
--
-- Its own table rather than a column on the lens, so ordering is explicit and so
-- `identity_representation` stays a row that identifies a lens and nothing else.
--
-- A theme is a *positioning choice*, not a claim: it says what this lens leads with, and never that
-- the person is good at something. Claims still come from canonical facts, with their provenance.
CREATE TABLE identity_representation_theme (
    id                text        PRIMARY KEY,
    representation_id text        NOT NULL REFERENCES identity_representation (id) ON DELETE CASCADE,
    label             text        NOT NULL,
    -- Explicit ordering: a positioning list the person put in an order is not a set.
    position          integer     NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT identity_representation_theme_label_present CHECK (btrim(label) <> ''),
    CONSTRAINT identity_representation_theme_position UNIQUE (representation_id, position)
        DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX identity_representation_theme_rep_idx
    ON identity_representation_theme (representation_id, position);
