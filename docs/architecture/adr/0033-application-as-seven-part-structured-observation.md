# ADR 0033 — Application as a Seven-Part Structured Observation

- **Status:** Accepted — extended by [ADR 0039](0039-application-state-first-event-publication.md)
- **Date:** 2026-09-03
- **Scope:** `packages/application`, migration `0013`

## Context

> **Extended, not superseded (2026-09-13).** ADR 0039 resolves the event-publication question this
> ADR deliberately left open: Application now records authoritative state first and automatically
> publishes `ApplicationSubmitted`, `InterviewRecorded` and `OutcomeObserved` from the committed
> Application facts through the transactional outbox.

Application was, until now, README-only: ADR 0031 named it as an independent authority — "the live
lifecycle and durable record of what actually happened" — but no code existed. Three modules were
blocked on it: Interview Intelligence has no lifecycle to act against, PCI has no evidence to learn
from, and the resolved-evidence seam PCI already declared (`ResolvedApplicationEvidence`) had no
producer.

## Decision

One Application is the durable structured observation of a single Person × Opportunity interaction:

```text
Oₙ = (Pₙ, Wₙ, Rₙ, Aₙ, Xₙ, Iₙ, Yₙ)
```

Implemented as `@joby/application`, following the layout every other module here uses
(`model.ts` → `repository.ts` → `service.ts` → `contract.ts` → `factory.ts` → `index.ts`) and one
migration, `0013_application.sql`.

### The seven parts, and why each is its own table or column group

`Pₙ`, `Wₙ`, `Rₙ`, `Aₙ` are one row (`application_lineage`): references and revisions, never copies.
None is a foreign key into Identity, Representation, Opportunity or Adaptation's schemas — Application
must not gain a way to reach into another module's tables to satisfy a constraint, the same
referential lesson migrations 0011 and 0012 already recorded.

`Xₙ` (`application_submitted_material`) is immutable and deliberately separate from `Aₙ`
(`application_lineage.draft_ids`): **`Aₙ ≠ Xₙ`**. `sourceDraftId` traces sent material back to a
draft when it came from one; `editedFromSource` says whether it still matches. Both may be absent —
material that did not originate from anything Joby produced is a normal case.

`Iₙ` is three append-only streams (`application_timeline_entry`, `application_communication`,
`application_interview_stage`). The timeline is corrected by superseding, never by editing: a new
entry names the one it corrects, and the corrected entry is kept. `currentState` is a pure function
over timeline chronology (`deriveCurrentState`), computed on every read and stored nowhere — a stage
column beside the timeline would be a second place the same fact could disagree with itself.
Interview stages separate `observations` (facts about the stage) from `reflection` (the person's own
account, attached afterwards, never a system-generated score).

`Yₙ` (`application_outcome`) is its own table, not a timeline stage: **`Xₙ ≠ Yₙ`**. What was sent is
a fact about the person's action; how the world responded is a fact about the world, observed later
and often uncaused by anything in `Xₙ` alone. Collapsing them invites reading causation into two
facts that merely happened in sequence.

### The resolved-evidence seam

`getResolvedEvidence` projects a resolved `ApplicationRecord` into `@joby/pci`'s
`ResolvedApplicationEvidence` — the shape PCI already declared as its input contract, so it is agreed
in exactly one place. `isResolved` gates the projection on at least one recorded outcome; an
application still in progress projects to `undefined` rather than a partial signal.

The projection keeps PCI's two signal families distinct, as PCI's own contract requires: a
representation override and an interview reflection are `user_response`; a timeline stage reached
and a recorded outcome are `world_response`.

**No learning happens in this module.** `@joby/application` does not import `@joby/pci`. Producing
the seam is not consuming it; wiring `getResolvedEvidence` into `pci.observe` is a composition-root
decision for the worker pass that eventually does it.

### Only meaningful reality is persisted

No table has a column for a retry, a selector, a captcha checkpoint or an HTTP status. This is
structural exclusion: Execution's mechanical detail is never written here, so there is nothing of
that shape for the resolved-evidence projection to filter out. A mechanical fact enters this schema
only if a future migration explicitly gives it a column — never implicitly, by widening an existing
one.

## Consequences

- Interview Intelligence, Execution and Router now have a real `applicationId` to act against.
- The PCI resolved-evidence contract has a producer, closing the seam ADR 0031/0032 left as
  unresolved implementation work on the output side.
- 455 tests pass, up from 417: 19 model/projection unit tests, 19 integration tests against real
  PostgreSQL, plus the schema-boundary test asserting no table carries a canonical-fact, opportunity
  or adapted-content column.

## Deliberately not done

- **Event publication now resolved by ADR 0039.** This ADR originally published no events; Application
  now announces its own durable submitted/interview/outcome facts through the transactional outbox.
- **No wiring into a composition root.** No HTTP route, no worker pass reading `getResolvedEvidence`
  into `pci.observe`. Both are downstream integration decisions, not part of the aggregate itself.
- **No PCI learning.** Unchanged from ADR 0031/0032; the seam exists, nothing consumes it yet.

## Unresolved — genuine Tier 1 decisions, surfaced rather than guessed

1. **What counts as "meaningful" enough to cross from Execution into `Xₙ` or `Iₙ`.** The schema
   excludes mechanical detail by default, per the brief. The line between "a portal retry" and "a
   materially relevant failure worth recording as a communication or timeline note" is a product
   judgement ADR 0031 already flagged as open and this ADR does not resolve.
2. **Resolved by ADR 0039:** `ApplicationSubmitted`, `InterviewRecorded` and `OutcomeObserved` fire
   automatically from the Application service after the corresponding Application-owned fact is
   recorded.
3. **Multiple concurrent applications to the same opportunity.** The unique constraint on
   `(person_id, opportunity_id)` assumes one Application per pairing, ever. A person re-applying
   after withdrawal, or reapplying to a reposted opportunity with a new `opportunityId`, is
   unaddressed and was not invented here.
