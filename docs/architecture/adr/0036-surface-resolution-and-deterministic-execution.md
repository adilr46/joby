# ADR 0036 — Surface Resolution and Deterministic Action Execution

- **Status:** Accepted — implementation record for [ADR 0031](0031-identity-router-translation-application-pci.md)
- **Date:** 2026-09-04
- **Scope:** `packages/translation/src/execution/surface-resolution.ts`, `surface-execution.ts`

## Context

[ADR 0035](0035-page-surface-interpretation.md) gave Execution the ability to classify what a page
requires — known / generated-answer / user-required / portal-operation — but classification alone
answers nothing. A `known` requirement is resolved immediately because the caller happened to supply
a matching fact; everything else just sits on the checklist. Execution needed a way to actually
satisfy a requirement without becoming the thing that decides *how* — reaching into Identity for a
fact, Adaptation for a generated answer, Opportunity for posting detail, or Application for something
already resolved on a prior attempt is not Execution's job, and building that orchestration into
Execution would duplicate authority every one of those modules already owns.

## Decision

Two new capabilities, kept deliberately separate because they answer different questions —
**what does this requirement need**, and **what mechanically happens once it has it**.

### Surface resolution: Execution asks, Joby answers or refuses safely

`JobyQueryPort` is Execution's own narrow, consumer-side view of one conversation:

```text
Execution: "I need the answer to this requirement."
Joby:      "Here is the authorised answer." | "I cannot resolve this safely."
Execution: → use it, or ask the person.
```

The same pattern Adaptation already uses for its own Opportunity port (ADR 0013): a module declares
the shape of what it needs, and wiring which real module answers it is a composition-root decision,
not something Execution's own code decides. `JobyQuerySource` names the sources the goal specifies —
`known_professional_fact`, `stated_context`, `accepted_document`, `opportunity_information`,
`generated_answer`, `resolved_application_information` — carried through as provenance on the
session's `resolvedValue` pointer, never as a value Execution inspects to decide what to do next.

`SurfaceResolutionService.resolveRequirements` queries Joby **only** for requirements that actually
need information: `portal_operation` is mechanical and is filtered out before the loop even starts,
and `known` requirements are never `unresolved` by the time this runs (ADR 0035's inspection only
records `known` once a fact already matched). Every other requirement gets exactly one query. A
resolved answer lands on the requirement (`resolveRequirement`) and, where grounded to a surface
element, on `workingState.portalFieldValues`. An `unresolved` answer — `not_found`, `ambiguous`, or
`conflicting`, three distinct reasons because they call for different things from the person — is
never converted into a guess. It becomes a user clarification, and **any** unresolved answer pauses
the whole session (`pauseSession`), because a session that is midway between "safe to act" and
"needs a person" should not look ready to continue.

### Deterministic action execution: mechanical, not another model call

Once a requirement is resolved, turning it into a portal action needs no further judgment — the
judgment already happened at classification (ADR 0035) and resolution (above). `buildActionPlan` is a
pure function: element kind maps to exactly one of `fill` / `select` / `check` / `upload`, and an
element with no resolved value in `workingState.portalFieldValues` produces no action — never a
guess. **Buttons have no mapped action type at all.** Submission stays out of this slice exactly as
ADR 0034 and ADR 0035 already drew that boundary; a resolved value sitting in
`portalFieldValues['some-submit-button']` (which should never happen, since submit buttons are
`portal_operation` and this module never queries Joby for those) still produces nothing, because the
mapping itself has no entry for `button`.

`PortalActionExecutor` is the port a real Portal adapter (ADR 0029: infrastructure, no semantic
authority, still unimplemented) will eventually satisfy; `DeterministicPortalActionExecutor` is the
offline double. After executing, the portal is **freshly observed** — the caller supplies a new
`PageObservation`, compacted through the same `buildExecutionSurface` ADR 0035 already built — and
every executed action's expected value is compared against what the fresh observation actually shows.
Anything that does not match is a validation mismatch.

### Mechanical outcomes are Session Memory, never Application history

Every outcome from both services — resolved, needs-user, executed, failed, mismatched — is written
onto the session's `recordSessionNote`, never into an `application` table. This is ADR 0006's rule
made concrete a second time (ADR 0034 already drew it for the session itself): mechanical execution
detail does not become durable Application history merely by being logged.

## Consequences

- Execution's third and fourth real behaviours. `518` tests pass, up from `508`: 4 unit
  (`buildActionPlan`, pure) + 6 integration against real PostgreSQL, including a query-only-when-
  needed proof, an accepted-document resolution, a pause-on-ambiguity proof, a validation-mismatch
  proof, a mechanical-failure proof, and a no-`application`-row-written proof.
- `tests/translation-boundary.test.ts`'s Execution export pin grew from 12 entries to 17.
- Adaptation, Identity, Opportunity and Application are untouched. `JobyQueryPort` is declared and
  consumed entirely inside Execution; nothing here reaches into another module's tables or public
  interface.

## Deliberately not done

- **No real `JobyQueryPort` adapter.** Wiring the port to actually consult Identity, Adaptation,
  Opportunity and Application — the "Joby's existing architecture resolves the source" half of the
  goal — is a composition-root decision this ADR does not make. The port and its offline double are
  what the composition root will wire against.
- **No live browser wiring.** `PortalActionExecutor` is a port; a real adapter that drives an actual
  browser is Portal's eventual job (ADR 0029), still unimplemented.
- **No click/submit actions.** `buildActionPlan` produces `fill`/`select`/`check`/`upload` only.
  Deciding when a session is actually ready to submit remains open (ADR 0034's `deriveSubmissionReadiness`
  already computes readiness; nothing yet acts on it).
- **No resume flow for a paused session.** `resumeSession` already exists (ADR 0034); nothing here
  automatically re-runs resolution once a person answers a clarification — that orchestration is a
  later integration decision.
