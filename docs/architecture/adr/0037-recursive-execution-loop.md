# ADR 0037 — The Recursive Execution Loop

- **Status:** Accepted — implementation record for [ADR 0031](0031-identity-router-translation-application-pci.md)
- **Date:** 2026-09-04
- **Scope:** `packages/translation/src/execution/surface-loop.ts`

## Context

[ADR 0035](0035-page-surface-interpretation.md) classifies what one surface requires.
[ADR 0036](0036-surface-resolution-and-deterministic-execution.md) resolves what it can and executes
what resolves. Neither ties the two into a loop: nothing decided what a caller should do next after
one surface — fetch another surface, ask the person, or stop — and an application is not one surface,
it is however many the portal shows before reaching a decision point.

## Decision

`SurfaceLoopService.step` composes the three existing services into **one Observe → Ground → Act →
Verify pass per execution surface**, and returns a structured outcome instead of deciding what
happens next itself:

```text
continue | waiting_for_user | needs_repair | submission_ready | blocked
```

### One step, not the loop itself

`step` does not drive a browser and does not recurse. It takes one `PageObservation` — whatever the
portal currently shows — grounds it (ADR 0035's one Claude call per surface), resolves what it can
(ADR 0036's `JobyQueryPort`), executes and verifies (ADR 0036's deterministic plan), and returns.
Recursion across many *materially different* surfaces is the caller's own loop, calling `step`
repeatedly with a fresh observation each time. This is the same boundary every prior ADR in this area
already drew around live browser wiring (ADR 0035, ADR 0036) — a step function is what a real
browser-driving loop will call once per surface, not a replacement for building that loop.

### Conditional and new requirements need no special case

A surface that reveals more fields than expected — a conditional section, a validation-triggered
field — is just another observation. `inspectSurface`'s `addRequirements` already appends only what
is new (idempotent by id), so calling `step` again on a materially different observation of the
*same* surface handles "new requirements appeared" with the exact same code path as "a new surface
appeared." No branch anywhere asks which case this is.

### Waiting for the user

If resolution reports anything it could not resolve safely, `step` sets `executionLevel` to the
existing `awaiting_input` value — reused, not duplicated, because it already means exactly
"WAITING_FOR_USER" — and returns before ever attempting an action. `resolveRequirements` has already
paused the session (ADR 0036). Resuming is the caller's job: `resumeSession`, then `step` again with a
**fresh** observation. Nothing in this module assumes the browser held still during the interruption
— every `step` call takes its own observation as an argument, never reuses one from a previous call.

### Repair versus blocked

An executed action whose fresh observation disagrees with what was expected is a validation mismatch,
same as ADR 0036. What is new here is deciding when a mismatch stops being "try again" and becomes
"stop trying": `#hasStoppedConverging` reads Session Memory — which already records each mismatch by
element id (ADR 0036) — and counts how many times the same element has mismatched. Three
non-converging attempts on the same element sets `executionLevel` to the existing `failed` value
(reused as BLOCKED, for the same reason `awaiting_input` was reused) and returns `blocked`. This adds
no new persisted state: the convergence check is a read over notes the execution service was already
writing.

### Submission readiness, explicitly

Once a step executes cleanly with nothing left unresolved, `step` calls the existing
`deriveSubmissionReadiness` (ADR 0034) and, if ready, sets `executionLevel` to `ready_to_submit`
(SUBMISSION_READY) and returns. Nothing here submits anything — readiness is detected, not acted on,
exactly as ADR 0034 left it.

### Existing vocabulary, not a parallel one

The goal names `WAITING_FOR_USER`, `SUBMISSION_READY` and `BLOCKED` as states. Rather than adding a
second execution-level enum next to ADR 0034's `EXECUTION_LEVELS`, this ADR maps them onto the
existing values — `awaiting_input`, `ready_to_submit`, `failed` — because all three already carry
exactly that meaning in `deriveSubmissionReadiness`'s own reason text. Extending an existing concept
beats duplicating it.

## Consequences

- Execution's fifth real behaviour. `525` tests pass, up from `518`: 7 integration against real
  PostgreSQL, covering query-only-when-needed, multi-surface traversal, pause/resume with a fresh
  observation, repair, blocked convergence, explicit submission-readiness detection, and no
  `application` table touched.
- `tests/translation-boundary.test.ts`'s Execution export pin grew from 17 entries to 18.
- Adaptation, Identity, Opportunity and Application remain untouched — `step` only composes
  Execution's own three services and the existing session module.

## Deliberately not done

- **No browser-driving loop.** `step` is the unit a real loop calls once per surface; building the
  loop that actually watches a browser, decides when the surface has materially changed, and calls
  `step` again is a composition-root decision this ADR does not make.
- **No real `JobyQueryPort` adapter or `PortalActionExecutor` adapter.** Both remain ports with
  offline doubles, exactly where ADR 0036 left them.
- **No automatic resume.** `resumeSession` exists; nothing here watches for a user's answer and calls
  `step` on its own — the caller resumes and re-observes explicitly.
- **No click/submit actions**, unchanged from ADR 0036 — `buildActionPlan` still has no action type
  for a button, so a portal-operation requirement like "click Continue" is never itself executed by
  this loop; it must be resolved some other way (a future click-executor, or the person) before
  readiness can turn true.
