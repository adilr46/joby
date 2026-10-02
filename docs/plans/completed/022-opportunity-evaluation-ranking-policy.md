# Plan 022 - Router-Owned Opportunity Evaluation, Ranking and Policy

**Status:** completed, 2026-09-12. `pnpm typecheck` clean; `pnpm test` passes with
database-backed suites skipped because `DATABASE_URL` is not set.

## Goal

Fold Joby's opportunity decision stack into Router as one broader, inspectable decision authority:

```text
Opportunity Understanding
  -> Router
       -> Opportunity Evaluation
       -> Opportunity Ranking / Tiering
       -> Opportunity Policy
```

The smallest vertical outcome is:

> Given a person and a comparison set of understood opportunities, Joby can return derived,
> person-specific opportunity evaluations with dimension breakdowns, weights, confidence,
> evidence references and uncertainty; then order and tier those opportunities without producing a
> policy action inside the evaluation object.

The first implementation is deterministic and derived on read. It creates the seams for LTR and
contextual policy, but does not train a learned model yet.

## Domains Affected

| Authority | Role |
|---|---|
| Opportunity | Owns opportunity evidence and person-neutral understanding only. |
| Identity | Supplies Explicit State, Stated Context and Representation data through public read interfaces only. |
| Router | Owns person x opportunity decision routing: Representation selection, Opportunity Evaluation, Opportunity Ranking, Tiering and Opportunity Policy. |
| Application | Remains the evidence boundary for what was pursued, submitted and resolved. |
| PCI | Supplies priors and later learns from resolved Application evidence; no fast behaviour writes directly to PCI. |

The existing `@joby/router` responsibility expands from "which Representation seeds Adaptation?" to
"which opportunity path should Joby route this person toward now?" Internally, Router should still
keep named sub-capabilities so the implementation remains auditable:

- **Representation Routing**: person + opportunity -> starting Representation prior.
- **Opportunity Evaluation**: person + opportunity + comparison set -> derived evaluation.
- **Opportunity Ranking**: evaluated opportunity set -> personalized ordering.
- **Opportunity Policy**: ranking + current context -> recommended action.

This deliberately accepts Router as a broader decision authority. The boundary remains strong because
Router still writes no Identity, Opportunity, Application or PCI truth.

## Doctrine Check

This plan touches the deferred composite-score decision from ADR 0007. Before code exposes
`evaluationScore`, create a new accepted ADR stating that Joby permits a:

> context-bound, person-specific, derived Opportunity Evaluation score for comparative decision
> support.

The ADR must state:

- `evaluationScore` is not canonical truth about the person.
- `evaluationScore` is not canonical truth about the opportunity.
- It is derived from `(Person, Opportunity, CurrentContext, WeightState, ComparisonSet)`.
- It is inspectable through dimensions, weights, confidence, evidence, uncertainty and version.
- Uncertainty is not silently converted into an opportunity-quality penalty.
- Constraints are advisory and material, not automatic prohibitions.
- Fast behaviour may adjust current ranking/evaluation estimates, but does not directly mutate PCI.

The score is allowed only because it is bounded, derived, auditable and comparison-context-specific.

The ADR must also update ADR 0031's Router section. Router is no longer deliberately small in scope;
it is deliberately read-only and inspectable. Its authority is routing decisions, not mutation.

## Events

No new event contract in the first slice.

Do not publish an event for merely evaluating, ranking or issuing a policy recommendation. Router
decisions are derived work, not meaningful state changes.

Future user actions produced by policy, such as applying or dismissing, should enter Application or a
separate interaction record only when the product decision says they are meaningful history. PCI
continues to learn only from resolved Application evidence.

## Contracts

### Evaluation

Add Router-owned contracts shaped like:

```ts
export type EvaluationBand = 'exceptional' | 'strong' | 'viable' | 'weak' | 'poor';

export interface OpportunityEvaluation {
  readonly personId: string;
  readonly opportunityId: string;
  readonly opportunityRevision: number;
  readonly comparisonSetId: string;
  readonly evaluationScore: number;
  readonly evaluationBand: EvaluationBand;
  readonly dimensions: EvaluationDimensions;
  readonly weightsUsed: EvaluationWeights;
  readonly confidence: number;
  readonly dimensionConfidence: Partial<Record<keyof EvaluationDimensions, number>>;
  readonly uncertainty: EvaluationUncertainty;
  readonly constraintAssessments: readonly ConstraintAssessment[];
  readonly requirementAssessments: readonly RequirementAssessment[];
  readonly evidenceReferences: readonly EvaluationEvidenceReference[];
  readonly evaluationVersion: string;
}
```

`OpportunityEvaluation` must not contain:

- `auto_prepare`
- `ask_user`
- `skip`
- `hold`
- `requires_override`
- any other policy action

### Dimensions

Initial dimensions:

```ts
export interface EvaluationDimensions {
  readonly requirementFit: number;
  readonly trajectoryValue: number;
  readonly developmentValue: number;
  readonly constraintsFit: number;
  readonly representationLeverage: number;
  readonly marketQuality: number;
  readonly pursuitCost: number;
}
```

All dimensions are normalized `0..1`. `pursuitCost` is a cost criterion for TOPSIS.

### Requirement Assessment

`requirementFit` must be grounded in per-requirement assessment:

```ts
export interface RequirementAssessment {
  readonly requirement: string;
  readonly importance: 'required' | 'preferred' | 'unknown';
  readonly match: 'met' | 'partial' | 'gap' | 'unknown';
  readonly evidenceStrength: 'strong' | 'moderate' | 'weak' | 'none';
  readonly evidenceReferences: readonly EvaluationEvidenceReference[];
  readonly confidence: number;
}
```

Preserve:

```text
likely capability != currently evidenced capability
```

### Constraints

```ts
export interface ConstraintAssessment {
  readonly kind: string;
  readonly status: 'aligned' | 'conflict' | 'unknown';
  readonly materiality: 'low' | 'medium' | 'high';
  readonly evidenceReferences: readonly EvaluationEvidenceReference[];
  readonly note?: string;
}
```

A high-materiality conflict makes the issue visible. It does not forbid application.

### Ranking and Tiering

Router ranking consumes evaluations and returns ordering metadata:

```ts
export interface OpportunityRankingItem {
  readonly opportunityId: string;
  readonly rank: number;
  readonly rankScore: number;
  readonly tier: 'S' | 'A' | 'B' | 'C' | 'D';
  readonly evaluationScore: number;
  readonly rankingReasons: readonly string[];
}
```

Tiering uses both relative rank and minimum absolute quality, so a poor comparison set does not
automatically produce an S-tier opportunity.

### Policy

Router policy is a separate output:

```ts
export type OpportunityPolicyAction =
  | 'surface'
  | 'recommend_apply'
  | 'recommend_research'
  | 'recommend_stretch'
  | 'explore'
  | 'hold'
  | 'deprioritize';
```

No policy action belongs in `OpportunityEvaluation`, even though both are Router-owned.

## Mathematical Decisions To Settle

1. **Dimension semantics.** For each dimension, define what `0`, `0.5` and `1` mean, what evidence is
   allowed to support it, and how missing information is represented.
2. **Weights.** Define `W_base = g(X_t, L_t, D)`, with explicit current stated intent generally
   outranking historical learned preference.
3. **Fast preference loop.** Define `W_t = W_base + Delta W_fast,t` and the decay/update rule:
   `Delta W_fast,t+1 = rho Delta W_fast,t + eta s_t`.
4. **TOPSIS comparison set.** Decide whether the ideal/anti-ideal are built from the request's
   comparison set, a feasible-opportunity cohort, or a fixed calibrated profile.
5. **Normalization.** Define normalization for benefit and cost criteria, especially `pursuitCost`.
6. **Confidence.** Define aggregate confidence from dimension confidence without turning uncertainty
   into a quality penalty.
7. **Bands.** Define thresholds for `exceptional`, `strong`, `viable`, `weak`, `poor`.
8. **Ranking residual.** Initial ranking is deterministic. Future LTR may add
   `alpha * evaluationScore + f_theta(person, opportunity, t)` but not in this slice.
9. **Policy reward.** Keep user-response and world-response rewards distinct; do not collapse policy
   reward into clicks, applications or offers alone.

## Steps

1. **ADR.**
   - Add an ADR accepting derived, context-bound composite opportunity evaluation.
   - Supersede or refine ADR 0007 only where it forbids a universal numeric score.
   - Keep ADR 0007's warnings about hidden tension, uncertainty and false precision.

2. **Package placement.**
   - Implement inside `@joby/router`.
   - Split Router source internally by responsibility, for example:
     - `representation-routing.ts`
     - `opportunity-evaluation.ts`
     - `opportunity-ranking.ts`
     - `opportunity-policy.ts`
     - `topsis.ts`
   - Router may read Opportunity, Identity/Representation and PCI through narrow ports.
   - Router must write no upstream state.

3. **Evaluation contracts and pure math.**
   - Add TypeScript contracts for dimensions, weights, requirement assessments, constraints,
     confidence, comparison context and evaluations.
   - Implement pure helpers for normalization, weighted matrix construction, ideal/anti-ideal,
     distances and TOPSIS closeness.
   - Unit-test TOPSIS independently from Joby domain code.

4. **Deterministic dimension evaluator.**
   - Implement requirement fit using current exact/normalized capability evidence before any
     semantic similarity.
   - Implement constraints fit using Opportunity conditions and Stated Context.
   - Implement representation leverage from the selected or candidate Representation coverage.
   - Stub trajectory, development, market quality and pursuit cost with explicit low-confidence
     deterministic rules where evidence is absent.
   - Every stubbed or thin dimension must create gaps/unknowns rather than confident guesses.

5. **Weights.**
   - Implement safe default weights.
   - Add a stated-context-driven override path where explicit current intent can move weights.
   - Add a PCI prior input seam that returns zero-support/no-op weights until PCI learning exists.
   - Keep the fast preference loop as an in-memory/request-scope adjustment in this slice, unless a
     product decision says temporary behaviour should be durable.

6. **Router evaluation service.**
   - Add `evaluateOpportunity` for one opportunity.
   - Add `evaluateOpportunitySet` for TOPSIS over a comparison set.
   - Require understood opportunity revisions.
   - Return `comparisonSetId`, `evaluationVersion`, weights, confidence and evidence references.
   - Do not store evaluations in the first slice.

7. **Router ranking and tiering.**
   - Add deterministic ranking over `OpportunityEvaluation[]`.
   - Initial formula: `rankScore = evaluationScore` plus documented deterministic tie-breakers.
   - Add tier thresholds that require both rank position and minimum absolute evaluation score.
   - Keep the future LTR residual behind an interface returning zero adjustment by default.

8. **Router policy seam.**
   - Add a policy contract that consumes ranking, uncertainty, constraints, current context and
     optional PCI priors.
   - Initial policy should be rule-based and conservative.
   - It may recommend research when uncertainty is high, apply when score/confidence are high, hold
     when material constraints are unresolved, and explore when controlled exploration is warranted.
   - It must not rewrite evaluation dimensions or ranking output.

9. **API route.**
   - Add a read-only Router route, probably `POST /routing/opportunities`, accepting
     `personId` and `opportunityIds`.
   - Return evaluations, ranking and optional policy separately:

     ```json
     {
       "evaluations": [],
       "ranking": [],
       "policy": []
     }
     ```

10. **Docs and state.**
    - Update module READMEs.
    - Update `docs/CURRENT_STATE.md`.
    - Add explicit "not implemented yet" notes for learned LTR, contextual bandit training and PCI
      learning if they remain seams only.

## Verification

- Pure unit tests for TOPSIS:
  - benefit criteria.
  - cost criterion for `pursuitCost`.
  - equal alternatives.
  - zero-distance edge cases.
  - stable output in `0..1`.

- Contract tests:
  - `OpportunityEvaluation` contains no policy action fields.
  - policy output is separate from evaluation output.
  - ranking does not call or mutate Application.

- Integration tests against PostgreSQL:
  - captured and understood opportunities can be evaluated for a person.
  - missing opportunity understanding returns a clear error.
  - evaluation reads Identity/Stated Context through public interfaces.
  - evaluation writes no Identity, Opportunity, Application or PCI tables.
  - high-materiality constraint conflict is surfaced but does not block evaluation.
  - high estimated quality plus low confidence remains high score plus low confidence, not a
    silently mediocre score.
  - a poor comparison set does not produce S-tier solely by rank.

- Boundary tests:
  - `@joby/router` is the only package exposing opportunity evaluation, ranking and policy.
  - `@joby/opportunity` remains person-neutral and does not grow fit, ranking or policy vocabulary.
  - Router's Representation Routing remains separately callable and does not return fit scores or
    policy actions.
  - Opportunity Understanding remains person-neutral.
  - PCI priors are consumed as priors, not as truth.

- Standard checks:
  - `pnpm typecheck`.
  - `pnpm test` or the focused affected suites, depending on runtime cost.

## Out Of Scope

- Training a real LTR model.
- Training a contextual bandit.
- Persisting fast behaviour as durable preference.
- Writing PCI learning logic.
- Automatically applying, preparing or skipping opportunities.
- Semantic capability matching beyond existing normalized equality.
- Company/entity resolution, salary normalization, market-data ingestion or external enrichment.
- UI.
- Submission or browser-driving changes.

## First Surgical Slice

If this plan needs to be cut smaller, build only:

1. ADR.
2. Evaluation contracts.
3. Pure TOPSIS math.
4. Deterministic `evaluateOpportunitySet`.
5. Tests proving no policy fields, uncertainty separation and no cross-owner writes.

That slice gives Joby the inspectable evaluation backbone without prematurely committing to learned
ranking, bandit policy, persistence or external market enrichment.
