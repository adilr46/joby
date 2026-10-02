# Execution

**Status: Application Session (ADR 0034), page surface interpretation (ADR 0035), surface resolution
and deterministic action execution (ADR 0036), the recursive execution loop (ADR 0037), a
composition-root `JobyQueryPort` adapter, browser automation runner and API-wired browser drive loop
are implemented. Final submission is not implemented.**

```text
Execution   = what Joby attempts.
Application = what is actually happening and what actually happened.
```

## Owns

**The temporary runtime state for one application attempt** — the **Application Session**:

| Part | What it holds |
|---|---|
| Job / Company context | which opportunity and revision, `role`/`company` for display |
| Portal context | which portal (free text), which step — navigation only |
| Working application state | what is currently intended for submission: Adaptation's `ApplicationIntent`, plus portal-only field values |
| Current execution level | `not_started → preparing → awaiting_input → ready_to_submit → submitted / failed` |
| Unresolved requirements | a checklist, each resolved/unresolved/not applicable |
| Session memory | last action, next step, an append-only note log |

Also owns retries, portal interaction and mechanical feedback for an attempt. Final submission still
requires an explicit submitter/recorder because that is the boundary where Application owns what
actually happened.

## Does not own — and this is what keeps a session honest

- **Not `Xₙ`.** Working state is provisional and freely superseded. `Xₙ` — what actually crossed the
  external boundary — is immutable and belongs to Application. Submitting is the (unbuilt) act that
  turns a session's working state into Application's `Xₙ`.
- **Not Application's `currentState`.** Execution level is the mechanical surface of *attempting* a
  submission; Application's timeline records dated facts about the whole interaction. The two
  vocabularies are deliberately disjoint.
- **Not the person's intent, canonical opportunity truth, or Adapted State.** Those cross this
  module's boundary as information (Adaptation's `ApplicationIntent`); Execution never recomputes or
  owns them.
- **Not browser infrastructure.** Live page observation and mechanical browser actions are supplied
  by `@joby/portal`; Execution decides what the operation means and records the session outcome.

## Submission readiness is derived, never stored

`deriveSubmissionReadiness` computes readiness from current state on every call — paused, submitted
and failed sessions are never ready; otherwise every requirement must be resolved and something must
be prepared to submit. A stored readiness flag would be a second place the same fact could disagree
with itself the moment a requirement resolves.

## Create/resume is one operation

`createOrResumeSession` returns an existing session unchanged rather than resetting it. The caller
does not need to know in advance whether one already exists.

## Pause/resume touches one field

Pausing sets `paused: true` and nothing else. Execution level, working state, requirements and
memory all survive untouched, so resuming needs nothing recomputed.

## The two type-only fast-loop seams (ADR 0026)

`ApplicationIntent` (Adaptation → Execution) and `FastFeedback` (Execution → Opportunity/Adaptation)
remain type-only contracts. Mechanical feedback — retries, selectors, captchas — stays private to
this module and has no field on either seam.

## Page surface interpretation (ADR 0035)

Joby can inspect an arbitrary application page and determine what that surface requires:

```text
Browser → Portal Context → Execution Surface → Claude → Semantic requirements → Working Application State
```

| File | Role |
|---|---|
| `surface-observation.ts` | `PageObservation` (a structured page, not raw HTML) and `buildExecutionSurface` — a pure function compacting it into a compact `ExecutionSurface`, reading only element shape, never `url`/`title` |
| `surface-port.ts` | `SurfaceInterpreter` — the provider-neutral boundary, mirroring `@joby/identity`'s `CvExtractor` |
| `surface-validate.ts` | `parseSurfaceInterpretationResult` — grounds every claim against the surface and facts actually sent; rejects the whole result otherwise |
| `surface-deterministic-interpreter.ts` | Offline, rule-based `SurfaceInterpreter` for tests — classifies by element shape only |
| `surface-claude-interpreter.ts` | The real adapter: `fetch` against the Messages API with structured output |
| `surface-service.ts` / `surface-contract.ts` / `surface-factory.ts` | `SurfaceInspectionService` — orchestrates one inspection and records it onto a session |

**No HTML parser exists or was added.** A `PageObservation` is already structured (kind, label,
name, value, options, required, text per element) — the shape a browser adapter (live or fixture)
produces, not markup to parse.

**No ATS-specific branching anywhere in this path.** `buildExecutionSurface` and
`DeterministicSurfaceInterpreter` both classify by element shape only; neither reads which portal or
vendor produced the page, and `surface.test.ts` proves both against two structurally different
fixture pages.

**Four kinds, one closed vocabulary — owned by `SessionRequirement`, not by this code.**
`SurfaceRequirementKind` (`known` / `generated_answer` / `user_required` / `portal_operation`) lives
in `session.ts` next to `SessionRequirement`, which gained two optional fields (`kind`,
`surfaceElementId`) present only on requirements discovered this way.

**Untrusted output is validated, not merely schema-constrained.** Every `surfaceElementId` a model
returns must be an id that was actually on the surface sent; every `known` requirement's
`groundedFactLabel` must be one of the facts actually supplied. Either violation rejects the whole
result — a model willing to invent one grounding claim cannot be trusted on the rest of the same
response, the same choice `@joby/identity/extraction/validate.ts` makes for a phantom relation.

**Unresolved meaning is represented, never guessed.** An element the interpreter cannot classify
becomes an `UnclearSurfaceElement` and is written into the session's memory notes by name, instead of
being forced into `user_required` or silently dropped.

**Known facts prefill Working Application State; nothing else does.** Only a `known` requirement's
matching fact writes into `workingState.portalFieldValues` — the one case where interpretation writes
a value rather than a checklist entry, and only because that value came from a fact the *caller*
supplied, never from anything the model asserted on its own.

**No submission from interpretation.** `PageObservation` is the accepted input shape; live browser
adapters are composed at the API boundary. `generated_answer` is a classification; Adaptation still
owns writing through the `JobyQueryPort` adapter supplied by the composition root.

## Surface resolution and deterministic action execution (ADR 0036)

Satisfying a grounded surface: `for each requirement → no info needed: act directly / info needed:
query Joby → resolved: act, unresolved/ambiguous/conflicting: ask user → pause session`.

| File | Role |
|---|---|
| `surface-resolution.ts` | `JobyQueryPort` — Execution's narrow, consumer-side view of "I need this answer"; `SurfaceResolutionService` queries it for every unresolved `generated_answer`/`user_required` requirement |
| `joby-query-adapter.ts` | Composition-root adapter that tries authorised resolvers and refuses conflicting answers |
| `surface-execution.ts` | `buildActionPlan` (pure, element-kind → `fill`/`select`/`check`/`upload`); `PortalActionExecutor` port; `SurfaceExecutionService` executes, re-observes, compares |

**Execution asks, it never orchestrates.** `JobyQueryPort.resolve(query)` is the whole interface to
Identity/Adaptation/Opportunity/Application's authority graph — the same "consumer-side port declared
locally" pattern Adaptation already uses for its own Opportunity port. Which real module answers a
query is a composition-root decision this module does not make; `CompositeJobyQueryPort` is the
small adapter that lets that composition root supply Identity, stated-context, Opportunity,
Adaptation and Application resolvers.

**Queried only when needed.** `portal_operation` is mechanical and never enters the query loop;
`known` requirements are never `unresolved` by the time this runs (ADR 0035 already resolved them
against caller-supplied facts). Only `generated_answer` and `user_required` requirements are queried,
each exactly once.

**Never a guess.** `not_found` / `ambiguous` / `conflicting` — three distinct reasons, because they
call for different things from the person — are never converted into invented content. Any of them
becomes a user clarification and pauses the whole session.

**The action plan needs no second model call.** Which requirements need Joby's help was already
decided at classification and resolution; `buildActionPlan` only maps element kind to action type.
Buttons have no mapped type at all — submission stays out of this slice exactly as ADR 0034/0035 drew
that boundary.

**Fresh observation, always.** After executing through `PortalActionExecutor`, the portal is
re-observed and every executed action's expected value is checked against what actually shows — never
trusted from the plan alone.

**Mechanical outcomes are Session Memory, never Application history.** Resolved, needs-user,
executed, failed, mismatched — every outcome from both services lands in `recordSessionNote`. Neither
service ever writes or reads an `application` table.

## The recursive execution loop (ADR 0037)

`surface-loop.ts` — `SurfaceLoopService.step` composes inspection, resolution and execution into one
Observe → Ground → Act → Verify pass per surface:

```text
Observe → Ground → Act → QueryJoby if needed → QueryUser if unresolved → Verify → Repeat
```

**`step` composes; it does not recurse.** It takes one `PageObservation` and returns exactly one of
`continue` / `waiting_for_user` / `submission_ready` / `needs_repair` / `blocked`. Recursing across
many materially different surfaces — deciding when the browser shows something new and calling `step`
again — is the job of `BrowserApplicationAutomationRunner`, wired by the API with `@joby/portal`.

**Conditional and new requirements need no special case.** `inspectSurface`'s `addRequirements` only
ever appends what's new, so a materially different observation — whether a genuinely new surface or
the same surface with a conditional field now showing — is one more call to the same code path.

**WAITING_FOR_USER / SUBMISSION_READY / BLOCKED reuse `EXECUTION_LEVELS`, not a parallel vocabulary.**
`awaiting_input`, `ready_to_submit` and `failed` already meant exactly this in
`deriveSubmissionReadiness`'s own reason text (ADR 0034).

**Blocked is read from Session Memory, not new persisted state.** Three non-converging validation
mismatches on the same element — counted from the notes `surface-execution.ts` was already writing —
trips `blocked`.

**The executor must not assume the browser held still during an interruption.** Every `step` call
takes its own fresh observation; resuming a paused session is `resumeSession` followed by another
`step` call with a fresh observation, never a re-use of a stale one.
