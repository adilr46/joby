# Plan 021 — Canonical architecture migration

**Status:** Completed 2026-09-01

## Outcome

Established one authoritative architecture across repository memory:

```text
CAREER WORKSPACE → TRANSLATION LAYER → APPLICATION → CAREER MEMORY
```

with semantic authorities Durable Identity + Identity Representation; Opportunity + Adaptation +
Execution; Application; and Memory / PCI respectively.

## Completed work

1. Created ADR 0029 and explicitly superseded incompatible topology/ownership decisions.
2. Updated root and module guidance, product memory, architecture indexes and current state.
3. Reconciled active plan 020 and implementation documentation without rewriting historical plans.
4. Classified code/package mismatches without refactoring layout to mirror the conceptual model.
5. Searched for current contradictions and corrected architectural code comments.

## Verification

- `pnpm typecheck` — clean.
- Full PostgreSQL-backed suite — 23 files, 369/369 tests passed.
- No implemented cross-owner mutation path found.

## Deferred by design

- No package move or deployment split.
- No learning, Application or Execution behavior.
- No event, table, DTO or public runtime contract change.
