# 009 - Identity Representation, slice 2: generalized positioning

## Goal

Turn a named lens into a **positioning** lens: the person decides how their existing professional
truth is generally organized and represented in one professional domain.

```text
E_t + Decisions_i -> V_i
```

UC05 select/hide · UC06 order/prioritize · UC07 emphasis and reusable positioning themes ·
UC08 grounded context-independent wording.

## Domains affected

- **Identity / Identity Representation** only. Two new tables hanging off the lens, both its own.
- **Adaptation** — its seam gains one binding rule rather than any code: a lens is a prior, and what
  it hides stays available.
- Durable Identity, Discovery, Intelligence, Execution, Memory: untouched.

## Doctrine check

- **Decisions, never facts.** A decision row names a canonical `node_id` (a foreign key) and copies
  no label, contribution, capability, consequence or date. Grounding is schema-enforced, plus an
  ownership check so a lens positions only its own person's Explicit State.
- **Read-time derivation preserved.** Content still comes from R through the same projection; a
  correction appears through every lens on the next read with nothing synchronised.
- **Canonical state untouched.** No R/X/L write, no identity revision move, no correction row, no
  event.
- **A prior, not a boundary** — `HiddenInLens ≠ UnavailableToAdaptation`. The ungoverned projection is
  returned beside the positioned view, and hidden evidence is flagged rather than dropped.
- **Framing presents truth.** `canonicalTitle` travels with every framed entry.
- **General positioning only.** No opportunity, JD, employer or company anywhere in the model.
- **No inference.** Positioning is what the user decided. Learning from history needs the Slower
  Learning Loop, which does not exist.

## Events

None. Deciding how to present a fact is not a change to the fact.

## Steps

1. ADR 0015; ADR 0014 marked *extended* with a forward note.
2. Migration `0007` — `identity_representation_decision` and `identity_representation_theme`.
   `identity_representation` gains **no** columns, so its slice-1 pin still holds.
3. `positioning.ts` — a pure `E + Decisions → V` function, unit-testable without a database.
4. Repository and service: upsert decisions, replace themes, lens-revision concurrency.
5. `ConcurrencyError` extracted to `concurrency.ts` and re-exported from `review.ts`, so a
   non-canonical module can use the existing mechanism without importing a write surface.
6. Contract (+2), service, entry point, HTTP routes.
7. Tests: 8 unit, 14 new integration, plus tightened module-boundary assertions.
8. Documentation and consolidation.

## Verification

- `pnpm typecheck` clean; `pnpm test` — 192/192 against real Postgres (was 170).
- Every acceptance criterion has a test that would fail if the property broke, including: two lenses
  positioning one identity differently; changing one lens leaving the other untouched; a canonical
  correction surfacing through a lens with its decision intact; a removed fact taking its decisions
  with it; hidden-but-available proven three ways; stale revisions refused on both write paths.
- Run for real against `apps/api` and `apps/worker`: create → position → theme → read, with 409 on a
  stale revision and 422 on an ungrounded decision, and the hidden degree still present in the
  canonical projection of the same response.

## Out of scope

Skill-level positioning (no single canonical node to key a decision to), rendering, positioning
history, opportunity-specific adaptation, and any inference of positioning from past applications.
