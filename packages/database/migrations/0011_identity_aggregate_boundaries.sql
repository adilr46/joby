-- Aggregate-boundary hardening for the three implemented Identity modules.
--
-- Cross-aggregate identifiers remain stable IDs, but referential actions may not execute another
-- aggregate's lifecycle on its behalf. Owner-controlled event handlers perform reconciliation.

-- Durable Identity removing a canonical fact must not directly delete Representation-owned state.
ALTER TABLE identity_representation_decision
    DROP CONSTRAINT identity_representation_decision_node_id_fkey;

-- Representation deletion must not silently rewrite an Adaptation Context. There is no
-- Representation delete use case yet; RESTRICT preserves integrity until its owner coordinates it.
ALTER TABLE adaptation_context
    DROP CONSTRAINT adaptation_context_representation_id_fkey;
ALTER TABLE adaptation_context
    ADD CONSTRAINT adaptation_context_representation_id_fkey
    FOREIGN KEY (representation_id) REFERENCES identity_representation (id) ON DELETE RESTRICT;

-- Application inputs and drafts are independently revised Adaptation state. A future context
-- deletion must be coordinated by Adaptation instead of silently cascading through both roots.
ALTER TABLE adaptation_application_input
    DROP CONSTRAINT adaptation_application_input_context_id_fkey;
ALTER TABLE adaptation_application_input
    ADD CONSTRAINT adaptation_application_input_context_id_fkey
    FOREIGN KEY (context_id) REFERENCES adaptation_context (id) ON DELETE RESTRICT;

ALTER TABLE adaptation_representation_draft
    DROP CONSTRAINT adaptation_representation_draft_context_id_fkey;
ALTER TABLE adaptation_representation_draft
    ADD CONSTRAINT adaptation_representation_draft_context_id_fkey
    FOREIGN KEY (context_id) REFERENCES adaptation_context (id) ON DELETE RESTRICT;

-- Stated Context owns a revision distinct from the canonical professional graph. The existing
-- identity revision remains as the compatibility version for ExplicitState in this slice.
ALTER TABLE identity_stated_context
    ADD COLUMN revision integer NOT NULL DEFAULT 0;
