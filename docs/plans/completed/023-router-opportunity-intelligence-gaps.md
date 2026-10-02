# Plan 023 - Router Opportunity Intelligence Gap Fill

**Status:** completed, 2026-09-12. `pnpm typecheck` clean; `pnpm test` passes with
database-backed suites skipped because `DATABASE_URL` is not set.

## Goal

Fill the gaps left by Plan 022 by aligning Router-owned opportunity decisioning with the Opportunity
Intelligence doctrine:

- dimension evaluators return value, confidence and reasons;
- evaluation separates `rawScore` from calibrated `score`;
- calibration diagnostics are represented, with `insufficient` falling back to raw score;
- evaluation labels collapse to `strong | consider | weak`;
- ranking exposes listwise, tiered and pairwise projections from one model output;
- bounded exploration is represented as a deterministic seam with fixed v1 defaults;
- outcome learning remains a rich-observation seam rather than a pairwise-only dataset.

## Domains Affected

Router owns the implementation. Application and PCI remain read through contracts only.

## Doctrine Check

- Opportunity Understanding remains person-neutral.
- Router writes no Identity, Opportunity, Application or PCI truth.
- Calibration reads resolved Application history only.
- In-flight applications are not success or failure.
- User preference, world response and calibration remain distinct.
- Exploration is bounded, symmetric and only applies when uncertainty is meaningful.

## Events

No events.

## Steps

1. Update Router evaluation contracts to include `rawScore`, `score`, three-label evaluation and
   calibration diagnostics while keeping `evaluationScore` as a compatibility alias.
2. Change TOPSIS to support the doctrine's fixed ideal `[1..1]` and anti-ideal `[0..0]` for
   weighted utilities.
3. Add calibration interfaces and a no-history implementation returning `insufficient`.
4. Add dimension evaluator results with reasons.
5. Add listwise, tiered and pairwise ranking projections.
6. Add bounded exploration metadata and fixed deterministic v1 behavior.
7. Add outcome observation types for future learning without persisting them yet.
8. Update API/docs/tests.

## Verification

- Typecheck.
- Router tests for raw/calibrated score fallback, three labels, fixed-ideal TOPSIS, separate
  calibration diagnostic, tier projections, pairwise projection and bounded exploration.
- Full test suite.

## Out of Scope

- Real calibration model from database-backed Application history.
- Real LTR.
- Contextual bandit.
- Persisted decision-time observations.
- UI.
