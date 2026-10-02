# Plan 017 — Translation semantic ownership

**Status:** Complete — 2026-09-01

## Outcome

ADR 0025 assigns Intelligence opportunity/person understanding and relationship evaluation,
Adaptation opportunity-specific representation decisions, and Execution external-system execution
and mechanical feedback.

The existing condition relationship mapping and its tests moved from Adaptation to Intelligence.
Adaptation now consumes the result through `OpportunityIntelligencePort`; the API composition root
adapts its existing in-memory supplied understanding without changing the compatibility URL or
responses. The route implementation itself moved out of the Adaptation handler. Adaptation also owns
its draft concurrency error rather than importing Identity's.

Opportunity, Application and Portal documentation was narrowed to canonical opportunity records,
application intent/history, and an external-system adapter respectively. Execution remains an empty
seam: no interface, persistence, event or portal behavior was invented.

## Verification

- `pnpm typecheck`
- `DATABASE_URL=postgresql://joby:joby@localhost:5433/joby pnpm test` — 324/324 passed

## Deferred conflicts

- legacy `PUT /adaptation/opportunities/:id` naming;
- cross-module foreign keys from `adaptation_context` to Identity-owned tables;
- the always-false `RepresentationDraft.submitted` compatibility field.
