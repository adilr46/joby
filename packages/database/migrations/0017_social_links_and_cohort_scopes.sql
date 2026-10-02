-- Social owns audience grants and links, never Application progress.
-- Keep legacy authored interactions intact, but retire their API. They are not implicit links.
ALTER TABLE social_share ADD COLUMN source_cohort_id text;
UPDATE social_share SET source_cohort_id = cohort_id;
ALTER TABLE social_share ALTER COLUMN source_cohort_id SET NOT NULL;
ALTER TABLE social_share DROP CONSTRAINT social_share_person_id_cohort_id_fkey;
ALTER TABLE social_share ADD CONSTRAINT social_share_source_membership_fkey
    FOREIGN KEY (person_id, source_cohort_id)
    REFERENCES social_membership (person_id, cohort_id) ON DELETE CASCADE;

CREATE TABLE social_link (
    person_id text NOT NULL,
    target_person_id text NOT NULL,
    signal_id text NOT NULL,
    cohort_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (person_id, signal_id),
    CHECK (person_id <> target_person_id),
    FOREIGN KEY (signal_id, cohort_id) REFERENCES social_share (signal_id, cohort_id) ON DELETE CASCADE
);
CREATE INDEX social_link_target_idx ON social_link (target_person_id, person_id);
