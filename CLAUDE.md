# Joby — Engineering Constitution

Joby is a **Unified Career Intelligence Platform**. This file is how we build it, not what it is.
The product model lives in `docs/JOBY_MEMORY.md`. Current state lives in `docs/CURRENT_STATE.md`.

Keep this file short. If something here grows past a few lines of nuance, it belongs in an ADR.

## Canonical Architecture

[ADR 0031](docs/architecture/adr/0031-identity-router-translation-application-pci.md) is
authoritative. Joby is one modular core; semantic groupings, packages and runtimes are separate
architectural questions.

```text
IDENTITY SERVICE
├── Canonical Profile Units
├── Persistent Representations
└── Stated Context

OPPORTUNITY  →  ROUTER  →  TRANSLATION SERVICE  →  APPLICATION  →  resolved evidence  →  PCI
                           ├── Adaptation
                           ├── Execution
                           └── Interview Intelligence
```

| Semantic authority | Owns |
|---|---|
| Identity | Persistent person-side state: Canonical Profile Units, Persistent Representations, Stated Context |
| Opportunity | The current external professional situation: evidence, records, understanding |
| Router | Selecting the best existing Representation as the starting prior for an Opportunity |
| Adaptation | The opportunity-specific delta from the selected Representation |
| Execution | Realizing that delta externally: submission, portal interaction, mechanical feedback |
| Interview Intelligence | Understand → Prepare → Rehearse for interview stages |
| Application | The live lifecycle and durable record of what actually happened |
| PCI | The learned person × world model, and the priors it returns |

A **Profile Unit** is one coherent professional unit — **Context, Contribution, Capabilities,
Consequence** — and is canonical truth. A **Representation** is persistent positioning over that
truth: it may include, prioritize, emphasize, order and frame units or their pieces, and changes no
canonical truth by doing so. **Stated Context** is current user-authored preferences, constraints and
intentions.

**Router is small on purpose.** It selects a starting prior; it does not adapt, and it writes neither
Identity nor Opportunity state.

```text
Execution   = what Joby attempts.
Application = what is actually happening and what actually happened.
```

**PCI is an independent authority, not part of Identity.** It learns only from meaningful resolved
Application evidence, and returns priors to Router, Opportunity reasoning and Adaptation. Information
may flow recursively; **semantic ownership must not silently flow backwards.** PCI returns priors,
never truth, and rewrites nothing upstream.

**Retrieval is demand-driven.** Representation is the normal person-side prior; canonical truth is
queried selectively when contextual reasoning identifies an evidence requirement.
`Identity authority ≠ mandatory full-state retrieval`, and
`HiddenInRepresentation ≠ UnavailableToAdaptation`.

Semantic groupings own no state and grant no privileged access. **Service** means an independently
distributed runtime; "Identity Service" and "Translation Service" are semantic groupings, not
deployment claims. Each owner mutates only its own state; collaboration uses public capabilities,
identifiers and meaningful events.

**Profile Units are composed, not stored** (ADR 0032). A unit's identity is its Activity node and
its Context is the Structure it occurred within, so `getProfileUnits` reads canonical truth as units
without a second copy of the person's history. Experience / Projects / Skills / Achievements remain
read-time projections and were never canonical stores.

**Application is implemented** as `Oₙ = (Pₙ, Wₙ, Rₙ, Aₙ, Xₙ, Iₙ, Yₙ)` (ADR 0033) — seven
epistemically distinct parts, none a live projection of another authority. `Aₙ ≠ Xₙ`: what Joby
produced may differ from what was actually sent. `Xₙ ≠ Yₙ`: what was sent is distinct from how the
world responded. `currentState` is derived from timeline chronology, never stored. A
`getResolvedEvidence` projection is Application's only output toward PCI, gated on a recorded
outcome and keeping PCI's two signal families distinct.

**Execution holds temporary runtime state for one attempt** as an **Application Session**
(ADR 0034): job/company/portal context, working application state (Adaptation's `ApplicationIntent`
plus portal fill-ins — **not** `Xₙ`), a current execution level disjoint from Application's timeline,
an unresolved-requirements checklist, and session memory. Restart-safe because it is persisted;
never Application history because nothing in it is a fact about what happened. Submission readiness
is derived, never stored.

**Execution can inspect an arbitrary page and determine what it requires** (ADR 0035):
`Browser → Portal Context → Execution Surface → Claude → Semantic requirements → Working Application
State`. A page is a structured `PageObservation` (no HTML parser exists or is needed), compacted by a
pure function into a compact `ExecutionSurface`, sent to a provider-neutral `SurfaceInterpreter`
exactly once. The result is validated so every grounding claim points at an element actually sent and
every "known" fact was actually supplied, then classified into `known` / `generated_answer` /
`user_required` / `portal_operation` — never guessed when unclear, which is represented explicitly.
Known facts also reach `workingState.portalFieldValues`. No ATS-specific branching exists anywhere in
this path.

**Execution satisfies a grounded surface by asking, not orchestrating** (ADR 0036): a narrow
`JobyQueryPort` — "I need the answer to this requirement" / "here it is" or "I cannot resolve this
safely" — is Execution's whole interface to Identity/Adaptation/Opportunity/Application's authority
graph; Execution never orchestrates that graph itself. `portal_operation` and already-`known`
requirements are never queried. An answer Joby cannot resolve safely (`not_found` / `ambiguous` /
`conflicting`) is never guessed at — it becomes a user clarification and pauses the session. What
resolves is turned into a deterministic `fill`/`select`/`check`/`upload` action plan (buttons have no
mapped action — no clicks, no submission), executed through a `PortalActionExecutor`, then checked
against a freshly observed surface; every mechanical outcome lands in Session Memory, never an
Application table.

**Execution recurses across surfaces one step at a time** (ADR 0037): `step` composes inspection,
resolution and execution into one Observe → Ground → Act → Verify pass per surface — one Claude call
per surface — and returns `continue` / `waiting_for_user` / `submission_ready` / `needs_repair` /
`blocked` rather than deciding what happens next itself. WAITING_FOR_USER, SUBMISSION_READY and
BLOCKED reuse `awaiting_input` / `ready_to_submit` / `failed`, not a parallel vocabulary. A validation
mismatch that has not converged after three attempts on the same element becomes `blocked`, read back
from Session Memory rather than new persisted state. `step` does not drive a browser or recurse on its
own — a real loop calls it repeatedly with a fresh observation each time, and no such loop exists yet.

**Not yet implemented:** the learning inside PCI, a real `JobyQueryPort` adapter, a browser-driving
loop that calls `step` repeatedly, actual submission, drafting `generated_answer` requirements, and
Interview Intelligence's behaviour — what Prepare produces and what Rehearse evaluates remain
undecided product questions.

## The Core Model

**Durable Identity** is the persistent professional model of the person and the primitive Joby
organises around. It holds **Explicit State** (what is explicitly true, user-owned, confirmed) and
**Stated Context** — and nothing else. **PCI is not part of it** (ADR 0030): what Joby has learned
about how this person and the professional world interact is an independent relational model owned by
Memory / PCI. Truth about the person and learned beliefs about person × world are different claims
with different owners.

**Retrieval is demand-driven.** Durable Identity is the authoritative evidence reservoir, queried
selectively when contextual reasoning identifies an evidence requirement. **Authority is not eager
retrieval:** `Durable Identity authority ≠ mandatory full-state retrieval`.

**Stated Context** is distinct Durable Identity-owned context: persistent current professional intent and
operating conditions authored only by the user. `E = (Structure, Activity, Relations)` remains
reconstructed professional reality; Stated Context is not part of E and is not reconstructed from
professional sources (ADR 0011).

**Identity** is the persistent person-side grouping the user maintains: Canonical Profile Units,
Persistent Representations and Stated Context — what is professionally true, how they generally want
it represented, and what they currently intend. It is the environment they return to, "My Joby". Live
application task state belongs to **Application**, not here (ADR 0031).

> **The Identity grouping owns no state. Its authorities retain their own truth.**

There is no Workspace domain and no required Workspace package.

**Identity Representations** are persistent, reusable, **non-canonical** positioning lenses over
Explicit State — "Markets", "Software Engineering" (ADRs 0014, 0015). `Eₜ + Decisionsᵢ → Vᵢ`. They
store the lens and decisions *about* canonical facts — include/hide, order, emphasis, wording — and
project the content from E at read time, so there is no second copy of the person to drift. General
positioning only: distinct from Stated Context (a lens is not a claim about the person) and from
Adapted State (no opportunity ever enters one).

A lens materializes as a **general, reusable CV** (`CvDocument → LaTeX → PDF`, derived and never
stored, no user-authored LaTeX) and is offered to Adaptation as an **optional prior**:
`Aᶜ = T(E, X, L, C, Pᵢ)` (ADR 0016, notation clarified by rewritten ADR 0011).

**A lens is a prior, not a boundary:** `HiddenInLens ≠ UnavailableToAdaptation`. Hiding something in
a lens removes nothing from Durable Identity and makes nothing unavailable to a later opportunity
that needs it — the prior carries preferences keyed by canonical node, and no evidence.

**Translation** owns immediate contextual action: Adaptation, Execution and Interview Intelligence.
*The user owns intent. Joby owns translation and administration.* It is a semantic grouping, not a
state owner or a deployment. **Opportunity sits upstream of it**, with Router between them selecting
the Representation Adaptation starts from (ADR 0031).

**Adaptation is a peer semantic authority, not Identity state** (ADRs 0013 and 0031). It owns only
temporary contextual state — Adaptation Context, informational conflicts, Adapted State,
representation state/drafts, operational user edits and stage-specific interpretation — and computes
the **opportunity-specific delta from the selected Representation**, reading canonical evidence
selectively and writing none of it. Contextual relevance selection lives here, not in Identity.
Router selects the starting Representation; Opportunity owns understanding; Execution owns temporary
submission attempts and mechanical feedback; Application owns the live lifecycle and record.

Across an application cycle, three things stay separate:

> **Application Record = what happened. Adapted State = current contextual response to what has
> happened. PCI = what accumulated resolved evidence eventually justifies learning.**

A factual result may reach Adapted State automatically through the record; a system-generated
interpretation of it reaches Adapted State only by user **accept / edit / decline / challenge**, and
even accepted never becomes PCI automatically.

Two timescales (ADRs 0006 and 0031): the **Fast Operational Loop** adapts the current Application and
must not casually rewrite learned understanding; the **Slower Learning Loop** adapts Joby's future
expectations from accumulated resolved evidence. Meaningful Records remain the only interface.

Application is the junction between those loops:

```text
Opportunity → Router → Adaptation / Execution / Interview Intelligence → current Application
resolved Application evidence → PCI → priors for Router, Opportunity reasoning and Adaptation
```

Application preserves the meaningful state actually used and what happened. PCI consumes resolved
evidence, never live drafts or raw execution telemetry, and rewrites nothing upstream. Mechanical
execution detail is excluded by default. Priors confer no write authority over the authority that
receives them.

Every user starts in the **Baseline Identity State** — sparse Durable Identity + explicit direction +
minimal priors. Claims must be proportionate to the evidence behind them; Joby earns the right to
infer more over time and never fakes later-stage intelligence during early use.

## Product Doctrine (non-negotiable)

1. Joby is **person-centric**, not application-centric.
2. **The Identity grouping owns no state.** Profile Units are canonical truth; Representations own general positioning; Stated Context is user-authored.
3. **Explicit State is separate from contextual representation.** A tailored CV is a representation, never the source.
4. **Every generated claim traces back to evidence.** No untraceable claims.
5. **AI output must not silently modify Explicit State.** AI proposes; the user confirms.
6. **Observed, Inferred, and Hypothesized remain distinct** and never collapse into each other.
7. **Application and session state are separate from Identity.**
8. **Users control consequential claims and sensitive disclosures.**
9. **Application Records preserve what was actually submitted**, immutably, even if the underlying truth later changes.
10. **A single outcome never becomes a permanent trait.** Learned State changes only on justified evidence, and never from operational noise.
11. **Claims are proportionate to evidence.** Never present generic priors or a single data point as learned personal insight.

Do not silently redefine this doctrine while implementing a feature. If a feature needs doctrine to change, stop and write an ADR.

## Architectural Rules

- Each semantic module owns its behaviour **and its own tables**. No direct cross-module writes.
  Product-umbrella membership grants no extra access to another semantic owner.
- Cross-module access goes through the owner's public module interface, never its internals or tables.
- One PostgreSQL database initially. Module ownership is enforced by import rules, tests, migrations and review; add schema/role enforcement if needed.
- Current runtimes are `apps/web`, `apps/api`, `apps/worker`; a runtime may compose several modules directly through their public interfaces.
- **Do not create network calls between modules to imitate distributed services.**
- **Do not distribute a module without demonstrated operational evidence and an accepted ADR.** A new runtime alone does not make a service.
- Events are for **meaningful state changes only** — not for internal function calls, not as a general message bus.
- **Two delivery paths, one event contract.** Joby uses typed domain events. Immediate local reactions may run inline. Deferrable reactions are persisted transactionally through an outbox, delivered through a Postgres-backed durable queue, and processed by workers. **Event contracts remain independent of delivery transport** — never change an event's meaning, shape, or name because of how it is delivered.
- A deferrable event's outbox row is written **inside the same transaction as the domain data**. Never after commit. Deferrable handlers must be **idempotent** — delivery is at-least-once.
- Do not build infrastructure for hypothetical scale. No broker, no queue fan-out, no sharding, until a real constraint exists.
- Prefer extending an existing concept over duplicating it.

## Before Non-Trivial Work

1. Read this file.
2. Read `docs/JOBY_MEMORY.md`.
3. Read `docs/CURRENT_STATE.md`.
4. Identify the affected module(s).
5. Read those modules' local `CLAUDE.md` files where present.
6. Read the relevant **accepted** ADRs in `docs/architecture/adr/`.
7. Inspect the current implementation and its tests.

## Development Loop

**ORIENT → EXPLORE → PLAN → BUILD → VERIFY → CHALLENGE → INTEGRATE → CONSOLIDATE → COMMIT**

- **ORIENT** — the seven reads above.
- **EXPLORE** — read the real code before proposing changes.
- **PLAN** — non-trivial work gets a plan in `docs/plans/active/`.
- **BUILD** — the **smallest vertically complete slice**. No unrelated refactors.
- **VERIFY** — tests and actual execution, not assertion.
- **CHALLENGE** — argue against your own design. Does it violate doctrine? Does it leak across a module boundary?
- **INTEGRATE** — wire into the real system; check event contracts still mean what they meant.
- **CONSOLIDATE** — update `CURRENT_STATE.md`, move the plan to `docs/plans/completed/`, write an ADR if a consequential decision was made.
- **COMMIT** — one coherent change.

## Where Context Lives

| | Holds |
|---|---|
| Root `CLAUDE.md` | Global engineering rules — this file |
| A module's local `CLAUDE.md` | Module semantics: what its terms mean and what it owns |
| `.claude/agents/` | Functional engineering specialists (`frontend`, `backend`, `data`, `ai`, `worker`, `test`) |
| `.claude/agents/` — review | Independent challenge: `architecture-guardian`, `adversarial-reviewer` |
| `.claude/skills/` | Recurring Joby workflows, `vertical-slice` being the default |

Use only the agents and skills relevant to the current task. Their instructions live in their own
files and are not duplicated here.

## Memory Rule

**Durable decisions belong in the repository, not in chat history.** If a decision will matter in two weeks, it goes in `JOBY_MEMORY.md` (product), an ADR (technical), or `CURRENT_STATE.md` (transient). A decision that exists only in a conversation does not exist.
