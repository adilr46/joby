# Current State

> Fast-moving. Update at CONSOLIDATE, every time. If this file is stale, the loop was not followed.
>
> **Status: active implementation.** Foundations, Identity (Profile Units, Representations, Stated
> Context), Opportunity (capture + understanding), Router, Adaptation, **Application** and
> **Execution** (Application Session, page surface interpretation, surface resolution and
> deterministic action execution, and the recursive execution loop tying them together) run.
> Interview Intelligence prepares evidence-grounded packets, supports temporary rehearsal, parses
> invite platform facts, and routes approved debrief facts to Application. **PCI has its contract but no learning, and
> nothing is wired to call it yet. No submission, no real `JobyQueryPort` adapter, no browser-driving
> loop, and no drafting of `generated_answer` requirements exist.**

> **Terminology:** ADR 0031 is authoritative:
> `Identity (Profile Units · Representations · Stated Context)`, then
> `Opportunity → Router → Translation (Adaptation · Execution · Interview Intelligence) → Application
> → resolved evidence → PCI`. Older entries below are historical records and retain the
> package/domain names used at the time; they do not define active architecture.

**Last updated:** 2026-09-30 (Interview Intelligence prepare/rehearse/debrief slice)

## Current Milestone

**M1 — Durable Identity: complete.** All twelve use cases (UC01–UC12) are done. Durable Identity has
a stable public module interface other Joby Core modules can consume.

Building on it: **Identity Representation, slices 1–3, complete for the placement scope**
(ADRs 0014–0016). A person keeps a Markets lens and a Software Engineering lens over one history,
positions each independently, renders either as a general reusable CV, and offers either to
Adaptation as an optional prior.

M0 — Foundations is done: the repository type-checks, tests, and runs.

## Recently Completed

- **Interview Intelligence prepare/rehearse/debrief slice (2026-09-30).** The first Joby-native
  implementation of the career-ops interview flow is now available without making generated advice
  durable truth.
  - `prepare` creates a versioned, reviewable packet from the current Opportunity revision,
    Application stage, confirmed Profile Units and optional PCI hints. Requirements map to Profile
    Units by confirmed capabilities; unsupported requirements remain explicit gaps.
  - Questions from the posting are marked observed; requirement-derived questions are marked
    inferred. Profile Units render as prompts with missing contribution/consequence called out rather
    than completed into an invented STAR story.
  - `rehearse` produces audience-aware temporary turns and no-score coaching. Platform context
    selects standard, HireVue-modality-unknown, or confirmed-AI guidance.
  - Invite parsing is deterministic and does not infer a lifecycle transition. The authenticated
    Application API now accepts an actual interview observation and a separate user reflection.
  - Deferred: sourced company/process research, transcript extraction and approval UI, question-bank
    accumulation, weekly/friction/latency reporting, and safeguarded red-flag analysis.

- **Application state-first event publication (ADR 0039, 2026-09-13).** `pnpm exec tsc --noEmit`
  clean; focused events tests pass. Application integration tests were selected but skipped locally
  because `DATABASE_URL` is not set.

  Application now publishes events from its own authoritative writes, without turning events into an
  orchestration layer:

  - `recordSubmission` writes `Xₙ` submitted material and records `ApplicationSubmitted` in the same
    transaction.
  - `recordInterviewStage` writes the interview observation and records `InterviewRecorded` in the
    same transaction.
  - `recordOutcome` writes `Yₙ` and records `OutcomeObserved` in the same transaction.
  - `packages/events` owns mechanics — envelope, outbox and dispatch — while Application remains the
    source of Application truth. Handlers may react downstream, but they do not decide or mutate
    Application state.
  - `OutcomeObserved` ownership moved to `application`, matching the implemented `Yₙ` authority.
  - ADR 0033's open publication question is resolved. No replay, event sourcing, command bus,
    ordering feature or bidirectional UI bus was added.

- **Router-owned opportunity decisioning (ADR 0038, 2026-09-12).** `pnpm typecheck` clean; focused
  Router suites pass.

  Router now owns the first deterministic slice of opportunity decisioning:
  `Opportunity Understanding -> Router Evaluation -> Ranking/Tiering -> Policy`. Opportunity stays
  person-neutral; Router reads Identity, Stated Context, Opportunity understanding and PCI priors
  through ports and writes nothing upstream.

  - **Composite evaluation is now allowed only as derived decision support.** `evaluationScore` is
    context-bound, person-specific, comparison-set-specific and inspectable through dimensions,
    weights, requirement assessments, constraint assessments, confidence, uncertainty and version.
  - **MCDA + TOPSIS exists as pure Router math.** The first dimension set is requirement fit,
    trajectory value, development value, constraints fit, representation leverage, market quality and
    pursuit cost; pursuit cost is a TOPSIS cost criterion.
  - **Uncertainty remains separate from quality.** Thin evidence produces low confidence, gaps and
    unknowns rather than a hidden penalty that turns a high-potential opportunity into a mediocre
    score.
  - **Policy is separate from evaluation.** `OpportunityEvaluation` carries no apply/hold/skip action;
    `routeOpportunities` returns `evaluations`, `ranking` and `policy` as separate outputs.
  - **Tiering uses an absolute floor.** A weak comparison set does not produce S-tier merely because
    one opportunity ranks first.
  - **HTTP route:** `POST /routing/opportunities` accepts `personId`, `opportunityIds` and optional
    `comparisonSetId`.
  - **Still not implemented:** learned LTR, contextual bandit training, PCI learning, durable fast
    preference state, semantic capability matching and external market enrichment.

- **Router Opportunity Intelligence gap fill (2026-09-12).** Router's first decisioning slice now
  reflects the Opportunity Intelligence doctrine more closely.

  - **Scores split into `rawScore` and `score`.** TOPSIS produces `rawScore`; calibration may later
    adjust `score`. With no resolved Application calibration history, the diagnostic is
    `insufficient` and `score = rawScore`.
  - **Fixed-ideal TOPSIS.** Dimension utilities are already normalized/inverted, so TOPSIS compares
    them to the weighted ideal `[1,1,1,1,1,1,1]` and anti-ideal `[0,0,0,0,0,0,0]`.
  - **Three evaluation labels.** Router now labels evaluations `strong`, `consider` or `weak`.
  - **Dimension evaluators carry reasons.** Each dimension has value, confidence and reasons rather
    than only a naked number.
  - **One ranking output, multiple projections.** `routeOpportunities` returns listwise `ranking`,
    `tiers` (`Tier 1`, `Tier 2`, `Tier 3`) and `pairwise` comparisons.
  - **Bounded exploration is represented.** Ranking items carry a deterministic v1 exploration
    adjustment, limited to uncertain opportunities and never applied to evaluation itself.
  - **Training observation shape exists.** Router has a rich future observation primitive covering
    person, opportunity, evaluation, decision, representation used, world response, feedback and
    attribution confidence; it is not persisted yet.

- **Opportunity Intelligence sequential slices (2026-09-13).** The eight follow-on slices now exist
  as deterministic or in-memory foundations.

  - **Weight priors and updates.** Router has representation-family priors plus
    `updateWeights(old, evidence, alpha)` and scoped learning rates where application-specific moves
    fastest and overall trajectory moves slowest.
  - **Evaluation history seam.** Router has an append-only `OpportunityEvaluationRun` contract and
    in-memory store, ready for a database-backed repository slice.
  - **LTR v1 primitive.** `LinearLtrModel` trains on pairwise preferences with logistic loss and can
    learn a ranking different from sorting by evaluation score alone.
  - **Named ranking projections.** `rankList`, `projectTiers` and `comparePair` expose the same
    ranking output as listwise, tiered and pairwise views.
  - **PCI slow loop primitive.** PCI now has `CareerObservation`, derives preference,
    accessibility and calibration signals, and includes `SlowLearningPci` with small idempotent
    updates. It still writes no upstream truth.
  - **Still not runtime-integrated:** database-backed evaluation history, empirical calibration from
    Application history, production LTR, automatic CareerObservation construction and
    Claude-mediated feedback interpretation.

- **The recursive execution loop (ADR 0037, 2026-09-04).** `pnpm typecheck` clean; **525/525 tests
  pass against PostgreSQL** (was 518).

  Execution can now recurse across arbitrary surfaces: `Observe → Ground → Act → QueryJoby if needed
  → QueryUser if unresolved → Verify → Repeat`, one step per execution surface.

  - **`step` composes, it does not recurse.** One Observe → Ground → Act → Verify pass over one
    observation, returning `continue` / `waiting_for_user` / `submission_ready` / `needs_repair` /
    `blocked`. A real browser-driving loop calling `step` repeatedly does not exist yet — the same
    boundary ADR 0035/0036 already drew.
  - **Conditional and new requirements need no special case.** A materially different observation of
    the same or a different surface is handled by the same `inspectSurface` call either way — its
    `addRequirements` already only appends what's new.
  - **WAITING_FOR_USER / SUBMISSION_READY / BLOCKED reuse existing execution levels**
    (`awaiting_input` / `ready_to_submit` / `failed`) rather than a parallel vocabulary — all three
    already carried exactly that meaning in `deriveSubmissionReadiness`'s reason text.
  - **Blocked is read from Session Memory, not new state.** Three non-converging validation
    mismatches on the same element (counted from the notes ADR 0036's execution service already
    writes) trips `blocked`; no new persisted counter was added.
  - **The executor must not assume the browser held still.** Every `step` call takes its own fresh
    observation as an argument; resuming a paused session is the caller's job, `resumeSession` then
    `step` again.
  - 7 integration tests against real PostgreSQL: query-only-when-needed, multi-surface traversal,
    pause/resume with fresh observation, repair, blocked convergence, explicit submission-readiness
    detection, no `application` table touched.
  - `tests/translation-boundary.test.ts`'s Execution export pin grew from 17 entries to 18.

- **Surface resolution and deterministic action execution (ADR 0036, 2026-09-04).** `pnpm typecheck`
  clean; **518/518 tests pass against PostgreSQL** (was 508).

  Execution can now satisfy a grounded surface: `Grounded Execution Surface → for each requirement →
  no info needed: act directly / info needed: query Joby → resolved: act, unresolved/ambiguous/
  conflicting: ask user → pause session`.

  - **`JobyQueryPort` — Execution asks, never orchestrates.** A narrow, consumer-side port
    (`resolve(query): Promise<JobyQueryResult>`), the same pattern Adaptation already uses for its
    own Opportunity port. Execution never reaches into Identity/Adaptation/Opportunity/Application
    itself; wiring which module actually answers is a composition-root decision not yet made.
  - **Queried only when needed.** `portal_operation` requirements are mechanical and are filtered
    out before the query loop starts; `known` requirements are never `unresolved` by the time this
    runs (ADR 0035 already resolved them). Only `generated_answer` and `user_required` requirements
    are queried, and each exactly once.
  - **Never a guess.** An `unresolved` answer — `not_found` / `ambiguous` / `conflicting`, three
    distinct reasons — never becomes invented content. It becomes a user clarification, and pauses
    the whole Application Session.
  - **Deterministic action plan, no second model call.** `buildActionPlan` is a pure function:
    element kind maps to `fill`/`select`/`check`/`upload` only — buttons have no mapped action type,
    so submission stays out of this slice exactly as ADR 0034/0035 already decided.
  - **Fresh observation, compared.** After executing through a `PortalActionExecutor`, the portal is
    re-observed and every executed action's expected value is checked against what actually shows;
    a mismatch is a validation failure.
  - **Mechanical noise stays Session Memory.** Resolved, needs-user, executed, failed, mismatched —
    every outcome from both services lands in `recordSessionNote`, never an `application` table,
    proven by an integration test.
  - 4 unit tests (`buildActionPlan`, pure) + 6 integration against real PostgreSQL.
  - `tests/translation-boundary.test.ts`'s Execution export pin grew from 12 entries to 17.

- **Page surface interpretation (ADR 0035, 2026-09-04).** `pnpm typecheck` clean; **508/508 tests
  pass against PostgreSQL** (was 484).

  Execution can inspect an arbitrary application page and determine what it requires:
  `Browser → Portal Context → Execution Surface → Claude → Semantic requirements → Working
  Application State`.

  - **The page is a structured observation, not raw HTML.** No parser dependency was added — the
    repository has none. `buildExecutionSurface` compacts a `PageObservation` into a compact
    `ExecutionSurface` as a pure function that reads only element *shape*, never `url` or `title` —
    "no ATS-specific branching" is enforced by what the function can read, proven against two
    structurally different fixture pages in the same test file.
  - **Claude is called exactly once**, behind a provider-neutral `SurfaceInterpreter` port mirroring
    `@joby/identity`'s `CvExtractor`. `DeterministicSurfaceInterpreter` is a rule-based offline
    double for tests; `ClaudeSurfaceInterpreter` is the real `fetch`-based adapter using structured
    output.
  - **Four kinds, one closed vocabulary owned by `SessionRequirement`:** `known` /
    `generated_answer` / `user_required` / `portal_operation` (`SurfaceRequirementKind`, defined next
    to `SessionRequirement`, not in the surface files).
  - **Untrusted output is validated, not merely schema-constrained.** Every `surfaceElementId` must
    be an id actually on the surface sent; every `known` requirement's `groundedFactLabel` must be a
    fact actually supplied. Either violation rejects the whole result — the same choice
    `@joby/identity/extraction/validate.ts` makes for a phantom relation.
  - **Unresolved meaning is represented, never guessed.** An element the interpreter cannot
    classify becomes an `UnclearSurfaceElement`, written into session memory by name — a real branch,
    not a hope about prompt behaviour.
  - **The result updates Working Application State and records itself on the session.** A new
    `addRequirements` session method appends discovered requirements (idempotent by id); `known`
    requirements alone also prefill `workingState.portalFieldValues`, because that value came from a
    fact the *caller* supplied, never from anything Claude asserted unprompted.
  - 17 unit tests (compaction, validation, the deterministic interpreter across two fixture page
    shapes) + 7 integration against real PostgreSQL, including a duplicate-inspection test and a
    table-touch test proving no `application` row is written.
  - `tests/translation-boundary.test.ts`'s Execution export pin grew from 6 entries to 12 — the same
    deliberate-growth pattern ADR 0034 established.

- **Execution's Application Session (ADR 0034, 2026-09-04).** `pnpm typecheck` clean; **484/484
  tests pass against PostgreSQL** (was 455).

  Execution's first implemented capability: durable, restart-safe, temporary runtime state for one
  application attempt.

  - **Six parts, matching the brief exactly.** Job/company context (opportunity id + revision,
    display-only role/company), portal context (navigation only — `portalKind`, `currentStepId`),
    working application state (Adaptation's `ApplicationIntent` plus portal-only fill-ins), current
    execution level, an unresolved-requirements checklist, and append-only session memory.
  - **Not `Xₙ`.** Working state is provisional and freely superseded; `Xₙ` is Application's,
    immutable, written only once something is actually sent — an act this slice does not implement.
  - **Not Application's `currentState`.** Execution level
    (`not_started → preparing → awaiting_input → ready_to_submit → submitted / failed`) is
    deliberately disjoint from Application's timeline vocabulary.
  - **Submission readiness is derived, never stored** — the same discipline as Application's
    `currentState`, for the same reason: a stored flag is a second place the same fact could
    disagree with itself the moment a requirement resolves.
  - **Create/resume is one operation.** An existing session for `(personId, opportunityId)` is
    returned unchanged; a caller never has to know in advance whether one already exists, and a
    fresher opportunity revision never silently overwrites an attempt in progress.
  - **Pause/resume touches exactly one field.** Everything else — level, working state,
    requirements, memory — survives untouched, so resuming needs nothing recomputed.
  - **No browser or model execution.** Every public method is a state transition; nothing acts
    externally, and `ready_to_submit` is as far as this module goes.
  - **Structurally separate from Application**, verified rather than asserted: no foreign key from
    `execution_session` into `application`, `opportunity`, `adaptation` or `identity`; no column
    carrying a canonical fact, opportunity text or Adapted State content; an integration test proves
    working the session inserts zero rows into `application`.
  - 8 unit tests (readiness derivation) + 21 integration against real PostgreSQL, including a
    fresh-connection reload proving the persisted half of restart survival.
  - Two existing pins updated because they correctly fired on deliberate growth: Translation's
    module-surface pin (Execution went from zero exports to six) and a doctrine test asserting no
    `execution_%` table existed (narrowed to the `application_record` claim it actually meant).

- **Application implemented (ADR 0033, 2026-09-03).** `pnpm typecheck` clean; **455/455 tests pass
  against PostgreSQL** (was 417).

  ```text
  Oₙ = (Pₙ, Wₙ, Rₙ, Aₙ, Xₙ, Iₙ, Yₙ)
  ```

  - **Seven epistemically distinct parts, one row or table each.** `Pₙ`/`Wₙ`/`Rₙ`/`Aₙ` are
    references and revisions in one lineage row — no foreign key into Identity, Representation,
    Opportunity or Adaptation's schemas. `Xₙ` is immutable submitted material. `Iₙ` is three
    append-only streams: timeline, communications, interview stages. `Yₙ` is its own table.
  - **`Aₙ ≠ Xₙ`, structurally.** What Joby produced (`adaptationContextId`, `draftIds`) and what was
    actually sent (`SubmittedMaterial`) live in separate tables. `sourceDraftId` traces sent content
    back to a draft when it came from one; `editedFromSource` says whether it still matches. Material
    with no source draft at all is a supported case — sent, but not from anything Joby produced.
  - **`Xₙ ≠ Yₙ`, structurally.** What was sent and how the world responded are separate tables, so a
    later reader cannot read causation into two facts that merely happened in sequence.
  - **`currentState` is derived, never stored.** A stage correction is a new timeline entry
    `supersedes`ing the one it corrects; the superseded entry is kept. `deriveCurrentState` computes
    the current stage from chronology on every read.
  - **Interview reflections are the person's own account, attached after the observation**, and
    never a system-generated score — nothing here evaluates one.
  - **The resolved-evidence seam toward PCI now has a producer.** `getResolvedEvidence` projects a
    resolved `ApplicationRecord` into `@joby/pci`'s existing `ResolvedApplicationEvidence` shape,
    gated on at least one recorded outcome, keeping PCI's `user_response`/`world_response` signal
    families distinct. **`@joby/application` does not import `@joby/pci`** — producing the seam is
    not consuming it, and nothing is wired to call `pci.observe` yet.
  - **Only meaningful reality is persisted.** No table has a column for a retry, selector, captcha or
    HTTP status — structural exclusion, not filtering, because Execution never writes that detail
    here to begin with.
  - **Two genuine Tier 1 decisions remain surfaced, not guessed:** what counts as "meaningful enough"
    from Execution to enter `Xₙ`/`Iₙ`; and concurrent applications to the same opportunity, which the
    current `(person_id, opportunity_id)` uniqueness does not address. ADR 0039 resolved automatic
    Application event publication.

- **Codebase aligned to the canonical topology (ADR 0032, 2026-09-03).** `pnpm typecheck` clean;
  **417/417 tests pass against PostgreSQL** (was 387).

  - **Opportunity understanding left Translation.** `translation/src/intelligence` is deleted; the
    interpreter, port, validation, repository and service now live in
    `packages/opportunity/src/understanding`. A boundary test fails if opportunity interpretation
    reappears inside Translation.
  - **One set of context types where there were two.** Person × opportunity mapping moved into
    Adaptation — comparing what a posting states against what the person has stated is contextual
    interpretation. The duplicate `OpportunityContext` / `ConditionComparison` set is gone, and its
    19 behavioural tests were rewritten against the new home rather than dropped.
  - **Opportunity depends on neither Identity nor Translation.** `OPPORTUNITY_CONDITION_KINDS` is now
    Opportunity's own vocabulary: what a *posting* may state must not be bounded by what a *person*
    may state about themselves.
  - **Profile Units are canonical, and composed rather than stored.**
    `ProfileUnit = Context + Contribution + Capabilities + Consequence`, where the unit's identity is
    its Activity node and its Context is the Structure it occurred within. **No `profile_unit`
    table**: a stored unit would be a second copy of the person's history, and every Representation
    decision — keyed on canonical node id — would dangle. Reconstruction, confirmation, correction
    and positioning are unchanged.
  - **Router exists** (`@joby/router`, wired at `GET /routing`). It recommends the Representation an
    opportunity should start from, on the same normalised capability equality Adaptation uses. It
    writes nothing, adapts nothing and judges nobody — and **PCI's influence is bounded below one
    covered capability**, so a learned prior can break a tie but cannot promote a lens that covers
    the posting less.
  - **PCI exists as an authority** (`@joby/pci`), replacing `packages/memory`. One `PciModel`
    interface spans the whole intended progression, so a consumer never learns which stage answered.
    `NoLearnedPci` returns empty priors with zero support — the honest answer at the Baseline, not a
    placeholder.
  - **Interview Intelligence exists as a seam** (`@joby/translation/interview`): stage vocabulary,
    four input ports, **zero exported behaviour**. What Prepare produces and what Rehearse evaluates
    are undecided, and a rehearsal that scores someone badly on a guess is a real cost to a person.
  - **Packages removed:** `discovery`, `development`, `network` (placeholders asserting module status
    the topology does not grant) and `memory` (replaced by `pci`). `portal` stays, documented as
    infrastructure used by Execution.

- **Canonical topology recorded (ADR 0031, 2026-09-03).** Documentation only — no source, schema,
  event or public contract changed.

  ```text
  IDENTITY SERVICE (Profile Units · Representations · Stated Context)

  OPPORTUNITY → ROUTER → TRANSLATION (Adaptation · Execution · Interview Intelligence)
              → APPLICATION → resolved evidence → PCI
  ```

  - **Three changes from the previous topology.** Opportunity moves *out* of Translation — it is the
    situation Joby reasons about, not the action taken in response. **Router** is named as the small
    person × world responsibility that selects the starting Representation, which was previously left
    to the caller. **Interview Intelligence** joins Translation as immediate contextual action rather
    than a separate lifecycle.
  - **A Profile Unit** is one coherent professional unit — Context, Contribution, Capabilities,
    Consequence — and is canonical truth. Representations position over it without changing it.
  - **Retained from ADR 0030 in full:** PCI as an independent authority and not part of Identity;
    person-side and world-side signals staying distinct; demand-driven retrieval.
  - **Honest alignment:** Router and Interview Intelligence have no implementation, and Profile Units
    are a framing over the implemented `E = (Structure, Activity, Relations)`. ADR 0031's alignment
    table records this so the diagram is not mistaken for the codebase.
  - Reverberated into `CLAUDE.md`, the ADR index and this file; ADRs 0029, 0030 and 0009 carry
    explicit supersession notes.

- **Dual-stream alignment (ADR 0030, 2026-09-03).** The repository is brought back into line with the
  two-current-state-stream architecture. **Two code corrections, both drift, both now pinned by
  tests.**

  ```text
  PERSON WORLD                     EXTERNAL WORLD
  Durable Identity                 Opportunity
        ↓                                │
  Representation ──────┐        ┌────────┘
                       ▼        ▼
                     Adaptation → Execution → Application → Memory / PCI
  ```

  - **Retrieval is now demand-driven.** Adaptation loaded a full `PermanentIdentityView` on every
    path — including two that only ever read a revision number — and loaded it *before* knowing
    whether the Representation was silent about anything. The module's own comment claimed
    "Durable Identity is consulted only where the lens does not expose something", while the code
    consulted it unconditionally. Now: the Representation loads first, `requiresCanonicalEvidence`
    decides whether the canonical reservoir is needed at all, and `readIdentityRevision` serves the
    paths that only wanted a revision. **`Durable Identity authority ≠ mandatory full-state
    retrieval`.**
    - Pinned by counting reservoir reads: **0 when the lens covers the posting, >0 the moment it does
      not.** The second half matters as much as the first —
      `HiddenInRepresentation ≠ UnavailableToAdaptation`, so a lens that hides something must never
      make it unreachable.
  - **PCI is no longer a Durable Identity component.** The public `DurableIdentity` type carried
    `learned: null`, teaching that PCI is an Identity component awaiting implementation. It is not:
    Memory / PCI owns the learned relational model outright. The field is removed, and the doctrine
    assertions that pinned `learned === null` now pin the ownership fact instead —
    `'learned' in durable === false`.

    ```text
    Durable Identity = truth about PERSON.
    Opportunity      = current model of EXTERNAL WORLD.
    Memory / PCI     = learned model of PERSON × WORLD.
    ```

  - **The person-side / world-side signal split is now recorded** in `packages/memory/README.md`
    before Memory is built. `User preference ≠ external effectiveness`: someone liking a framing is
    not evidence it works, and one authority interpreting both families is not permission to merge
    them.
  - **ADR 0030 added to the repository.** It had been decided but never recorded, so the repository's
    authoritative architecture (0029) still taught that Durable Identity holds PCI. Governing docs
    updated with it: root `CLAUDE.md`, `JOBY_MEMORY.md`, both Identity docs, the Memory README and
    the ADR index.
  - **Verified aligned, no change needed:** Representation stores decisions keyed by `node_id` and no
    facts (not a fact store); Adaptation stores references and revisions, not copies; Execution owns
    no state and no Application tables exist; `adaptation_application_input` is Adaptation's own
    elicited input, not Application state; no cross-owner mutation path.
  - `pnpm typecheck` clean; **387/387 tests pass against PostgreSQL** (was 379 — 8 new retrieval
    tests).

- **Opportunity capture and understanding — UC01/UC02 (plan `020`, ADR 0028, 2026-09-02).**
  **A placement student can hand Joby the posting text they copied or the email a contact forwarded,
  and get back a structured reading of the role, company, requirements, conditions — and what the
  evidence did not say.**
  - **Capture retains what was given, exactly.** Immutable evidence with per-item provenance; the
    repository has no UPDATE or DELETE at all. Re-capturing the same bytes is one piece of evidence,
    not two. Several pieces of evidence accumulate against one opportunity.
  - **An Opportunity is not a JobPosting.** No required url, deadline, salary or posting shape.
    A forwarded email and a note from a conversation are first-class, because that is how placement
    opportunities actually arrive.
  - **Raw and interpreted are separated structurally**, not by convention: two table namespaces,
    no foreign key between them, no cross-writes, and the understanding partition reaches evidence
    only through a read-only public port. Separate retrieval paths, so no response mixes them.
  - **Absence is preserved and named.** A field the evidence never stated is absent and reported in
    `uncertainty`; a field the posting raised and refused to answer (`TBC`) is reported *differently*;
    a stated value is verbatim. Those three are distinguishable, which is the point. `Flexible` is
    treated as the answer it is, not as a refusal.
  - **Nothing is inferred.** A posting that mentions Python in prose yields no requirement.
    Requirements stay separate from preferences.
  - **Interpreter output is untrusted input.** Every attribution entry must begin with `[evidenceId]`
    resolving to evidence this opportunity holds, and `content` has a key whitelist — so
    "every claim traces back to evidence" and "no person in this table" are enforced rather than
    intended, and survive a model-backed interpreter replacing the deterministic one.
  - **The reading is the External World stream Adaptation reads** (ADR 0030). The in-memory
    `SuppliedOpportunityUnderstanding` placeholder and its `PUT /adaptation/opportunities/:id` route
    are **deleted**: they were a second answer to "what is opportunity X" sharing a revision space
    with the stored one, so an `adaptation_context.opportunity_revision` could silently resolve to a
    different document than the one it was built against.
  - **Revisions are honest.** Unchanged evidence produces no new revision; new evidence produces a
    new one and the prior reading stays retrievable, because an Adaptation Context records the
    revision it was built from. Concurrent readers collide loudly and resolve idempotently.
  - **No person-specific judgement.** No `person_id` column in any of the three tables, no fit, no
    ranking, no recommendation, and `mapOpportunityToPerson` is unreachable from any capture or
    understand route.
  - `pnpm typecheck` is clean and **379/379 tests pass against PostgreSQL**.
  - **Not addressed, and not oversights:** unbounded request body before the 2 MB check; evidence
    served with a caller-influenced content type including `text/html`; **no owner, authorisation or
    erasure path** on captured evidence, which admits forwarded emails about third parties — that one
    is a doctrine decision needing an ADR before a second user exists.

- **Canonical architecture migration (ADR 0029, plan `021`, 2026-09-01).** Architecture and
  documentation only; no behavior, schema, DTO, event or runtime contract changed.
  - Product architecture is now **Career Workspace → Translation Layer → Application → Career
    Memory**. Umbrellas are not semantic owners, packages or deployment units.
  - Career Workspace contains Durable Identity and Identity Representation. Translation Layer
    contains Opportunity, Adaptation and Execution. Application owns the live and historical career
    interaction. Career Memory interprets resolved history; PCI remains its slow output, governed in
    Durable Identity when recorded as person-state.
  - The fast loop adapts the current Application. The slow loop adapts Joby's future expectations.
    Mechanical Execution noise remains excluded from learning input by default.
  - The current layout mismatch is explicit: `@joby/opportunity` captures evidence while legacy
    `@joby/translation/intelligence` stores understanding. They are two implementation partitions of
    one Opportunity semantic authority and still collaborate only through public capabilities.
  - `packages/portal` is an infrastructure adapter; Execution owns external-system semantics and
    operational state.
  - ADRs 0023–0027 are superseded by ADR 0029 for topology and ownership. Their retained modularity,
    seam and no-cross-write constraints continue through ADR 0029.
  - Code comments that expressed semantic ownership now name Opportunity while preserving legacy
    identifiers and compatibility paths. `pnpm typecheck` is clean and **369/369 tests pass against
    the real PostgreSQL service**.

- **Career Memory aligned to Translation (ADR 0027, plan `019`, 2026-09-01).** **Documentation and
  architecture only — no source, schema, DTO, event, route or test changed.** The slow path now has
  one stated direction:

  ```text
  Intelligence → Adaptation → Execution → Application → Career Memory → PCI  [historical; superseded by ADR 0029]
                                                                         └──→ future priors
  ```

  - **Application is the temporal handoff.** It preserves the meaningful Translation state actually
    used — the Opportunity Intelligence relied upon, the Application Intent and representation state
    acted upon, and the final Execution/submission state — plus later factual outcomes. **Preserving
    is not authority:** Application snapshots historical reality and mutates no Translation state.
  - **Career Memory consumes resolved history, never live Translation state.** An application in
    progress is a fast-loop concern; only what Application has already resolved may enter the slow
    loop. Career Memory reaches no upstream table and no module publishes live state to it.
  - **Mechanical execution detail is excluded by default.** Retries, selectors, dropdown failures,
    captchas and transient portal errors describe a portal, not a person. One becomes history only
    where a use case explicitly establishes it is meaningful — **never because it was logged.**
  - **Nothing flows back up.** Career Memory does not rewrite past Applications, Translation state,
    Durable Identity or Identity Representation. Its output is a justified *proposal*; Durable
    Identity records resulting person-state through its own governed boundary, and a generalized lens
    improvement stays a user-governed proposal to Identity Representation.
  - **PCI returns as a prior read, not a write.** Future Intelligence and Adaptation read held PCI
    through Durable Identity's public read boundary — the same way Adaptation already reads `E`, `X`,
    `L` and a representation prior. No Translation module writes PCI.
  - **No learning logic exists.** No aggregation, attribution, scoring, threshold, DTO, event, table,
    worker, handler or repository was added, and no public surface changed. Existing events remain
    notifications rather than copied object graphs.
  - The ADR index gained rows and prose for ADRs 0025–0027; the 0025/0026 prose had been left inside
    the "When to write one" section and was moved to where it belongs.
  - `pnpm typecheck` is clean and **329/329 tests pass against PostgreSQL** — unchanged, which is the
    point.
  - **Still unresolved and deliberately not invented:** the resolved-history shape and snapshot
    references, the meaningful-vs-mechanical rule for final Execution information, the
    Adaptation → Memory insight handoff (ADR 0013), and Durable Identity's governed capability for
    accepting a justified PCI proposal.

- **Translation fast-feedback information seams (ADR 0026, plan `018`, 2026-09-01).** Three
  type-only seams now make the operational loop structurally expressible: Opportunity Intelligence
  from Intelligence to Adaptation, Application Intent from Adaptation to Execution, and semantic
  Fast Feedback from Execution to Intelligence and/or Adaptation. Producers and consumers declare
  structurally compatible local views and siblings still import no siblings. Execution exports no
  mechanical feedback vocabulary; no behavior, mutation capability, event, persistence, routing or
  algorithm was added. `pnpm typecheck` is clean and **329/329 tests pass against PostgreSQL**.

- **Translation semantic ownership (ADR 0025, plan `017`, 2026-09-01; superseded by ADR 0029).** Intelligence then owned
  opportunity understanding, person mapping and relationship evaluation; Adaptation owns how
  existing truth is represented; Execution owns carrying intent through external systems and
  reacting to mechanical feedback. The existing exact condition mapping moved from Adaptation to
  Intelligence with no new evaluation behavior. Adaptation consumes the result through a narrow
  capability, and the supplied-understanding HTTP compatibility route moved out of its handler while
  retaining the same path and responses. Adaptation now owns its concurrency error instead of
  importing Identity's. Execution remains an empty seam. `pnpm typecheck` is clean and **324/324
  tests pass against PostgreSQL**.

- **Translation as an enclosing module boundary (ADR 0024, plan `016`, 2026-09-01; superseded by ADR 0029).**
  **Structural only — no behaviour changed anywhere.**

  ```text
  TRANSLATION  (packages/translation — owns nothing itself)
  ├── Intelligence   seam, zero exports
  ├── Adaptation     moved verbatim from packages/identity/src/adaptation
  └── Execution      seam, zero exports
  ```

  - **Historical physical boundary:** Translation enclosed and owned no behaviour, tables, events or public interface of
    its own, and **no root export** — there is no `@joby/translation`, only
    `@joby/translation/adaptation`, `/intelligence`, `/execution` and `/testing`. A root export would
    make the boundary permeable in one line.
  - **An enclosing boundary is not a shared interior.** The three modules are as separate from each
    other as from Opportunity or Application; no sibling imports a sibling, and a test enforces it.
  - **Not a service.** ADR 0023's terminology and distribution rule are untouched: no transport, no
    network call, no runtime added.
  - **Adaptation moved verbatim** — behaviour, public surface, `adaptation_*` tables, migrations,
    ports and doctrine unchanged. ADRs 0013, 0018, 0019 and 0022 govern it exactly as before.
  - **Its read boundary got stronger as a side effect.** A deny-list of 13 Durable Identity filenames
    became an allow-list of two public entry points, because across a package boundary the relative
    reach is not spellable. Two test files that reached `../model` now import `@joby/identity`.
  - **Intelligence and Execution are seams pinned at zero exports.** Entry point, README, registered
    resolution and enforced import rules — no types, interfaces, factories, ports, tables, scoring,
    evaluation or persistence. A placeholder contract is a product decision made by whoever was
    fastest, so there is none.
  - **`@joby/identity/adaptation` no longer exists;** consumers use `@joby/translation/adaptation`.
    `FakeOpportunityUnderstandingPort` moved to `@joby/translation/testing`. The legacy README-only
    `packages/intelligence` and `packages/execution` placeholders were deleted.
  - `pnpm typecheck` is clean and **324/324 tests pass against PostgreSQL**, including 8 new
    Translation boundary assertions.
  - **Two ownership questions are open and were deliberately not answered:** Intelligence vs
    Opportunity (ADRs 0007, 0023), and Execution vs Application/Portal (ADR 0023). Neither may be
    resolved by writing code into a seam.

- **One modular core with strongly owned modules (ADR 0023, 2026-08-16; topology superseded by ADR
  0029).** At the time, Joby's governing topology was Durable Identity, Identity Representation, Adaptation, Opportunity, Application, Portal and
  Memory inside one Joby Core. Modules own behavior and tables, expose public interfaces, and never
  access one another's internals. One PostgreSQL database remains the initial data topology;
  web/API/worker remain operational runtimes rather than domain boundaries. ADRs 0001 and 0012 are
  superseded. Independent distribution now requires demonstrated evidence and a new ADR.

- **Stated Context semantic decision rewrite (ADR 0011, plan `012`, 2026-08-16).** Documentation
  only; no source, schema, DTO, route or test changed.
  - Explicit State retains ADR 0009's meaning: `E = (Structure, Activity, Relations)`, reconstructed
    professional reality. Stated Context `X_t` is distinct Durable Identity-owned canonical context.
  - `X_t` is persistent current user-stated operating context; only explicit user create/change/
    removal changes it, and absent means unknown / not stated.
  - Adaptation UC03 is now safe to assume `C_user = RetrieveRelevant(X_t)` through Identity's
    read-only public boundary. It never writes X.
  - No taxonomy, schema, DTO, endpoint, history/versioning, override, learning, UI or event decision
    was locked. ADR 0017 is superseded because it over-specified those concerns.

- **Stated Context implementation slice (plan `011`, 2026-08-15; product semantics now governed by
  rewritten ADR 0011).** **The user can now maintain
  current professional operating context, and Adaptation can retrieve it without gaining a write
  path.**
  - Identity persists optional Career Direction, Preferences, free-form Constraints and the small
    comparable placement set: location, duration, working arrangement, start date, work
    authorisation, sponsorship and availability. These are current implementation choices, not the
    complete taxonomy or representation fixed by ADR 0011.
  - Missing remains absent and means unknown / not stated. Partial commands preserve omitted fields;
    `null` or an empty list explicitly removes a field. No value defaults to false or unrestricted.
  - The canonical command is user-attributed, revision-guarded and transactional. Empty commands,
    duplicate condition kinds and malformed values are rejected. A semantically idempotent command
    advances no revision and emits no `IdentityUpdated` event.
  - Adaptation Module 1 (UC01–UC04) stores only context references and revisions, re-reads canonical
    Stated Context, and surfaces the intersection. Free-form constraints remain uncompared.
    `blocksApplication` is always `false`; there are no hard/soft levels, priorities, weights,
    ranking or eligibility verdicts.
  - `pnpm typecheck` is clean and **254/254 tests pass against PostgreSQL**, including persistence,
    partial update, removal, idempotence, uncertainty, non-gating and Adaptation non-mutation.

- **Written representation — UC10/UC11 implemented (ADRs 0021, 0022, plan `015`, 2026-08-16).**
  **Joby writes application answers and cover letters — and asks rather than inventing.**
  - **The elicitation loop runs.** A cover letter request with no stated motivation returns
    *questions*, not prose: `needs_input` is a designed outcome. Answer one, reassess, still not
    ready, answer the other, then a draft. **No cap on the loop**, and the gate reports
    `provisional: true` because its algorithm is still an open decision.
  - **Fit is not motivation, enforced.** The fixture person's evidence matches the role well; the
    generator still refuses until they say why they want it and why now.
  - **Unsupported claims are reported, never elicited.** A question about Rust — which nothing in
    their confirmed history records — yields a draft with no Rust claim and `unsupported: ['Rust']`.
    Joby does not ask them to assert it: being told in a chat box is not confirmation.
  - **Grounding is validated, not trusted.** Writer output is untrusted input, like extractor output.
    A segment citing a node outside `A^C`, a motivation the person never gave, or an ungrounded
    assertion is **refused before storage**. The old cover letter in the fixture claims "I led the
    entire trading desk"; it reaches Explicit State nowhere and appears in no output.
  - **Representation References are Identity Representation-owned expression material** with their own table and
    **no reconstruction path** — adding two scheduled zero jobs. Deduplicated by checksum, removable
    by the person.
  - **Both surfaces share one opportunity's elicited input**, so nobody is asked twice why they want
    the same job and two generators cannot invent separate motivations.
  - **Drafts persist; canonical state does not move.** Edits are guarded by draft revision and kept
    *beside* what Joby wrote. No `E`/`X`/`L` write, no event, no PCI, no learning from edits.
  - **Generation is not submission.** No `submitted` column exists to set, and no Application Record
    is created — while the draft carries what a later one will need to freeze.
  - **310 tests pass** (was 281): 17 unit, 12 integration. Six pinned assertions were deliberately
    widened.

- **Written representation doctrine — UC10/UC11 (ADRs 0021, 0022, 2026-08-16).** Documentation pass
  that preceded the implementation above.
  - **Representation References** are persistent user-owned *expression* material — writing samples,
    previous letters and answers. Identity Representation-owned, and like a professional source **never canonical
    identity**: nothing reconstructs from one, and no claim may cite one as its grounding. The
    supplied doctrine placed them "within Explicit State" while also forbidding them from
    establishing facts; ADR 0021 resolves that explicitly rather than silently — they sit beside
    professional sources, outside `E`, `X` and `L`.
  - **Elicitation over fabrication.** Where meaningful intent, motivation or disclosure is missing,
    Joby asks and keeps asking. **Fit is not motivation** — that a role suits someone is not evidence
    they want it, and writing enthusiasm they never expressed is a lie in the first person that costs
    them in an interview.
  - **Four placeholders recorded as unresolved, and forbidden from being invented in passing:**
    `SatisfactionGate`, `ResolveReferenceConflict`, `RepresentationPerformanceSignal`,
    `UpdateRepresentationLearning`. No thresholds, confidence values or completeness scores. When the
    gate is built, the safe failure is to keep asking.
  - **The Application Record scope for written material:** artifact, framing, evidence used,
    meaningful edits, question, progression — **not** every attempt or micro-edit.
  - **Progression is observational.** `Progression ≠ proof of success`, `Rejection ≠ proof of
    failure`, read at the application-package level. Recorded now so that "we always meant this to be
    causal" is not available later as a reinterpretation.
  - **UC10/UC11 behaviour is not implemented** — the satisfaction gate is the blocking decision.

- **Adaptation Slice 2 — context adaptation (ADR 0019, plan `014`, 2026-08-16).**
  **Joby now adapts a person's material to one opportunity, starting from the lens they maintain.**
  `P_i(E_t) -> Assess -> Recover(E_t, C) [optional] -> A^C`.
  - **Representation-first.** The selected lens is the default adaptation surface; Durable Identity is
    the fallback reservoir, consulted **only** where the lens is silent about something the posting
    asks for. `recoveryUsed` is reported, so "your positioning already covered this" is observable
    rather than assumed. Re-solving the whole identity per posting would make the lens decorative —
    and the lens is the thing the person actually maintains.
  - **Relevance is canonical capability equality, and nothing cleverer.** An element speaks to a
    requirement when the activity's own `Capability` component matches it under normalisation. No
    synonyms, no substring guessing, no similarity scoring: "your rota scheduler shows Python" must
    mean the person confirmed Python on it. An ask nothing in their history records comes back as
    **`unevidenced`** — thin evidence is a real answer, and filling the gap would be invention.
  - **Assessment is representational, never evaluative.** What the lens exposes, understates, or is
    silent about. No score, rank, fit judgement or pursue verdict — that is Intelligence's (ADR 0007),
    and a test asserts the assessment carries no scoring vocabulary. De-emphasis is phrased as
    "nothing this posting asks for is recorded against it", never "irrelevant".
  - **Recovery is gap-driven and capped.** Evidence speaking to nothing this opportunity asks about is
    never pulled in, however impressive. Recovered material arrives exactly as Explicit State records
    it, carrying `origin`, `nodeId`, `canonicalTitle` and a rationale.
  - **Nothing mutated, nothing dropped.** Recovering what a lens hides does not un-hide it; an element
    this posting ignores stays in `A^C`, ordered behind what it asks about. No `E`/`X`/`L` write, no
    lens write, no event.
  - **`A^C` is composed on request, never stored** — so it cannot drift, and ADR 0013 §10's retention,
    refresh and versioning questions stay deferred. The revisit trigger is precise: **user edits
    (UC12)**, which cannot be recomputed from inputs.
  - The read-time projection now surfaces each activity's canonical **capability components** per
    entry — the `Capability` component of `aᵢ`, surfaced rather than derived.
  - **UC09 — the CV representation path is a seam, and the policy is deferred.** Whether an
    application should **reuse** the lens's general CV, **adapt** it, or produce a **distinct**
    role-specific document is an open product decision. `CvRoutingPolicy` holds the place;
    `ProvisionalCvRoutingPolicy` returns one constant marked `provisional: true` and **decides
    nothing** — a test asserts the answer does not vary with recovery, gaps or a missing lens,
    because a condition that varied it would be the product decision invented rather than made. No
    routing variables, thresholds, weights, confidence, scoring or calibration exist. The path is
    deliberately *not* part of `A^C`, so a future policy needs no redesign.
  - **281 tests pass** (was 254): 19 unit over the pure assess/recover/compose functions and the
    routing seam, 8 new integration proving both paths against real Postgres.

- **Adaptation Slice 1 — context interpretation (ADR 0018, plan `013`, 2026-08-16).**
  **The first Adaptation behaviour runs.** `P_i(E_t) + C_opportunity + C_user → Adaptation Context`.
  - **The context stores four references and two revisions.** No role, company, requirement or
    condition column: everything is re-derived on read, so an edited condition changes the same
    context's reading with no refresh path and nothing to go stale. Proven live — a context created
    *before* the person stated anything read completely differently afterwards, same id.
  - **Four outcomes, because there are two different silences.** `aligned` · `conflict` ·
    **`uncertain`** (the person stated a condition and the posting did not answer it — the actionable
    unknown) · **`neutral`** (the posting states something they have no view on — information, not a
    problem). Merging them would either bury the questions worth asking or read silence as
    acceptance. **A missing user condition stays unknown**: never assumed acceptable, never a problem.
  - **Comparison is normalised-text equality and nothing cleverer.** "Greater London" does not
    silently satisfy "London"; a near-miss stays a conflict, because a wrong match is invisible to the
    person it misleads. The posting's own uncertainty and the person's free-text constraints travel
    verbatim, unmapped onto any kind.
  - **Adaptation never reads a job description.** Understanding arrives through the consumer port or
    the context does not exist (422, not a fallback to parsing). Until Intelligence is built,
    `apps/api` holds an in-memory stand-in that accepts *structured* understanding and **rejects raw
    posting text** — one file, nothing persisted, deleted when Intelligence's adapter is wired.
  - **`C_user = Retrieve(X_t)`, never `Infer(CurrentMoment)`.** The reader port has no write method,
    so Adaptation cannot maintain conditions even by accident.
  - **Exported from `@joby/identity/adaptation`**, separate from the Durable Identity contract:
    sharing a package must not mean sharing a surface. Adaptation reads Identity through the same
    public contract Execution or Memory would use.
  - **Nothing canonical moves.** No `E`/`X`/`L` write, no revision change, no event; a lens supplied
    as a prior is untouched, and a lens belonging to another person is refused.
  - **254 tests pass** (was 253): 18 unit over the pure comparison, 18 integration, 4 architecture —
    the last pinning that the module queries only `adaptation_context`, imports no adjacent domain or
    Identity write surface, and contains no scoring or gating vocabulary.

- **Identity Representation — slice 3, materialization and the Adaptation prior (ADR 0016, plan
  `010`, 2026-08-15).** **A lens is now observable and consumable, and Identity Representation is
  complete for the placement scope.**
  - **UC09 — a general CV.** `Identity Representation → CvDocument → LaTeX → PDF`. `CvDocument` is
    the schema; **LaTeX is a renderer downstream of it**, never the domain model. One
    server-controlled template, **no user-authored LaTeX**, every value escaped in a single pass, and
    the compiler run with shell escape disabled — LaTeX is a programming language and Joby compiles
    the output on its own machine.
  - **Nothing derived is stored.** No document table, no PDF bytes. A render is derived from current
    Explicit State plus the lens, so a correction appears in the next CV with nothing to invalidate —
    and Joby never holds a stale copy of someone's history in a binary.
  - **The CV is general.** Nothing in the path takes a JD, employer or posting:
    `ReusableMarketsCV ≠ BarclaysSubmittedCV`. Tailoring is Adapted State; what was sent is
    Execution's Application Record.
  - **The header is caller-supplied presentation input.** Joby holds no name for the person (ADR
    0010), so one is printed and not stored, never inferred into person-state. Rendering makes that
    gap visible rather than papering over it.
  - **UC10 — the lens as an optional prior.** `Aᶜ = T(E, X, L, C, Pᵢ)`. `Pᵢ` carries the lens's
    themes and preferences keyed by canonical node id, and **no professional evidence at all**: a
    consumer holding only a prior cannot say what any node *is*, so it must read Durable Identity.
    That is what makes `Aᶜ = T(Vᵢ, C)` unwritable by accident rather than merely discouraged.
  - **Hiding travels as a preference, not an absence.** A set-aside fact appears with
    `suggestedInclusion: false`. Dropping those entries is the single change that would turn the
    prior into an evidence whitelist — and it would look like a harmless filter in review.
  - **UC11 — the learning path is recorded and unbuilt.**
    `Application history → Memory → personal learning → representation improvement → better prior`.
    Constraints fixed now: Memory decides what history justifies learning; a generalized improvement
    is a **proposal to the user** through the Slower Learning Loop; and **Adaptation may never write a
    lens.** The contract exposes no such path.
  - **216 tests pass** (was 192). The escaping test caught a real bug mid-slice — chained
    replacements were re-processing `\textbackslash{}` — now a single-pass table.
  - **Verified live**: a shaped Markets lens rendered a LaTeX CV with its framing in bold, its themes
    line, and the hidden degree absent, while that same degree stayed in the Permanent Identity View
    with its provenance intact. `?format=pdf` returned 503, because no toolchain is installed here.
  - **PDF compilation has never run against a real LaTeX installation** — see Known Issues.

- **Identity Representation — slice 2, generalized positioning (ADR 0015, plan `009`, 2026-08-15).**
  **A lens now positions.** `Eₜ + Decisionsᵢ → Vᵢ`.
  - **UC05–UC08 in one decision model.** One row per (lens, canonical fact): `included` (select or
    hide), `priority` (sparse rank, lower is higher), `emphasis`, `framing` (context-independent
    wording). Plus ordered lens-level **positioning themes** — "quantitative reasoning",
    "decision-making under uncertainty" — in their own table.
  - **Decisions name facts; they never carry them.** `node_id` is a foreign key to
    `identity_explicit_node`, and the service refuses any node that is not this person's. No label,
    contribution, capability, consequence or date is copied anywhere. **`identity_representation`
    gained no columns**, so slice 1's pinned column list still passes untouched — the cheapest proof
    the lens row never became a profile.
  - **A lens is a prior, not a boundary.** `HiddenInLens ≠ UnavailableToAdaptation`. Hiding writes a
    decision row and nothing else; the read model returns the **ungoverned canonical projection**
    beside the positioned view; hidden evidence comes back flagged and sorted last, never dropped.
    A positioning choice made months ago must not censor the evidence a specific opportunity needs.
  - **Framing presents truth, never replaces it.** `canonicalTitle` travels beside `framing` on every
    entry, so "constraint solving under operational uncertainty" always shows "Rota scheduler"
    underneath.
  - **Emphasis and priority stay separate signals.** De-emphasising is not demoting; merging them
    would make one of them unexpressible.
  - **Concurrency is the existing mechanism.** Every positioning write supplies the lens revision and
    bumps it in the same transaction; a stale caller gets `ConcurrencyError`, which moved to its own
    module so a non-canonical module can use it without importing a canonical write surface.
  - **A decision survives a correction to the fact it is about** — it was never about the label — and
    **disappears with the fact** when the person removes it, so a removed fact cannot reappear
    through a lens.
  - **192 tests pass** (was 170). 8 are unit tests over a pure `E + Decisions → V` function, which is
    where "the lens cannot invent evidence" and "the lens is not a filter" are actually provable.
  - **Verified live** against `apps/api` + `apps/worker`: position → theme → read, 409 on a stale
    revision, 422 on an ungrounded decision, and the hidden degree still present in the canonical
    projection of the same response.
  - **Deliberately not built:** skill-level positioning (skills aggregate, so there is no single
    canonical node to key a decision to), rendering, positioning history, and any *inference* of
    positioning from past applications — that needs the learning system, and a prior drawn from two
    applications is a conclusion from nothing.

- **Identity Representation — slice 1 (ADR 0014, plan `008`, 2026-08-15).**
  **A person can now keep named, reusable lenses over their identity.** `Vᵢ = Pᵢ(Eₜ)`.
  - **A third boundary inside Identity**, `src/representation/`: Durable Identity (canonical) ·
    Identity Representation (persistent, non-canonical) · Adaptation (temporary, opportunity-bound).
  - **It stores a lens, never a fact.** `identity_representation` holds a name, a purpose, ownership
    and a revision — nothing else, and the column list is pinned by a test. Content is projected from
    R at read time by **the same function** the Permanent Identity View uses. So there is nothing to
    synchronise, nothing to invalidate, and no way to drift: a correction reaches every representation
    of that fact on the next read.
  - **Three capabilities on the contract** — `createRepresentation`, `listRepresentations`,
    `getRepresentation`. The contract went from nine to twelve; that widening is argued in ADR 0014
    and re-pinned in the export test, so the next one has to be argued too.
  - **Non-canonical is structural, not a promise.** The module holds a two-method read port
    (`findPerson`, `projectIdentity`) and no canonical repository or transaction — it cannot write
    person-state. An architecture test also pins that it names exactly one table, its own.
  - **No event.** `IdentityUpdated` means a confirmed change to canonical Explicit State; choosing a
    lens is not a change to the person's history.
  - **Not Stated Context, not Adapted State.** A lens is not a claim about career direction and never
    writes `X`; no opportunity, JD, requirements or company may enter one. The purpose field is
    deliberately opaque free text — no taxonomy of industries or functions, for the same reason the
    free-form parts of `X` remain open-ended.
  - **Vocabulary split, because "representation" was already taken:** an **Identity Representation**
    is the persistent lens; a **contextual representation** is Adaptation's tailored CV or answer.
    The full term is used everywhere, in prose and in code.
  - **170 tests pass** (was 153). The new ones test the risk, not the feature: follows a correction
    with no write of its own; empties when the facts are removed; two lenses show one corrected fact;
    every entry resolves to a canonical node id; an unconfirmed identity projects nothing.
  - **Verified against the real runtimes.** A representation created *before* anything was confirmed
    showed the person's education and projects after confirmation, over HTTP — derivation at read
    time, proven outside the test harness.
  - **Deliberately not built:** selection/hiding, ordering/emphasis, persistent wording edits,
    rendering, synchronisation, submission. When persistent user *decisions* arrive they get their own
    rows keyed by canonical node id, so a decision never becomes a fact.

- **Adaptation current-decision alignment (ADR 0013, plan `007`, 2026-08-15).** Documentation only —
  **still no Adaptation behaviour.** ADR 0012's ownership decision is unchanged and now *extended*.
  - **The Identity read is broad; the authority is not.** Adaptation receives a broad canonical
    snapshot of `R`, `X`, `L` with provenance and visibility, and does contextual selection itself.
    **Identity must not pre-select evidence for a role** — that would move relevance into the domain
    that owns what is *true*, and force a retrieval abstraction before any slice needs one. ADR 0012's
    "narrow Identity reader" now reads as narrow in **authority**, not scope.
  - **Adapted State continues across the active application cycle**, as the current stage-specific
    contextual state — not one task context. Pre-application it is primarily system-generated with
    optional user edits; post-application each stage enriches it and its role shifts from
    representation to preparation. Its authoritative state now explicitly includes representation
    state/drafts and **stage-specific contextual interpretation**.
  - **A user edit changes the state, not the document.** Wording, emphasis, positioning, ordering,
    inclusion/exclusion, or how a specific experience is interpreted here — all update the current
    Adapted State so later representations stay consistent. Still no `E_t -> E_t+1`, still no
    `L_t -> L_t+1`.
  - **Historical ownership, superseded by ADR 0029:** this slice described the Application Record as Execution-owned. Submitted
    CVs, answers, communications and other externally completed actions are immutable historical
    reality; a submitted CV does not change when Adapted State does.
  - **A new seam, facts only:** `Result -> Application Record -> Adapted State`. Recorded factual
    results may automatically become context. Execution gains no authority over Adapted State and
    Adaptation none over the record.
  - **Stage insights are user-governed — accept / edit / decline / challenge.** An interpretation the
    user never saw would be an unchallengeable claim about them at their most vulnerable moment. An
    accepted or edited insight stays **operational Adapted State and is not PCI**, and is not evidence
    for it.
  - **The separation this exists to protect:** Application Record = what happened · Adapted State =
    current contextual response to what has happened · Memory / PCI = what accumulated resolved
    history eventually justifies learning. *Joby acts quickly, records continuously, learns slowly.*
  - **Five decisions stay deferred and are named as deferred in four places** (ADR, doctrine, module
    README, Identity stop conditions): result-vs-insight classification rules, Adapted State
    retention/versioning, the Adaptation → Memory handoff, persistence mechanics, refresh triggers.
    None is resolved in code.
  - **The post-application behaviour is not decomposed.** UC01–UC12 cover the pre-application cycle;
    stage results and insight governance have no use cases yet. That is the next decomposition task,
    not an implementation licence.
  - The Adaptation architecture test's forbidden-import list now also covers `factory`, `runtime` and
    `github/ingestion` — composition entry points are indirect write access. **153 tests still pass.**

- **Identity Slice 4 — the public interface (plan `006`, completed 2026-08-14).**
  **The exported surface went from ~90 names to 12 values plus types.**
  - **Three entry points, split by who is asking.** `@joby/identity` — the `Identity` contract for
    other domains. `@joby/identity/runtime` — composition for `apps/api` and `apps/worker`: the
    class, model adapters, GitHub source acquisition. `@joby/identity/testing` — `FakeGitHubClient`,
    which had previously been exported from the **production** surface.
  - **`src/contract.ts`** defines the nine UC12 capabilities. `IdentityService implements Identity`,
    so the compiler enforces they cannot drift apart.
  - **No bare `createPerson`.** UC12 says "create or locate", but ADR 0010 says the Person exists
    from the first captured source — `captureSource` establishes, `getPerson`/`getDurableIdentity`
    locate. A create-without-a-source method would contradict an accepted ADR to satisfy a wording.
  - **GitHub selection is deliberately not in the contract** — no domain consumes it, so it would be
    the speculative API the slice exists to avoid.
  - **Removed from the public surface:** `IdentityService`, `GitHubIngestionService`,
    `classifyAgainstState`, `projectPermanentIdentityView`, `parseProposalContent`,
    `extractFromRepository`, `normaliseLabel`, `changesState`, `EMPTY_PROPOSAL`, the model adapters,
    and the test double.
  - **The boundary is pinned by tests, not convention.** The exact value-export list is asserted;
    internals are asserted absent; `package.json` is asserted to publish **no wildcard subpath**
    (a `./*` entry would make `@joby/identity/src/repository` importable and undo the slice); app
    source is scanned for `identity_*` SQL and internal imports.
  - **A downstream-consumer simulation** exercises all nine capabilities typed as the contract —
    capture, inspect, confirm, read E, trace provenance, correct, read D, project the view.
  - **The View proven derived:** a correction to E changes the projected section with no separate
    write, and removing the facts empties it — where a parallel store would still hold the person's
    education.
  - **153 tests pass** (was 129). Both runtimes were started to confirm the subpath `exports`
    resolve under real Node/tsx — tests resolve through vitest aliases, so a green suite would not
    have caught a broken `exports` map.
  - An `IdentityRuntime` facade was built and then **removed**: it forced `.identity.` prefixes at
    every call site and added no enforcement the entry-point split does not already provide.

- **Identity Slice 3 — professional sources, GitHub, enrichment (plan `004`, completed 2026-08-14).**
  **A second source now raises the resolution of existing facts instead of duplicating them.**
  - **Migration `0005`** — sources generalised (`kind` now includes `github_repository`, visibility
    `private|public`, `external_ref`, `source_version`), plus `identity_github_connection` and
    `identity_repository_selection`. Jobs gained a `trigger` — `source_added`, `selection_changed`
    or `refresh`. **There is no scheduled trigger to select**; Joby does not crawl.
  - **Delta classification** — every reconstruction is now compared against current E, and each
    candidate carries `new` / `enrichment` / `clarification` / `relation` / `duplicate` / `conflict`.
    **Behaviour, not schema**: it lives in the proposal JSONB, so the vocabulary can change without a
    migration. Applies generally — a second CV is classified the same way.
  - **Matching is normalised-label equality only.** `rota-scheduler` matches `Rota scheduler`; a
    near-miss stays `new`. Fuzzy matching would merge two roles at one employer, and that failure is
    invisible to the person it happens to.
  - **Confirmation applies each classification differently**: enrichment updates the matched node,
    a retained duplicate records provenance only, a conflict applies nothing unless the user picks a
    side, and a relation between two existing facts inserts just the edge.
  - **Selection is the permission.** The check runs *before* the GitHub client is called, and the
    test asserts what was **fetched**, not what was returned — a post-fetch filter would pass an
    output-only assertion while Joby had already read private code.
  - **Visibility is computed at read time** from the sources behind a fact: private unless *every*
    source is public. Survives into the Permanent Identity View.
  - **Permanent Identity View (UC11)** — Education, Experience, Projects, Skills, Achievements and
    Evidence projected from R. Skills are capability aggregated across activities, each carrying what
    evidences it. No table behind any of it.
  - **129 tests pass** (was 90). New: 17 unit tests for classification and the repository extractor,
    22 integration tests for selection, ingestion, delta, enrichment, conflicts, idempotency and the
    projection.
  - **No credential is stored.** `identity_github_connection` records which account was connected;
    tokens are passed at call time, because storing one needs a secrets decision nobody has made.

- **Former Adaptation ownership framing (ADR 0012, plan `005`, 2026-08-14; superseded by ADR 0023).**
  - Adaptation was initially implemented inside
    `packages/identity/src/adaptation/`, not Durable Identity state, an eighth domain or a deployment.
  - It is authoritative only for temporary Adaptation Context, informational conflicts, Adapted
    State, representation drafts and operational user edits. It reads versioned `R`, `X`, `L` and
    current context and mutates none of them.
  - Intelligence retained opportunity/company/role understanding and Opportunity Evaluation at the time (now Opportunity under ADR 0029);
    Execution retained Application Workspace lifecycle, submission and immutable Application Records at that time (Application/Execution ownership is superseded by ADR 0029);
    Discovery retains opportunity records; Memory receives no draft/edit as a learning signal.
  - A consumer-side opportunity-context port will be wired in an app composition root so Identity
    does not import Intelligence and create a package cycle. Execution calls Adaptation and supplies
    task context; Adaptation does not import Execution.
  - `ai-translation` now requires canonical Identity provenance rather than a Memory EvidenceItem and
    distinguishes representation approval from a professional-truth correction.
  - **No Adaptation behavior was implemented:** no migration, route, job, event, model call or use-case
    method. The empty module boundary and its ownership contract are the only source scaffolding.

- **Identity Slice 2 — review → canonical Explicit State → correction (plan `003`, completed
  2026-08-14).** **Joby now holds canonical person-state.**
  - **Migration `0004`** — `identity_explicit_node` (Structure and Activity, one discriminated
    table so relation endpoints get real foreign keys), `identity_relation`, `identity_provenance`,
    `identity_review`, `identity_review_decision`, `identity_correction`, plus a `revision` on the
    durable identity root.
  - **Sparsity is a database constraint.** `identity_node_shape` requires ≥1 of contribution /
    capability / consequence and permits any subset — sparse is valid, empty is not.
  - **Reviewed-set confirmation, no bulk accept.** `confirmReview` requires an explicit decision for
    **every** proposed item and rejects the call naming any that are missing. There is no input
    meaning "accept all". `retain` / `edit` / `exclude` / `reject`, plus user `supplements`.
  - **A retained relation whose endpoint was excluded is an error**, not a silent drop — otherwise
    the applied set would not be the reviewed set.
  - **Two concurrency scopes:** identity-level revision guards confirmation, node-level revision
    guards correction, so unrelated fixes do not collide. Stale writes get 409.
  - **`IdentityUpdated` only on canonical change** — recorded in the same transaction as the fact.
    A review that retained nothing publishes nothing and does not bump the revision.
  - **Corrections work without another reconstruction** and never touch PCI; original reconstruction
    provenance is kept alongside the correction rather than erased.
  - **`getDurableIdentity` returns R, X and L as distinct components.** `stated` is `{}` (present,
    unset); `learned` is `null` — deliberately distinguishable from an empty Learned State.
  - **88 tests pass** (was 60). New coverage includes: E stays empty until confirmation; a rejected
    confirmation applies nothing; exclusions never appear; edits apply instead of the proposal;
    sparse activities survive canonicalisation; every confirmed fact traces to a source quote that
    really appears in the CV; review history records proposed vs edited vs excluded; removing a fact
    removes its relations; no learned/PCI/Education/Experience/Projects/Skills table exists.
  - **Provenance checkpoint resolved with no boundary change** (plan `003`): Identity owns source
    provenance for its own canonical nodes; Memory keeps EvidenceItems. Nothing here creates, reads
    or writes an EvidenceItem.
  - **`identity-evidence` amended** — bulk-accept-unseen (forbidden) is now separated from
    reviewed-set confirmation (required). Closes plan `000` §3.1.

- **Identity Slice 1 — Source → reconstruction → Proposal (plan `002`, completed 2026-08-14).**
  A CV can be uploaded and a grounded reconstruction inspected, **with nothing canonical written.**
  - `packages/identity` exists: model, repository, source capture, reconstruction runner, service,
    public boundary in `src/index.ts`.
  - **Migration `0003`** — `identity_person`, `identity_durable_identity`,
    `identity_professional_source`, `identity_reconstruction_job`,
    `identity_reconstruction_proposal`. **No canonical Explicit State table exists**, by design:
    R writes arrive in R2, behind confirmation. X has no table in any release until a use case
    captures it.
  - **Scheduling: an Identity-owned durable job**, written in the same transaction as the source —
    not an event. "This source still needs extracting" is not a fact about a person's career, so the
    closed `EventName` union was left untouched. **This slice publishes no events.** Closes the
    question plan `001` left open.
  - **Provider-neutral extraction port** with two adapters: `DeterministicCvExtractor` (offline,
    used by tests and as the no-API-key fallback) and `OpenAiCvExtractor` (v1 default, strict JSON
    schema, temperature 0). Output is validated before persistence — malformed proposals are
    rejected, and the job fails retryably rather than storing something unciteable.
  - **`apps/api`** gained `/identity/*` routes; **`apps/worker`** now polls two durable sources of
    work — the outbox queue and Identity's job table.
  - **60 tests pass** (was 26). Covered: capture and job commit atomically; a rejected content type
    stores nothing; duplicate bytes do not queue a second reconstruction; sparse activity survives
    JSONB round-tripping with components genuinely absent; every proposed fact quotes the source;
    the three lifecycle facts stay distinct; failure preserves the source and retries cleanly;
    duplicate delivery yields exactly one proposal; concurrent runners never claim the same job;
    an abandoned claim is reclaimed; the same CV reconstructs identically.
  - **Plan 001 scaffolding deleted** — `foundation_probe` and both probe files are gone; ADR 0004
    tests now create their own scratch table.

- **Historical ADR 0011 framing (accepted 2026-08-14; rewritten 2026-08-16).** The original pass
  correctly separated write authority but its `E = (R, X)` composition is superseded.
  ```
  D = (E, L)   E = (Structure, Activity, Relations)
               X_t = current user-stated operating conditions
               Aᶜ = T(E, X, L, C)
  ```
  - **Explicit State (E)** — what the person did: Structure, Activity and Relations.
  - **Stated Context (Xₜ)** — distinct current professional operating context; only the user writes
    it, and its initial placement scope remains representationally open.
  - **Locked invariants** include: reconstruction writes only E and never authoritatively writes X;
    a historical statement in a source may be proposed but never becomes current X without a user
    act; L changes only through the Slower Learning Loop; adaptation reads E, X, L and C and
    **mutates nothing durable**; **constraint conflicts inform and never auto-block**.
  - **Notation:** `R` is Reconstructed State, so **Relations is always written in full** — it was the
    other `R` in the previous notation.
  - `Aᶜ = T(E, X, L, C)` gives the **existing** Translation concept an explicit signature; no parallel
    concept was introduced.
  - **`packages/identity/CLAUDE.md` now exists** — vocabulary, the ten invariants, a write-authority
    table (which path may write which component), module responsibilities, boundaries and stop
    conditions. This was the largest gap in the working context.
  - Corrected in place: `JOBY_MEMORY.md` (§2.1, §2.3, §2.4, §4, §7, §10, §11, §14),
    `packages/identity/README.md`, `.claude/skills/identity-evidence`, `.claude/skills/ai-translation`.
    ADR 0009 keeps its text and gained a forward note.
  - **No event contract changed.**

- **Explicit State ontology and Person lifecycle settled (ADRs 0009 and 0010, accepted 2026-08-14).**
  Both were blocking Identity Release 1/2. No code yet; documentation only.
  - **ADR 0009 — Structure, Activity, Relations** *(this triple is now **R**, Reconstructed State — see
    ADR 0011 above)*. With each
    activity (contribution, capability, consequence) and **any subset valid**. Education, Experience,
    Projects, **Skills**, Achievements and Evidence are now **projections derived at read time**, with
    no canonical store behind them — skills specifically are capability components aggregated across
    activities, not a maintained list. Relation vocabulary stays small (`occurred_within`,
    `associated_with`, `uses_capability`) and no generic `related_to`.
  - **Open inside 0009:** stated Career Direction, preferences and work constraints are Explicit State
    but are none of S, A or R. Scoped out deliberately, with one binding rule — **reconstruction never
    writes stated context.** Does not block UC01–UC03.
  - **ADR 0010 — Person at first capture.** The Person and Durable Identity root are created with the
    first professional source, **unclaimed**. An **Account Claim** (verified email) is authentication,
    never part of the ontology, and gates *outward action and longitudinal accumulation* — not profile
    building. UC01–UC03 runs unclaimed. Source capture is **episodic and user-initiated**; Joby never
    crawls, polls or watches a source.
  - Corrected in place: `JOBY_MEMORY.md` (§2.1 and new §2.3–§2.6, §3.1, §7, §11),
    `packages/identity/README.md`, `.claude/skills/identity-evidence/SKILL.md`. ADRs 0005 and 0008 keep
    their original text and gained dated forward notes, per the ADR conventions.
  - **No event contract changed.**

- **Foundation: the repository executes (plan `001`, completed 2026-08-13).** Nothing here had ever
  run before this.
  - pnpm workspace, TypeScript (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), Vitest,
    `tsx`. `pnpm typecheck`, `pnpm test`, `pnpm db:up`, `pnpm db:migrate`, `pnpm api`, `pnpm worker`.
  - **`packages/events` executed for the first time** — 14 unit tests covering delivery filtering,
    handler failure isolation, and envelope round-trip. **No event contract was changed.**
  - `packages/database`: pool and **explicit** transaction propagation (a `Queryable`/`Transaction`
    handle passed as an argument — no ambient async-local current transaction), forward-only
    checksummed migrations, and the `OutboxStore` / `DurableQueue` implementations owed since
    ADR 0004 was accepted.
  - PostgreSQL 17 in Docker (`docker-compose.yml`, host port **5433**), migrations `0001`–`0002`.
  - `apps/api` and `apps/worker` run as real processes. The transactional path was exercised
    end to end: domain row + outbox row in one transaction → queue claim → handler → ack.
  - 12 integration tests cover the guarantees that matter: rollback loses both writes, `recordDurable`
    outside a transaction throws instead of silently succeeding, two concurrent claimers never get the
    same message, an abandoned claim is reclaimable, duplicate delivery is idempotent, a handler whose
    transaction rolls back does not consume its idempotency claim.
  - **Decisions:** one table serves the outbox and the queue (a relay between two tables is a new
    place to lose an event); the queue reclaims claims abandoned for >60s, which makes redelivery
    routine and is why idempotency is a primary key rather than a lookup.

- **Identity roadmap workflow map (plan `000`, active).** Which existing skills/agents execute
  UC01–UC12, what is deliberately not reused, and the three doctrine gaps that must close before
  Release 2 — see Known Issues.

- Repository structure created under the former seven-domain package layout; ADR 0023 governed that topology at the time and ADR 0029 now supersedes it. Legacy README-only directories remain migration placeholders.
- Root `CLAUDE.md` written as the engineering constitution.
- Repository memory established: `JOBY_MEMORY.md`, `CURRENT_STATE.md`, ADR directory.
- `packages/events` foundation: typed event names, typed payloads, envelope, handler interface, in-process dispatcher.
- ADRs 0001–0003 accepted (modular monolith, in-process events, single database).
- **Durable event delivery (ADR 0004, accepted).** Deferrable events now have a transactional-outbox → Postgres-queue → worker path at the contract level. Added `outbox.ts`, `queue.ts`, `publisher.ts`, `consumer.ts`, `serialization.ts`; `dispatcher.ts` gained result-reporting `dispatch()` and an `accepts` delivery filter. ADR 0002 marked *extended*, not superseded — inline dispatch is unchanged. The six event contracts were not touched.

- **Claude Code working structure.** Eight agents in `.claude/agents/` — six functional engineering specialists (frontend, backend, data, ai, worker, test) and two review agents (`architecture-guardian`, `adversarial-reviewer`) — and seven workflow skills in `.claude/skills/` (`vertical-slice`, `identity-evidence`, `ai-translation`, `opportunity-ingestion`, `portal-integration`, `event-workflow`, `career-memory-learning`). No domain-specific agents; domain semantics stay in domain-local `CLAUDE.md`.

- **Durable Identity architecture (ADRs 0005–0007, accepted) — now the current model.** Replaces the earlier Workspace-as-source-of-truth model and PCI-as-separate-model framing throughout active documentation.
  - **Durable Identity** is the person-centric primitive: **Explicit State** (explicitly true, user-owned, confirmed) + **Learned State / PCI** (learned over time, evidence-backed). PCI is the Learned State component of Durable Identity, not a competing top-level model.
  - **Workspace redefined** away from owning durable truth. *(This pass defined it as purely temporary; refined by ADR 0008 below into Permanent + Temporary context layers — see that entry for the current definition.)*
  - **Fast Operational Loop vs Slower Learning Loop** established, with meaningful **Records** as the only interface between them. The fast loop may change Workspace/session state but must not directly rewrite Learned State; the slow loop updates PCI only on justified evidence and never learns from operational noise.
  - **Trajectory Evaluation is now part of Intelligence** — current fit *and* trajectory alignment, eight named dimensions, **no universal numeric fit score** (that would need its own ADR). Not a new domain, and no new skill.
  - Domain responsibilities sharpened: Identity owns person-state; Memory owns the learning process; Development owns interpretation of change; Execution acts and must not mutate Explicit State; Discovery surfaces reachable *and* valuable opportunities; Network's scope is unchanged.
  - **No event contracts changed.** The six events are reinterpreted under the new model; `OutcomeObserved` and friends feed the slow loop through the existing outbox → queue → worker path. ADR 0001 marked *extended* by 0005, not superseded.

- **Workspace context layers and Baseline Identity State (ADR 0008, accepted).** Refines ADR 0005's Workspace definition; everything else in 0005–0007 stands.
  - **Historical Workspace definition (superseded by ADR 0029):** the user-facing environment had two context layers. The retained invariant is that it owns no person-state; current Career Workspace is the product umbrella over Durable Identity and Identity Representation.
  - **Durable Identity owns state. Workspace organizes and activates state.** No Workspace domain or package.
  - **Baseline Identity State** formalised: `State 0 = Sparse Durable Identity + Explicit Direction + Minimal Priors`. Career Direction is explicit user input, never an inferred trait. PCI starts intentionally sparse.
  - **Evidence-proportionate claims** added as doctrine: Joby must not present generic priors or a single data point as learned personal insight, and must never fake later-stage intelligence during early use.
  - **Progressive resolution** recorded as a principle — no numeric state machine, no thresholds, no statistical machinery.
  - ADR 0005 marked *extended* by 0008 with a dated forward note; its original decision text is untouched. No event contracts changed.

## Current Work

**Identity Representation is complete for the placement scope** (plans `008`–`010`): create, position,
materialize as a general CV, and offer to Adaptation as an optional prior. The rules it was built to
protect all held — the lens row never gained a content column, nothing derived is stored, and hiding
is a preference rather than a boundary at every layer.

**Stated Context semantics and Adaptation UC03 are unblocked** (rewritten ADR 0011). The existing
Module 1 boundary creates and reads context, retrieves current user conditions,
arranges attributed opportunity understanding and surfaces informational comparisons. Module 2 —
professional evidence selection, interpretation and Adapted State composition — has not started.

## Next Likely Work

- **`apps/web`.** Still no UI at all, and now the largest gap by some distance: the reviewed-set
  confirmation model *and* the delta-review model are both built for screens that do not exist. The
  doctrine they protect — that the user actually sees each proposed item and each disagreement —
  cannot be verified until they do.
- **Adaptation Module 3.** Modules 1 and 2 produce `A^C`; the next vertical behavior renders it into
  a contextual CV, an application answer or a narrative — and that is the point at which user edits
  (UC12) arrive, which is also the trigger to settle Adapted State persistence. `IdentityUpdated`
  still has no subscriber.

Product decisions, still open:

- **PDF sources.** Text only so far; real placement CVs are PDFs. Needs a parser dependency decision.
- **Whether confirmed Explicit State nodes later become Memory EvidenceItems.** This remains a future
  learning/evidence decision, but it no longer blocks Adaptation: ADR 0012 and `ai-translation`
  require canonical Identity provenance for contextual claims and do not require Adaptation to
  create or read a Memory EvidenceItem.

Later: observability for queue depth, `failed` rows and stuck claims.

## Conceptual vs Implemented

Be precise about this, because ADRs 0005–0017 describe more architecture than currently runs.

Four distinct levels:

1. **Conceptually defined** — the idea is decided and named.
2. **Documented architecture** — written into `JOBY_MEMORY.md` / ADRs / domain READMEs.
3. **Implemented source** — code exists in the repository.
4. **Runtime-integrated** — the code actually runs as part of a working system.

| | Conceptual | Documented | Source | Runtime |
|---|:--:|:--:|:--:|:--:|
| Person + Durable Identity root, unclaimed | ✅ | ✅ | ✅ | ✅ — created on first source capture |
| Professional source capture (text CVs) | ✅ | ✅ | ✅ | ✅ — immutable, deduplicated, provenance kept |
| GitHub: connect, select repositories, ingest metadata | ✅ | ✅ | ✅ | ✅ — selection enforced before fetch; **HTTP adapter never run against the live API** |
| Delta classification against current E | ✅ | ✅ | ✅ | ✅ — enrichment, duplicate, conflict, relation |
| Source visibility through to projection | ✅ | ✅ | ✅ | ✅ — private unless every source is public |
| Reconstruction → reviewable Proposal | ✅ | ✅ | ✅ | ✅ — durable job, worker, proposal persisted |
| Extraction boundary + OpenAI adapter | ✅ | ✅ | ✅ | Partial — deterministic adapter verified; **OpenAI adapter never run against the live API** |
| Explicit State `E = (Structure, Activity, Relations)` | ✅ | ✅ | ✅ | ✅ — reviewed confirmation, correction, provenance |
| Review, confirmation and correction history | ✅ | ✅ | ✅ | ✅ |
| `IdentityUpdated` on confirmed change | ✅ | ✅ | ✅ | ✅ — recorded in the same transaction; no subscribers yet |
| Stated Context (`X_t`, distinct from Explicit State) | ✅ | ✅ — rewritten ADR 0011 | Partial — existing implementation predates the rewrite and nests X in the Explicit State DTO | Partial — read/write runs; conformance review is separate work |
| Learned State/PCI | ✅ | ✅ | ❌ | ❌ — returned as `null`, not empty |
| Permanent Identity View (projections) | ✅ | ✅ | ✅ | ✅ — projected at read time, stores nothing |
| Identity Representation — create, list, read a named lens | ✅ | ✅ — ADR 0014 | ✅ | ✅ — persists the lens, projects the content |
| Identity Representation — select/hide, order, emphasis, wording | ✅ | ✅ — ADR 0015 | ✅ | ✅ — decisions about canonical nodes |
| Identity Representation — general CV (`CvDocument` → LaTeX) | ✅ | ✅ — ADR 0016 | ✅ | ✅ — derived per request, nothing stored |
| …the same CV as PDF | ✅ | ✅ | ✅ | Partial — port + adapter written; **no LaTeX toolchain has ever run it** |
| Identity Representation — the Adaptation prior `Pᵢ` | ✅ | ✅ — ADR 0016 | ✅ | ✅ — preferences only, no evidence |
| Memory → Representation learning | ✅ | ✅ — direction and constraints only | ❌ | ❌ — deferred until Memory exists |
| Identity Representation — history, skill-level positioning, more formats | ✅ | ✅ — named as deferred | ❌ | ❌ |
| Workspace — Permanent Context | ✅ | ✅ | ❌ | ❌ |
| Workspace — Temporary Contexts | ✅ | ✅ | ❌ | ❌ |
| Baseline Identity State, Career Direction at State 0 | ✅ | ✅ | ✅ | ✅ — reachable through Stated Context |
| Progressive resolution | ✅ | ✅ | ❌ | ❌ |
| Adaptation module ownership and seams | ✅ | ✅ | ✅ | ✅ — composed in `apps/api` |
| Adaptation read boundary, cycle lifespan, stage-insight governance | ✅ | ✅ — ADR 0013 | Partial — read boundary implemented | Partial — cycle/stage behavior deferred |
| Adaptation use-case behavior | ✅ | ✅ — UC01–UC12 only; post-application not decomposed | Partial — UC01–UC08 | Partial — Modules 1–2 run end to end; Module 3 absent |
| Written representation — UC10 answer, UC11 cover letter | ✅ | ✅ — ADRs 0021, 0022 | ✅ | ✅ — elicitation loop, grounded drafts, edits |
| …its satisfaction gate | ✅ | ✅ | ✅ — provisional, replaceable | Partial — asks for what is underivable; the algorithm is undecided |
| Representation References | ✅ | ✅ — ADR 0021 | ✅ | ✅ — added, read by Adaptation, never reconstructed from |
| Written generation against a real model | ✅ | ✅ | ❌ — deterministic writer only | ❌ — no LLM adapter for writing yet |
| Adapted State `A^C` | ✅ | ✅ — ADR 0019 | ✅ — composed on request | ✅ — derived, never stored; no user edits yet |
| Opportunity understanding | ✅ | ✅ | ❌ — the port only | ❌ — an in-memory stand-in in `apps/api` supplies it |
| Application Record as the temporal spine | ✅ | ✅ | ❌ | ❌ — Application is documentation-only |
| Fast / Slower loop separation | ✅ | ✅ | ❌ | ❌ |
| PCI learning | ✅ | ✅ | ❌ | ❌ |
| Opportunity / Trajectory Evaluation | ✅ | ✅ | ❌ | ❌ |
| Records | ✅ | ✅ | Partial — only the `ApplicationSubmitted` / `InterviewRecorded` / `OutcomeObserved` event contracts | ❌ |
| Event contracts and dispatcher | ✅ | ✅ | ✅ | ✅ — runs in both `apps/api` and `apps/worker` |
| Outbox and durable queue | ✅ | ✅ | ✅ | ✅ — verified end to end against real Postgres |
| Durable Identity public module interface | ✅ | ✅ | ✅ | ✅ — three entry points, export list pinned by test |
| Seven Joby Core modules | ✅ | ✅ | Durable Identity, Identity Representation and Adaptation currently share one package; the others are documentation-only | Partial |

**Joby holds canonical person-state, and it now compounds.** A CV is captured, reconstructed,
reviewed item by item and confirmed into Reconstructed State; further sources — currently selected
GitHub repositories — arrive as a **delta** against what is already held, so confirming raises the
resolution of existing facts rather than duplicating them. Every confirmed fact traces to the passage
behind it, and the familiar sections are projected from that graph at read time.

"AI output cannot become truth" is guaranteed by the write path, not by absence: the only route into
canonical state requires an explicit decision for every proposed item, and a disagreement between two
sources applies nothing until the user picks a side.

## Known Issues

- **The OpenAI adapter has never run against the live API.** It type-checks and its output path is
  covered by the validator's tests, but no request has been made — no key was available. Assume it is
  unproven until someone runs it with `OPENAI_API_KEY` set.
- **No live-model evaluation set exists.** `docs/agent-evals/` is still empty. The semantic failures
  that matter — "contributed" becoming "led", a vague date made precise, tools inferred without
  support, two roles merged, a consequence invented — are prevented by prompt and validator but
  **measured by nothing**. The deterministic extractor cannot catch them by construction.
- **Reconstruction has no retry policy.** A failed job stays failed until someone calls retry;
  nothing backs off, nothing alerts, and a systematically failing extractor is silent.
- **Text sources only.** `text/plain` and `text/markdown`; real placement CVs are PDFs.
- **PDF compilation has never run against a real LaTeX toolchain.** None is installed on the
  development machine, so `PdfLatexCompiler` type-checks and is proven through the port with a fake,
  but no `pdflatex` has ever seen the template. The document and `.tex` paths are fully covered.
  Same caveat as the OpenAI and GitHub adapters: assume it is unproven until someone runs it.
- **Positioning is entirely manual.** A lens does exactly what the person tells it to — there is no
  suggestion and no inference. Deliberate: inference needs the learning system, which does not exist.
  It means a lens is only as good as the effort someone puts into it by hand.
- **A CV has no name on it unless the caller supplies one.** Joby holds no name, email or phone for
  the person — the Account Claim is authentication and stays out of the ontology (ADR 0010) — so the
  header is presentation input passed per render. That is correct today and an obvious product gap
  the moment a real user renders a real CV.
- **Skills are not positionable.** They aggregate across activities, so there is no single canonical
  node to key a decision to. Hiding an activity does not remove the capability it evidences from
  `projection.skills`.
- **No UI exists.** The reviewed-set confirmation model *and* the delta/conflict review model are
  both built for screens nobody has written; they are only exercised through the API and tests. The
  doctrine they protect — the user actually seeing each proposed item and each disagreement — cannot
  be verified until those screens exist.
- **The GitHub HTTP adapter has never run against the live API.** Same caveat as the OpenAI adapter:
  it type-checks and the flow is proven with a deterministic fake, but no real request has been made.
- **No GitHub credential storage.** `identity_github_connection` holds no token; credentials are
  passed per call. A real OAuth flow needs a secrets decision before this is usable outside a
  developer machine.
- **Repository matching is exact-normalised only.** A CV project and a repository with genuinely
  different names will not be recognised as the same work, and will surface as a near-duplicate the
  user must exclude. Deliberate — the alternative silently merges distinct history — but it will be
  the most common source of review friction.
- **Identity has no downstream consumer.** `IdentityUpdated` has no subscribers — outbox rows
  accumulate and the worker acks them with zero handlers — and nothing calls the contract except
  `apps/api` and tests. The boundary is pinned and simulated, but **not yet proven by a second
  domain actually needing it**, which is the only thing that reveals whether its shape is right.
- **Removing a node cascades to its relations silently at the database level.** The correction
  history records what went with it, but nothing warns the user first.
- **The broad Adaptation read widens exposure, and nothing enforces the mitigation yet** (ADR 0013).
  A snapshot of all of `R`, `X`, `L` means a selection bug can surface a private-source fact in a
  representation. Visibility is computed at read time today, but no test proves it survives selection
  and rendering — because neither exists.
- **Unclaimed Persons hold real personal data and nothing governs their retention** (ADR 0010). Not a
  cleanup task — it must not be discovered at launch.
- **The Account Claim gate is a convention with nothing enforcing it.** An unclaimed Person quietly
  reaching Execution or PCI learning is invisible in review unless it is tested.
- Nothing enforces that `recordDurable` is called *at all* for an event with deferrable handlers.
  It is now enforced that it is called inside a transaction — `asTransaction` throws otherwise — but
  the omission case is still a review concern.
- Queue depth, `failed` outbox rows, and stuck `processing` rows have no monitoring. Claims abandoned
  for more than 60s are reclaimed automatically, so the failure is silent slowness, not loss.
- No retry backoff and no dead-letter queue: a permanently failing handler is claimed, released, and
  reclaimed forever, with only `last_error` to show for it (ADR 0004, deliberate).
- No git repository initialised in this directory yet.

## Explicitly Deferred

| Deferred | Until |
|---|---|
| CV representation routing policy — reuse vs adapt vs distinct | The product decision is made; the seam and a provisional constant are in place (ADR 0020) |
| Satisfaction Gate algorithm — when Joby has enough to generate | Designed deliberately. A provisional gate now runs and reports itself as provisional (ADR 0022) |
| Reference-conflict resolution — two references pulling different ways | References meet a real generator (ADR 0021) |
| Representation-performance attribution, and its PCI update logic | Memory exists and resolved history accumulates (ADR 0022) |
| Representation Reference storage, scoping and disclosure handling | A use case captures references (ADR 0021) |
| Result vs insight classification rules | A slice has real stage results to classify (ADR 0013) |
| Adapted State retention / versioning of prior stage states | Continuity across stages is actually built |
| Adaptation → Memory handoff | Reviewed insights need to reach the slow loop, and the decision is made |
| Adaptation persistence mechanics (tables, JSONB, reconciliation, lifecycle) | A slice needs continuity it cannot regenerate |
| Adapted State refresh triggers | Real application events exist to trigger on |
| Browser / portal worker runtime | A real portal-automation need exists |
| Kafka, RabbitMQ, NATS, schema registry | An event genuinely needs to reach a consumer outside Joby (ADR 0004) |
| Retry backoff, dead-letter queue, event replay | A real failure pattern exists to design against |
| Independent module distribution | Demonstrated operational evidence and a new ADR |
| Database per domain | Never planned; ownership is by convention |
| Module package implementations | Per-module build-out stages |
| Specialist Claude agents and skills | Later setup stage |
| Social feed, full learning platform, autonomous mass applying | Out of scope for the current wedge |
