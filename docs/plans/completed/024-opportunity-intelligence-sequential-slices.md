# Plan 024 - Opportunity Intelligence Sequential Slices

**Status:** completed, 2026-09-13. `pnpm typecheck` clean; `pnpm test` passes with
database-backed suites skipped because `DATABASE_URL` is not set.

## Goal

Run the eight Opportunity Intelligence slices after the Router-owned decisioning foundation:

1. Evaluation core.
2. Weight priors and fast preference updates.
3. Calibration seam.
4. Evaluation history.
5. LTR v1.
6. Ranking projections.
7. Bounded exploration.
8. CareerObservation and PCI slow loop.

## Outcome

Router now has the shared evaluation contract, fixed-ideal TOPSIS, deterministic labels, family
weight priors, gradual weight update math, optional append-only evaluation history, a linear LTR v1
model, list/tier/pairwise ranking projections and bounded exploration metadata.

PCI now has a `CareerObservation` primitive, derives preference/accessibility/calibration signals,
and includes an in-memory `SlowLearningPci` implementation that applies small idempotent updates
without rewriting canonical person truth.

## Deliberately Still Thin

- Evaluation history and weight state have in-memory stores only; database-backed persistence remains
  a later repository/migration slice.
- Calibration has a contract and fallback, but no empirical Application-history model yet.
- LTR trains in memory and is not wired into production Router ranking.
- Career observations are not constructed automatically from Application resolution yet.
- Claude-based semantic interpretation of messy feedback is not implemented.

## Verification

- `pnpm typecheck`.
- Focused Router and PCI suites.
- Full `pnpm test`.
