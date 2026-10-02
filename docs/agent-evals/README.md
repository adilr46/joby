# Agent Evals

Evaluations of AI behaviour in Joby — both the product's AI (extraction, generation, research) and
the agents used to build it.

**Currently empty.** Populated when there is AI behaviour to evaluate.

## What belongs here

- Fixture cases with expected outcomes.
- Records of runs, including failures.
- **Doctrine-violation checks**, which are the evals that matter most:
  - Does generated output carry claims not traceable to evidence?
  - Does AI output ever reach Explicit State without user confirmation?
  - Does anything in the Fast Operational Loop rewrite Learned State / PCI directly?
  - Can a single event alone create a durable trait, or does redelivery strengthen a conclusion?
  - At the Baseline Identity State, does output present a generic prior or a single data point as learned personal insight?
  - Are `Observed` / `Inferred` / `Hypothesized` preserved end to end?
  - Are consequential claims and sensitive disclosures surfaced for user control rather than assumed?

A doctrine violation is a failing eval, not a quality issue.
