-- PCI: Beta-Bernoulli shared and personal cells (ADR 0041).
-- Owning module: pci.
--
-- Two separate tables enforce the privacy boundary at the schema level rather than by convention:
-- the shared layer has no person_id column, making it structurally impossible to accidentally join
-- it against the personal layer on person identity.
--
-- The blend formula is:
--   α_personal_blend = α_shared + pci_personal_cell.alpha
--   β_personal_blend = β_shared + pci_personal_cell.beta
--   E[θ] = α_personal_blend / (α_personal_blend + β_personal_blend)
--
-- Two signal families (world_response, user_response) live in separate cells. The cell_key encodes
-- the family, so they can never silently merge. See ADR 0041 for the full key format.

-- Shared layer: population-level Beta parameters, one row per (signal_family, track, role_domain).
--
-- alpha and beta start at 1 (Laplace smoothing): an empty cell returns E[θ] = 0.5, a genuine
-- uniform prior, rather than the undefined 0/0 form.
CREATE TABLE pci_shared_cell (
    cell_key         text        PRIMARY KEY,
    alpha            integer     NOT NULL DEFAULT 1 CHECK (alpha >= 1),
    beta             integer     NOT NULL DEFAULT 1 CHECK (beta  >= 1),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Personal layer: per-person counts on top of the shared prior.
--
-- alpha and beta start at 0 — these are additive increments, not a standalone prior. The blend
-- adds them to the shared cell's counts at read time.
CREATE TABLE pci_personal_cell (
    person_id        text        NOT NULL,
    cell_key         text        NOT NULL,
    alpha            integer     NOT NULL DEFAULT 0 CHECK (alpha >= 0),
    beta             integer     NOT NULL DEFAULT 0 CHECK (beta  >= 0),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (person_id, cell_key)
);

CREATE INDEX pci_personal_cell_person_idx ON pci_personal_cell (person_id);
