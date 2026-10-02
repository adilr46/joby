# 012 - Stated Context semantic decision rewrite

## Goal

Resolve exactly the semantic blocker for Adaptation UC03 by rewriting ADR 0011 so Stated Context is
current, persistent, user-authored professional operating context owned canonically by Identity and
read-only to Adaptation, while restoring `E = (Structure, Activity, Relations)` as reconstructed
professional reality.

This is a documentation-only decision pass. It changes no source, schema, DTO, route, persistence
representation or test.

## Domains affected

- **Identity** — canonical owner of Stated Context and Explicit/Learned professional state.
- **Identity / Adaptation** — retrieves relevant current Stated Context through a read-only boundary.
- **Other domains** — may read Stated Context through Identity's public boundary; gain no mutation
  authority.

## Doctrine check

- `E = (Structure, Activity, Relations)` remains reconstructed professional reality.
- `X_t` is distinct from `E`, `L`, `A^c` and Opportunity Context.
- Only explicit user create/change/removal changes `X_t`; absence remains unknown.
- Stated Context changes trigger no reconstruction, professional-state mutation, PCI update or
  automatic Adapted State creation.
- Constraints gain no hard/soft class, strength, priority, weight, inference, rank or gate.
- The decision does not force a new Durable Identity equation or an implementation representation.

## Events

No event decision. Whether and how an implementation announces a Stated Context change is outside
this semantic pass.

## Steps

1. Rewrite ADR 0011 as the accepted governing decision; preserve the historical problem and
   rationale while removing the unresolved ownership/composition.
2. Mark ADR 0017 superseded because it over-specified the placement taxonomy and implementation
   behavior relative to the newly locked decision.
3. Align active product memory, Identity domain semantics, Adaptation UC03 documentation, ADR index
   and forward notes in earlier ADRs.
4. Update current-state and roadmap statements only where they contradict the accepted semantics.
5. Search active documentation for stale `E = (R, X)` or Stated-Context-as-Explicit-State claims.

## Verification

- Active-documentation search finds no operative claim that Stated Context is part of Explicit
  State. Remaining `E = (R, X)` occurrences are explicitly labelled historical or superseded.
- Active documentation consistently states `E = (Structure, Activity, Relations)`.
- ADR 0011 and the Adaptation doctrine express UC03 as
  `C_user = RetrieveRelevant(X_t)` through Identity, read-only.
- Schema, DTO, endpoints, persistence representation, complete taxonomy, history/versioning,
  overrides, learning, UI and event semantics remain explicitly open.
- All edits made by this pass are Markdown documentation; no source, schema or test change was made.

## Out of scope

Code, database schema, DTOs, endpoints, persistence representation, a complete taxonomy,
history/versioning, opportunity-specific overrides, learning from Stated Context, UI, and a new
mathematical definition of Durable Identity.
