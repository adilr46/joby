# ADR 0034 — Execution's Application Session

- **Status:** Accepted — implementation record for [ADR 0031](0031-identity-router-translation-application-pci.md)
- **Date:** 2026-09-04
- **Scope:** `packages/translation/src/execution`, migration `0014`

## Context

Execution has been a documented authority with no behaviour since ADR 0024: "temporary attempts and
mechanical actions used to realize the intended application externally... does not own the
Application." Nothing existed to hold the state one attempt actually needs while it is in progress —
which portal, which field, what is still unresolved, whether it is safe to submit — and nothing
survived a restart. Interview Intelligence and any future submission orchestration both need
somewhere to keep that state; neither existed yet to build it for.

## Decision

**Application Session** is Execution's first implemented capability: the durable, restart-safe,
temporary runtime state for one application attempt.

```text
Execution   = what Joby attempts.
Application = what is actually happening and what actually happened.
```

A session is the *attempting* half. It is persisted — so it survives a restart — but it is not
Application history: nothing in it is a fact about what happened, only about what Execution is
currently attempting, and it can be discarded or superseded with no loss to Application's record.

### What a session holds, and why each part is shaped the way it is

- **Job / Company context** — a reference to Opportunity's understanding (id + revision), with
  `role` and `company` carried for display only. Company has no owner of its own in Joby yet
  (`@joby/opportunity`'s README lists resolution as deliberately unbuilt); this is Opportunity's own
  attributed reading, carried through, not a second company store.
- **Portal context** — navigation only: `portalKind` (free text — Portal is infrastructure with no
  vocabulary of its own to enforce) and `currentStepId`. Field values were originally modelled here
  too and removed during implementation: duplicating them against `WorkingApplicationState` would
  have let the two disagree about which value is current, so there is exactly one home for a filled
  value.
- **Working application state** — what Execution currently intends to submit. `intent` is
  Adaptation's own `ApplicationIntent` (the existing Adaptation → Execution seam), carried unchanged
  rather than copied into a new shape; `portalFieldValues` covers anything a portal asks for that the
  intent does not. **This is not `Xₙ`.** `Xₙ` is what actually crossed the boundary, immutable, owned
  by Application. A session's working state is provisional and freely superseded until the moment
  something is actually sent — an act this ADR deliberately does not implement.
- **Current execution level** — `not_started → preparing → awaiting_input → ready_to_submit →
  submitted / failed`, disjoint from Application's timeline vocabulary on purpose: one is the
  mechanical surface of attempting a submission, the other is dated facts about the whole
  interaction. Once `submitted`, a session refuses further level changes — reopening it would let
  session state disagree with whatever Application later records as `Xₙ`.
- **Unresolved requirements** — a checklist, each entry a label and a status
  (`unresolved`/`resolved`/`not_applicable`) with an optional short pointer to how it was resolved,
  never the canonical answer itself.
- **Session memory** — `lastAction`/`nextStep`/an append-only `notes` list, loose enough not to
  presume how a future browser or model execution loop actually resumes.

**Submission readiness is derived, never stored** (`deriveSubmissionReadiness`), for the same reason
Application's `currentState` is derived from its timeline: a stored flag is a second place the same
fact could disagree with itself the instant a requirement resolves underneath it.

### Create/resume is one operation

`createOrResumeSession` returns an existing session for the `(personId, opportunityId)` pair
unchanged rather than resetting it. A caller does not need to know in advance whether a session
already exists — resuming and creating look identical from the outside, and a fresher opportunity
revision or newly known `applicationId` never silently overwrites an attempt already in progress.

### Pause/resume touches only `paused`

Pausing changes exactly one field. Execution level, working state, requirements and memory are
untouched, so resuming needs nothing recomputed and nothing is at risk of being lost between the two
calls.

### No browser or model execution

Nothing here acts externally. The public surface is state transitions only — create, update context,
advance level, resolve a requirement, record a note, pause, resume, read readiness. Reaching
`ready_to_submit` is as far as this module goes; actually submitting, and therefore writing
Application's `Xₙ`, is unbuilt and intentionally so.

## Consequences

- Execution has a real public surface for the first time; `tests/translation-boundary.test.ts` pins
  it so further growth stays a decision.
- Interview Intelligence and any future submission orchestration have somewhere to keep in-progress
  state without inventing their own persistence.
- 484 tests pass, up from 455: 8 unit (readiness derivation) + 21 integration against real
  PostgreSQL, including a fresh-connection reload proving the persisted half of restart survival, and
  assertions that no foreign key or column ties this table to `application`, `opportunity`,
  `adaptation` or `identity`.

## Deliberately not done

- **No actual submission.** Reaching `ready_to_submit` and turning working state into Application's
  `Xₙ` is a later, separate act — this ADR is state, not action, exactly as the brief specified.
- **No browser or model execution loop.** `sessionMemory` is shaped to make resuming possible later;
  nothing here decides how a future loop would use it.
- **No wiring into a composition root.** No HTTP route, no automatic session creation from Router or
  Adaptation output. Both are downstream integration decisions.
- **Concurrent attempts at one opportunity.** `UNIQUE (person_id, opportunity_id)` assumes one active
  session ever, the same open question ADR 0033 already recorded for Application itself.
