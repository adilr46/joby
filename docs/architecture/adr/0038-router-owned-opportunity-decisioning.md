# ADR 0038 - Router-owned opportunity decisioning

- **Status:** Accepted
- **Date:** 2026-09-12
- **Extends:** ADR 0007, ADR 0031

## Context

ADR 0007 defined trajectory evaluation but rejected a universal numeric fit score. That rejection
was correct for a score presented as objective truth: it would hide useful tension, imply false
precision and make disagreement difficult.

ADR 0031 then made Router deliberately small: it selected the Representation that should seed
Adaptation for one opportunity. That was enough while Joby had no implemented opportunity set
decisioning.

Joby now needs a broader question answered before action:

> Of the opportunities available now, which ones deserve this person's attention, and what should
> Joby recommend doing with them?

That question includes evaluation, ranking, tiering and policy. Splitting those across several
semantic authorities creates an artificial chain of tiny owners around one decision responsibility.

## Decision

Router owns opportunity decisioning.

Its responsibility expands from:

```text
Person + Opportunity -> Representation prior
```

to:

```text
Person + Opportunity Set + Current Context -> evaluated, ranked and policy-routed opportunities
```

Router therefore owns these named sub-capabilities:

- **Representation Routing**: choose the persistent Representation that should seed Adaptation.
- **Opportunity Evaluation**: derive a person-specific, context-bound evaluation for each
  opportunity.
- **Opportunity Ranking and Tiering**: order evaluated opportunities for the person.
- **Opportunity Policy**: recommend the next action for each ranked opportunity.

Router may expose a composite `evaluationScore` only as:

```text
Derived(Person, Opportunity, CurrentContext, WeightState, ComparisonSet)
```

The score is not canonical truth about the person and not canonical truth about the opportunity. It
is derived, comparison-context-specific, inspectable and versioned.

The first scoring method is MCDA plus TOPSIS plus calibration:

- MCDA defines dimensions and weights.
- Dimension evaluators return value, confidence and reasons.
- TOPSIS computes closeness to the fixed weighted ideal `[1,1,1,1,1,1,1]` and anti-ideal
  `[0,0,0,0,0,0,0]`.
- `rawScore` is TOPSIS output; `score` is the calibrated score.
- When calibration evidence is insufficient, `score = rawScore`.
- Uncertainty remains separate as confidence, gaps, unsupported claims and unknowns.
- Constraint conflicts are surfaced with materiality. They are not automatic application blocks.
- Evaluation labels are `strong`, `consider` and `weak`.
- Ranking exposes listwise, Tier 1/Tier 2/Tier 3 and pairwise projections from one ranking output.
- Bounded exploration may apply a small, symmetric, uncertainty-proportional perturbation to ranking,
  but not to evaluation.

Router remains read-only over upstream authorities. It writes no Identity, Opportunity,
Application or PCI truth.

## Consequences

Router is no longer small in scope. It is small in authority: it derives and recommends, but mutates
nothing upstream.

ADR 0007's ban on a universal fit score remains. What is now permitted is a context-bound,
person-specific, derived score for comparative decision support.

Opportunity remains person-neutral. It owns evidence and understanding, not fit, ranking or policy.

PCI remains a prior source and later learning authority. Immediate user behaviour may influence a
fast preference estimate, but does not directly become durable PCI.

Policy output remains separate from evaluation output. `OpportunityEvaluation` must not contain
actions such as apply, skip, hold, prepare or ask user.

Learning to Rank, contextual bandit training and database-backed calibration are future
implementations behind Router-owned interfaces. The initial implementation is deterministic and
inspectable.
