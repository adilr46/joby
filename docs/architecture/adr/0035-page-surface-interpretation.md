# ADR 0035 — Page Surface Interpretation

- **Status:** Accepted — implementation record for [ADR 0031](0031-identity-router-translation-application-pci.md)
- **Date:** 2026-09-04
- **Scope:** `packages/translation/src/execution/surface-*`

## Context

Execution's Application Session (ADR 0034) gave Execution somewhere to hold state for one attempt,
but nothing yet decided *what that attempt needs*. An arbitrary application page carries fields,
questions and mechanical controls in no fixed shape — Joby needed a way to look at one and determine
what it requires, without inventing a taxonomy of portals to do it:

```text
Browser → Portal Context → Execution Surface → Claude → Semantic requirements → Working Application State
```

## Decision

**Page surface interpretation** turns one arbitrary page into structured, grounded requirements on
the session, in four stages, none of which knows what portal produced the page.

### The page is a structured observation, not raw HTML

`PageObservation` — a `url`, optional `title`, and a list of elements described by shape (`kind`,
`label`, `name`, `value`, `options`, `required`, `text`) — is the input this slice accepts. No HTML
parser was added: the repository has none, and a browser adapter (live or fixture) is the natural
place to produce an already-structured observation, the same way `claude-in-chrome`'s page-reading
tool already returns structured elements rather than markup. `buildExecutionSurface` then compacts
that observation into an `ExecutionSurface` — filtering elements with nothing to ground against,
deduplicating by id, truncating long text — as a pure function that reads only element *shape*,
never `url` or `title`. That last constraint is `buildExecutionSurface`'s realization of "no
ATS-specific branching": it is enforced by what the function is allowed to read, not asserted after
the fact.

### Claude is called once, behind a provider-neutral port

`SurfaceInterpreter` mirrors `@joby/identity`'s `CvExtractor` — a `name`, one `interpret` method,
throwing as the normal retryable path. `DeterministicSurfaceInterpreter` is a rule-based offline
double (file uploads and action-labelled buttons/checkboxes are mechanical; a label matching a
supplied fact is known; an open-ended textarea is generated-answer; a required field with no other
signal is user-required; everything else is unclear) — proven against two structurally different
fixture pages in the same test file, because "no branching on portal shape" is a behaviour to test,
not just a rule to follow. `ClaudeSurfaceInterpreter` is the real adapter: `fetch` against the
Messages API, `output_config.format` for structured output, a system prompt that never names a
portal, vendor or ATS and instructs the model to prefer `unclear` over guessing.

### Four kinds, one closed vocabulary, owned by `SessionRequirement`

`known` / `generated_answer` / `user_required` / `portal_operation` is `SurfaceRequirementKind`,
defined in `session.ts` next to `SessionRequirement` rather than in the surface files — the
vocabulary belongs to the type it extends, not to whichever code happens to populate it today.
`SessionRequirement` gained two optional fields, `kind` and `surfaceElementId`, present only on
requirements discovered this way; nothing else in the session changes shape.

### Untrusted output is validated, not merely schema-constrained

`parseSurfaceInterpretationResult` enforces what a JSON schema cannot: every `surfaceElementId` must
be an id that was actually on the surface sent, and every `known` requirement's `groundedFactLabel`
must be one of the facts actually supplied. Either violation rejects the whole result — the same
choice `@joby/identity/extraction/validate.ts` makes for a relation pointing at a phantom item — on
the reasoning that a model willing to invent one grounding claim cannot be trusted on the rest of the
same response. The whole result is discarded and the inspection can be retried; nothing partial or
ungrounded reaches the session.

### Unresolved meaning is represented, never guessed

An element the interpreter cannot confidently classify does not become a forced `user_required` or
silently disappear — it is an `UnclearSurfaceElement`, and the service writes each one into the
session's memory notes by name. This is the acceptance criterion made literal: "unresolved meaning is
represented rather than guessed" names a real branch (`unclear`), not a hope about prompt behaviour.

### The result updates Working Application State and records itself on the session

`SurfaceInspectionService.inspectSurface` looks up the session, builds the surface, calls the
interpreter exactly once, validates the output, then:

- adds every requirement to the session's checklist via a new `addRequirements` method (idempotent
  by id, so re-inspecting the same surface does not duplicate anything already tracked);
- for `known` requirements only, writes the matching fact's value into
  `workingState.portalFieldValues` — the one case where interpretation writes a value rather than a
  checklist entry, and only because the value came from a fact the *caller* supplied, never from
  anything Claude asserted unprompted;
- records one session note summarising the counts by kind, plus one line per unclear element.

## Consequences

- Execution's second real behaviour, alongside the Application Session. `508` tests pass, up from
  `484`: 17 unit (surface compaction, validation, the deterministic interpreter across two fixture
  page shapes) + 7 integration against real PostgreSQL, including a duplicate-inspection test proving
  `addRequirements` does not double-count and a table-touch test proving no `application` row is
  written.
- `tests/translation-boundary.test.ts`'s Execution export pin grew from 6 entries to 12 — the same
  deliberate-growth pattern ADR 0034 established.
- Adaptation and Application are untouched. `generated_answer` requirements are flagged, not drafted
  — routing them to Adaptation for an actual draft is a later integration decision this ADR does not
  make.

## Deliberately not done

- **No live browser wiring.** `PageObservation` is the accepted input shape; connecting a real
  browser adapter (`claude-in-chrome` or otherwise) to produce one is a composition-root decision, not
  part of this slice.
- **No drafting.** `generated_answer` is a classification, not a generated answer — Adaptation still
  owns writing, and nothing here calls it.
- **No submission.** Even a session with every requirement resolved only reaches
  `deriveSubmissionReadiness().ready === true`; actually submitting remains ADR 0034's open door.
- **No HTML parsing dependency.** The repository has none and this slice does not add one — see
  "The page is a structured observation" above.
