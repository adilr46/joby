# Plan 019 — Career Memory alignment with Translation

**Status:** completed, 2026-09-01
**ADR:** [0027](../../architecture/adr/0027-resolved-application-history-as-career-memory-input.md)

## Outcome

Align the future slow-learning architecture to:

```text
Translation (Intelligence + Adaptation + Execution)
  → resolved Application history
  → Career Memory
  → justified PCI output
  → future Intelligence and Adaptation priors
```

Application preserves the meaningful Translation state actually used. Career Memory consumes that
resolved history later and cannot rewrite any upstream state. Durable Identity remains the owner of
held PCI state and Identity Representation remains the owner of lenses.

## Work

1. Record the ownership and data-flow refinement in ADR 0027.
2. Update active Application, Career Memory, Translation and Identity documentation.
3. Preserve existing event, persistence and public code surfaces unchanged.
4. Run typecheck and all tests against PostgreSQL.

## Non-goals

- No learning, attribution, scoring or aggregation algorithm.
- No DTO, event, table, worker, handler or repository.
- No automatic PCI, Durable Identity or Identity Representation write.


## Result

Done, documentation and architecture only. No source, schema, DTO, event, route, worker or test
changed; `pnpm typecheck` is clean and **329/329 tests pass against PostgreSQL** — unchanged, which
is what "preserve existing surfaces" means here.

| Step | Outcome |
|---|---|
| 1. Record in ADR 0027 | Accepted. Added to the ADR index with rows and prose for 0025–0027 |
| 2. Update active documentation | Root `CLAUDE.md`, `JOBY_MEMORY.md` §5.3 and §12, Translation `README`/`CLAUDE.md`, Durable Identity `README`; Application and Career Memory READMEs already carried it |
| 3. Preserve existing surfaces | Nothing in `packages/*/src` or `apps/*` touched |
| 4. Verify | Typecheck clean, 329/329 against PostgreSQL |

Two index defects were fixed while here: ADRs 0025–0027 had no table rows, and the 0025/0026 prose
had been left inside the "When to write one" section. ADR 0024's prose still described the
Intelligence and Execution ownership questions as open; ADR 0025 closed them, and it now says so.

## Unresolved, carried forward

- The resolved-history shape, snapshot and version references — awaits the first Application slice.
- The rule classifying final Execution information as meaningful history rather than mechanical
  noise — awaits a concrete portal/application use case.
- Which reviewed stage insights, if any, accompany a resolved Application Record into Memory
  (ADR 0013 §10, deliberately deferred).
- Durable Identity's governed capability for accepting or rejecting a justified PCI proposal.
