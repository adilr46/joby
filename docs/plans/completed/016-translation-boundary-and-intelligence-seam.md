# Plan 016 — The Translation boundary and the Intelligence seam

**Status:** completed, 2026-09-01
**ADR:** [0024](../../architecture/adr/0024-translation-as-an-enclosing-module-boundary.md)
**Scope:** structural only. No product logic, no scoring, no evaluation, no persistence, no events,
no network calls, no new Intelligence behaviour.

## Outcome

Translation is an enclosing architectural boundary containing three strongly owned modules.

```text
TRANSLATION  (packages/translation — owns nothing itself)
├── Intelligence   seam, zero exports
├── Adaptation     moved verbatim from packages/identity/src/adaptation
└── Execution      seam, zero exports
```

## What was done

1. **Created `@joby/translation`** with one directory and one declared entry point per module, and
   **no root export** — the boundary must not become a facade over its own modules.
2. **Moved Adaptation verbatim.** All 19 files, unchanged in behaviour. Its three tables, ports,
   doctrine and README travel with it.
3. **Turned two relative reaches into public-entry imports.** `adaptation.test.ts` and
   `interpretation.test.ts` imported `../model` and `../representation/model`; they now import
   `@joby/identity` and `@joby/identity/representation`. Those three types were already publicly
   exported, so this is a strengthening with no type change.
4. **Moved `FakeOpportunityUnderstandingPort`** to `@joby/translation/testing`. It proves
   Adaptation's own seam.
5. **Created the Intelligence and Execution seams** — entry point, README, registered resolution,
   enforced import rules, zero exports.
6. **Deleted `packages/intelligence` and `packages/execution`**, README-only placeholders whose
   whole content was a negative claim about a layout that no longer exists.
7. **Rewired every consumer** — `apps/api` (3 files), `live-check.ts`, 4 test files, `tsconfig.json`,
   `vitest.config.ts`, both package manifests.
8. **Moved and strengthened the boundary tests**, plus a new `tests/translation-boundary.test.ts`.

## Boundary enforcement, before and after

| Rule | Before | After |
|---|---|---|
| Adaptation cannot reach Durable Identity internals | deny-list of 13 filenames, maintained by hand | allow-list of 2 public entry points; a relative reach is not spellable across a package |
| Adaptation cannot import adjacent modules | deny-list of package names | same list, plus both Translation siblings |
| Intelligence/Execution have no behaviour | nothing enforced it | export surface pinned at `[]` |
| Translation is not a facade | n/a | exports map asserted to contain no `.` |
| Identity does not depend on Translation | implicit | asserted over every file in `packages/identity/src` |

## Verification

`pnpm typecheck` clean. **324/324 tests pass against real PostgreSQL** — every previously passing
test, plus the 8 new Translation boundary assertions. No test was weakened or deleted to make the
move pass; the one pinned assertion that changed (`packages/identity`'s exports map, which no longer
publishes `./adaptation`) changed because the fact it pins changed.

## Left open, deliberately

Both are recorded in ADR 0024, in `packages/translation/CLAUDE.md`, and in each seam's README.

- **Intelligence vs Opportunity.** ADRs 0007 and 0023 give opportunity/company/role understanding
  and Opportunity Evaluation to Opportunity. What Intelligence owns is undecided and must be an ADR,
  not a commit.
- **Execution vs Application and Portal.** ADR 0023's division stands. A named seam transfers
  nothing.

Naming a module is not giving it responsibilities. Translation currently has three modules, one of
which does something — and that is the accurate description until an ADR says otherwise.
