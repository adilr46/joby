-- Owner: Social. No company, role, stage, progression or outcome is stored here.
-- Cross-module references are identifiers, never foreign keys into Application or Identity.
CREATE TABLE social_membership (
    person_id text NOT NULL,
    cohort_id text NOT NULL,
    cohort jsonb NOT NULL,
    PRIMARY KEY (person_id, cohort_id)
);
CREATE INDEX social_membership_cohort_idx ON social_membership (cohort_id);

-- Absence means private. Only an explicit owner share creates this permission.
CREATE TABLE social_share (
    signal_id text NOT NULL,
    cohort_id text NOT NULL,
    application_id text NOT NULL,
    person_id text NOT NULL,
    PRIMARY KEY (signal_id, cohort_id),
    FOREIGN KEY (person_id, cohort_id) REFERENCES social_membership (person_id, cohort_id) ON DELETE CASCADE
);
CREATE INDEX social_share_cohort_idx ON social_share (cohort_id);

CREATE TABLE social_interaction (
    id text PRIMARY KEY,
    signal_id text NOT NULL,
    cohort_id text NOT NULL,
    person_id text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('question', 'oa_tip', 'interview_tip', 'collaborate', 'connect', 'reply')),
    body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
    parent_id text REFERENCES social_interaction (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (signal_id, cohort_id) REFERENCES social_share (signal_id, cohort_id) ON DELETE CASCADE
);
CREATE INDEX social_interaction_signal_idx ON social_interaction (signal_id, cohort_id, created_at);
