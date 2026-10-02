# ADR 0039 — Application State First, Event Publication Second

- **Status:** Accepted
- **Date:** 2026-09-13
- **Scope:** `@joby/application`, `@joby/events`
- **Extends:** [ADR 0033](0033-application-as-seven-part-structured-observation.md),
  [ADR 0004](0004-transactional-outbox-and-postgres-durable-queue.md)

## Context

ADR 0033 made Application the durable record of what actually happened in a Person × Opportunity
interaction, but deliberately left Application event publication unresolved. That restraint was
useful while the aggregate was new, but the boundary is now clearer:

- Application is the source of truth for submitted reality (`X_n`), interaction history (`I_n`) and
  observed outcomes (`Y_n`).
- `packages/events` is infrastructure: envelope, outbox, dispatch and delivery.
- Event handlers are after-the-fact reactions. They may update their own projections, jobs or
  learning inputs, but they must not decide or mutate Application truth.

The risk is letting an "event bus" become an orchestration authority. That would make Application
state depend on handler behavior, delivery timing or replay, all of which contradict ADR 0002's rule
that publishers ignore handler outcomes.

## Decision

Application services commit authoritative Application state first, then publish events derived from
that committed state through the existing transactional outbox path:

```text
Application service
  -> validate and write Application-owned rows
  -> write the event outbox row in the same transaction
  -> commit
  -> publish inline handlers after commit
  -> worker later delivers deferrable handlers
```

Concretely:

- `recordSubmission` records immutable submitted material, then publishes `ApplicationSubmitted`.
- `recordInterviewStage` records the interview observation, then publishes `InterviewRecorded`.
- `recordOutcome` records the observed outcome, then publishes `OutcomeObserved`.

These events are notifications of Application facts. They are not commands, not request/response
messages and not the mechanism by which Application state is created.

`packages/events` remains the owner of event mechanics only: envelope construction, serialization,
outbox records, dispatch and durable delivery. It does not own Application state, and a handler
registered there does not gain authority over Application rows.

## Rules

1. Application-owned rows are the authority for Application reality.
2. An Application event is emitted only after the corresponding Application fact has been written in
   the same transaction as its outbox row.
3. Application event payloads carry identifiers and enough routing context, not copies of the
   Application aggregate.
4. Handlers reacting to Application events may write only their own module's state.
5. Redelivery may refresh a downstream projection or retry a job; it must not create, correct or
   reinterpret Application truth.
6. Replay, if added later, means redelivering historical facts to idempotent handlers. It does not
   make Joby event-sourced.

## Consequences

- The previously open question in ADR 0033 is resolved: Application automatically announces the
  durable facts it owns.
- Memory, PCI and notification work can subscribe to Application facts without becoming Application
  authorities.
- The event package stays small and infrastructural. This ADR does not introduce global ordering,
  replay, choreography, a broker or a bidirectional UI bus.

## Deliberately not done

- No new event family for transient Execution progress.
- No event sourcing.
- No generalized command bus.
- No replay or ordering feature beyond the existing durable outbox delivery mechanics.
