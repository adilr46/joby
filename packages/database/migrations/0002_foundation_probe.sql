-- TEMPORARY — plan 001 only.
--
-- The Foundation slice has to prove that a domain write and its outbox row commit together,
-- and that a worker then processes exactly that event. Proving it needs *some* domain row, and
-- Foundation deliberately owns no domain concept: inventing an Identity table here would be
-- Release 1 leaking into the plumbing.
--
-- Release 1 replaces this with the real professional-source capture and drops this table in
-- the same migration. If this table still exists after R1 ships, that is a bug in R1.

CREATE TABLE foundation_probe (
    id         text        PRIMARY KEY,
    note       text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
