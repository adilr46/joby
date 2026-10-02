# Plan 018 — Translation fast-feedback seams

**Status:** Complete — 2026-09-01

## Outcome

Established three type-only information seams:

```text
Opportunity Intelligence: Intelligence → Adaptation
Application Intent:        Adaptation → Execution
Fast Feedback:             Execution → Intelligence and/or Adaptation
```

Each producer publishes information and each consumer declares its local required view. Structural
compatibility is proven outside the modules, so no sibling imports another. Contracts contain only
readonly information and grant no cross-module mutation authority.

Execution's public feedback shape carries only semantic external observation and routing references.
Purely mechanical feedback has no public vocabulary and remains Execution-private.

## Deliberately absent

- Runtime routing or handlers
- Mutation methods
- Events or event taxonomy
- Persistence or DTO versioning
- Feedback classification or refinement algorithms

## Verification

- `pnpm typecheck`
- `DATABASE_URL=postgresql://joby:joby@localhost:5433/joby pnpm test` — 329/329 passed
