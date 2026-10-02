# Router

**Status: implemented.** The read-only person x world decisioning responsibility between Identity
and Opportunity (ADR 0038).

```text
Identity + Opportunity Set + Current Context  ->  Router decisioning
```

## Owns

Router owns four named sub-capabilities:

- **Representation Routing**: which existing Representation should this opportunity start from?
- **Opportunity Evaluation**: how this opportunity evaluates for this person in a comparison set.
- **Opportunity Ranking and Tiering**: which evaluated opportunities deserve attention first.
- **Opportunity Policy**: what action Joby should recommend for each ranked opportunity.

Representation Routing still uses normalised capability equality and nothing cleverer. The broader
opportunity decisioning path is deterministic in this slice: MCDA dimension evaluators, fixed-ideal
TOPSIS `rawScore`, calibration-aware `score`, ranking projections, tiering and conservative policy
are derived on read and stored nowhere.

The output is inspectable rather than magic: every lens considered, what each covers and does not,
and one readable sentence saying why; every opportunity evaluation carries dimensions, dimension
reasons, weights, raw score, calibrated score, confidence, calibration diagnostic, uncertainty,
requirement assessments and constraint assessments.

## Does not own

- **It does not adapt.** Choosing a lens is not tailoring. The opportunity-specific delta is
  Adaptation's; Router produces no Adapted State, draft or evidence selection.
- **It writes nothing.** Not Identity, not Opportunity, not Application, not PCI. Its ports are
  reads, and there is no write on them to call.
- **It owns recommendations, not truth.** An `evaluationScore` is derived from the current person,
  opportunity, weights and comparison set. It is not canonical truth about either side.
- **It does not learn yet.** LTR, contextual bandit training, database-backed calibration and PCI
  updates remain future work behind seams.

## Learned priors are hints, not authority

PCI may say "lenses like this one have tended to suit work like this". Its Representation Routing
influence is bounded below one covered capability, so a prior can break a tie and cannot promote a
lens that covers the posting less. Observed coverage outranks learned belief.

`NoLearnedPriors` and `NoEvaluationPriors` are the defaults and return nothing. That is the correct
answer until PCI learns.

## Weight and ranking learning primitives

Router includes v1 primitives for later learning without wiring them into durable product behavior:

- Representation-family weight priors for SWE, Quant, Finance / IB, Product, Research,
  Founder / Operator and Commercial / Solutions.
- `updateWeights`: `Wnew = (1 - alpha)Wold + alpha Wevidence`, with separate learning rates for
  application-specific, representation-track and overall-trajectory updates.
- `InMemoryWeightStateStore`, deliberately separate from canonical Identity.
- `InMemoryOpportunityEvaluationHistoryStore`, an append-only store for decision-time evaluation
  runs.
- `LinearLtrModel`, a pairwise-logistic linear ranker that can learn residual preference beyond
  `evaluationScore`.

Database-backed persistence and production LTR wiring remain later slices.

## Recommending nothing is a normal outcome

A person who keeps no Representation gets no recommendation and a plain explanation. Adaptation
works with no prior at all, so applying outside every lens someone keeps is a supported path, not a
degraded one.
