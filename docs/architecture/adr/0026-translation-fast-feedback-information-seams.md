# ADR 0026 — Translation Fast-Feedback Information Seams

- **Status:** Superseded by ADR 0029; type-only compatibility constraints retained
- **Date:** 2026-09-01
- **Modules affected:** Intelligence, Adaptation, Execution
- **Related:** ADRs 0024 and 0025

## Context

ADR 0025 settles semantic ownership inside Translation. The fast operational loop now needs named
information seams without prematurely deciding commands, events, persistence or refinement
algorithms.

## Decision

Translation preserves three conceptual information seams:

1. **Opportunity Intelligence — Intelligence → Adaptation:** what Joby currently understands and
   believes about this person × opportunity.
2. **Application Intent — Adaptation → Execution:** what Joby intends to represent and submit.
3. **Fast Feedback — Execution → Intelligence and/or Adaptation:** external observations which may
   require semantic reconsideration.

The contracts are type-only. A producer publishes its information shape; each consumer declares the
view it needs. Siblings do not import siblings. An app composition root may route structurally
compatible information between public interfaces, but gains no domain authority.

Only semantic feedback crosses the third seam. Retries, field-control failures, captchas, timeouts
and other purely mechanical feedback remain private to Execution.

Each module remains the only writer of its state. These contracts confer information, not mutation
authority. No event, database table, DTO versioning scheme, handler, refinement method or algorithm
is introduced by this decision.

## Consequences

- The intended loop is structurally expressible before Execution behavior exists.
- Existing runtime behavior and event vocabulary remain unchanged.
- A future vertical use case must decide when feedback is semantically material and which owner
  should reconsider it; this ADR does not encode that policy.
