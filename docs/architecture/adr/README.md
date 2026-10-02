# Architecture Decision Records

A decision that will be expensive to reverse, or that someone will otherwise re-litigate in three
months, goes here. Chat history is not a record.

## Conventions

- Filename: `NNNN-kebab-case-title.md`, numbered sequentially.
- Start from [`0000-adr-template.md`](0000-adr-template.md).
- Status: `Proposed` → `Accepted` → `Superseded by ADR-NNNN` or `Accepted — extended by ADR-NNNN`.
- **Never edit an accepted ADR's Context, Decision, or Consequences.** Write a new ADR instead:
  - **Superseded** — the original decision no longer holds.
  - **Extended** — the original decision still holds, and a later ADR adds to it. Use this rather than superseding when part of the original is still in force; it keeps the progression readable. The only permitted edits to the extended ADR are its status line and a dated note at the top pointing forward.
- Only **accepted** ADRs are binding. An extended ADR is still accepted.

## Index

| # | Title | Status |
|---|---|---|
| [0001](0001-modular-monolith-with-seven-domain-packages.md) | Modular monolith with seven domain packages | Superseded by 0023 |
| [0002](0002-in-process-typed-event-dispatcher.md) | In-process typed event dispatcher | Accepted — extended by 0004 |
| [0003](0003-single-postgres-database-with-domain-ownership.md) | Single PostgreSQL database with domain ownership | Accepted — terminology extended by 0023 |
| [0004](0004-transactional-outbox-and-postgres-durable-queue.md) | Transactional outbox and Postgres durable queue | Accepted |
| [0005](0005-durable-identity-as-the-person-centric-primitive.md) | Durable Identity as the person-centric primitive | Accepted — extended by 0008, 0009, 0010 |
| [0006](0006-two-timescale-career-intelligence.md) | Two-timescale career intelligence | Accepted |
| [0007](0007-trajectory-evaluation-in-intelligence.md) | Trajectory evaluation in Intelligence | Accepted doctrine; placement superseded by 0029 |
| [0008](0008-workspace-context-and-baseline-identity-state.md) | Workspace context layers and the Baseline Identity State | Accepted doctrine; topology refined by 0029 |
| [0009](0009-explicit-state-as-structure-activity-relations.md) | Explicit State as Structure, Activity and Relations | Accepted — components retained; top-level framing superseded by 0031 |
| [0010](0010-person-creation-at-first-capture-and-the-account-claim.md) | Person creation at first capture, and the account claim | Accepted |
| [0011](0011-explicit-state-as-reconstructed-state-and-stated-context.md) | Stated Context as Identity-owned user-stated operating context | Accepted — rewritten 2026-08-16; supersedes 0017 |
| [0012](0012-adaptation-as-an-identity-owned-fast-loop-service.md) | Adaptation as an Identity-owned Fast Operational Loop service | Superseded by 0023 |
| [0013](0013-adapted-state-across-the-application-cycle.md) | Adapted State across the application cycle | Accepted |
| [0014](0014-identity-representation-as-a-persistent-non-canonical-projection.md) | Identity Representation as a persistent, non-canonical projection | Accepted — extended by 0015 |
| [0015](0015-representation-positioning-as-decisions-over-canonical-nodes.md) | Representation positioning as decisions over canonical nodes | Accepted — extended by 0016 |
| [0016](0016-representation-materialization-and-the-adaptation-prior.md) | Representation materialization and the Adaptation prior | Accepted |
| [0017](0017-stated-context-as-user-maintained-operating-conditions.md) | Stated Context as user-maintained operating conditions | Superseded by rewritten 0011 |
| [0018](0018-adaptation-context-interpretation-module.md) | Adaptation Module 1: context interpretation | Accepted |
| [0019](0019-representation-first-context-adaptation.md) | Representation-first context adaptation | Accepted |
| [0020](0020-cv-representation-path-behind-a-replaceable-seam.md) | The CV representation path stays behind a replaceable seam | Accepted |
| [0021](0021-representation-references-as-user-owned-expression-material.md) | Representation References as user-owned expression material | Accepted |
| [0022](0022-written-representation-elicitation-over-fabrication.md) | Written representation: elicitation over fabrication | Accepted |
| [0023](0023-one-modular-core-with-strongly-owned-modules.md) | One modular core with strongly owned modules | Superseded by 0029; technical modularity retained |
| [0024](0024-translation-as-an-enclosing-module-boundary.md) | Translation as an enclosing module boundary | Superseded by 0029 |
| [0025](0025-translation-semantic-ownership.md) | Semantic ownership inside Translation | Superseded by 0029 |
| [0026](0026-translation-fast-feedback-information-seams.md) | Translation fast-feedback information seams | Superseded by 0029; seam names retained |
| [0027](0027-resolved-application-history-as-career-memory-input.md) | Resolved Application history as Career Memory input | Superseded and incorporated by 0029 |
| [0028](0028-opportunity-capture-is-not-a-person-event.md) | Opportunity capture is not a person event | Accepted implementation decision; terminology amended by 0029 |
| [0029](0029-career-workspace-translation-application-career-memory.md) | Career Workspace, Translation Layer, Application and Career Memory | Topology superseded by 0031 |
| [0030](0030-dual-stream-translation-and-independent-relational-pci.md) | Dual-stream Translation and independent relational PCI | Topology superseded by 0031; PCI independence and retrieval semantics retained |
| [0031](0031-identity-router-translation-application-pci.md) | Identity, Router, Translation, Application and PCI | Accepted — authoritative topology |
| [0032](0032-aligning-the-codebase-to-the-canonical-topology.md) | Aligning the codebase to the canonical topology | Accepted — implementation record for 0031 |
| [0033](0033-application-as-seven-part-structured-observation.md) | Application as a seven-part structured observation | Accepted — implementation record for 0031 |
| [0034](0034-execution-application-session.md) | Execution's Application Session | Accepted — implementation record for 0031 |
| [0035](0035-page-surface-interpretation.md) | Page surface interpretation | Accepted — implementation record for 0031 |
| [0036](0036-surface-resolution-and-deterministic-execution.md) | Surface resolution and deterministic action execution | Accepted — implementation record for 0031 |
| [0037](0037-recursive-execution-loop.md) | The recursive execution loop | Accepted — implementation record for 0031 |
| [0038](0038-router-owned-opportunity-decisioning.md) | Router-owned opportunity decisioning | Accepted |

**ADR 0031 is the authoritative topology.**

```text
IDENTITY SERVICE (Profile Units · Representations · Stated Context)

OPPORTUNITY → ROUTER → TRANSLATION (Adaptation · Execution · Interview Intelligence)
            → APPLICATION → resolved evidence → PCI
```

Identity owns persistent person-side state; Opportunity owns the current external situation; Router
selects the starting Representation; Translation owns immediate contextual action; Application owns
the live lifecycle and durable record; PCI is an independent learned person × world authority that
learns only from resolved Application evidence and returns priors to Router, Opportunity reasoning
and Adaptation.

Semantic groupings are not state owners, packages or deployments. Information may flow recursively;
semantic ownership must not silently flow backwards.

**ADR 0032 brought the code to this shape.** Opportunity understanding moved out of Translation,
person × opportunity mapping moved into Adaptation, Identity exposes canonical truth as **Profile
Units** (composed from `E`, not stored), and **Router**, **Interview Intelligence** and **PCI** now
exist.

**ADR 0033 implements Application.** `Oₙ = (Pₙ, Wₙ, Rₙ, Aₙ, Xₙ, Iₙ, Yₙ)` — seven epistemically
distinct parts, none of which is a live projection of Identity, Representation, Opportunity or
Adaptation. `Aₙ ≠ Xₙ` (what Joby produced may differ from what was sent) and `Xₙ ≠ Yₙ` (what was sent
is distinct from how the world responded) are enforced by separate tables, not by convention.
`currentState` is derived from timeline chronology and stored nowhere. The resolved-evidence seam
toward PCI now has a producer.

**ADR 0034 gives Execution its first real behaviour: the Application Session** — temporary,
restart-safe runtime state for one attempt (job/portal/working-state/execution-level/requirements/
memory), deliberately not `Xₙ` and deliberately not Application's `currentState`.

**ADR 0035 gives Execution its second: page surface interpretation.** An arbitrary page, described
structurally (not raw HTML), is compacted into an `ExecutionSurface` and sent to Claude exactly once
alongside session context; the response is validated so every grounding claim points at something
actually sent, classified into known / generated-answer / user-required / portal-operation, and
recorded onto the session — known facts also reach Working Application State. No submission, no
browser wiring, no drafting exists yet.

**ADR 0036 gives Execution its third and fourth: surface resolution and deterministic execution.**
Execution asks a narrow `JobyQueryPort` for exactly what an unresolved requirement needs — it never
orchestrates Identity/Adaptation/Opportunity/Application's authority graph itself — and an answer
Joby cannot resolve safely becomes a user clarification that pauses the session rather than a guess.
What resolves is turned into a deterministic `fill`/`select`/`check`/`upload` action plan (no clicks,
no submission), executed through a `PortalActionExecutor`, then checked against a fresh observation;
every mechanical outcome — resolved, needs-user, executed, failed, mismatched — lands in Session
Memory, never an Application table.

**ADR 0037 gives Execution its fifth: the recursive execution loop.** `step` composes the three
above into one Observe → Ground → Act → Verify pass per surface, returning `continue` /
`waiting_for_user` / `submission_ready` / `needs_repair` / `blocked` rather than deciding what
happens next itself — WAITING_FOR_USER, SUBMISSION_READY and BLOCKED reuse ADR 0034's existing
`awaiting_input` / `ready_to_submit` / `failed` levels rather than a parallel vocabulary. A validation
mismatch that has not converged after three attempts on the same element becomes `blocked`, read back
from Session Memory rather than new persisted state. `step` does not drive a browser or recurse on its
own; a real loop calls it repeatedly with a fresh observation each time. No real query adapter and no
live browser wiring exist yet. Interview Intelligence and PCI's learning still wait on their own
implementation slices.

ADR 0023's modularity and evidence-before-distribution constraints remain technical rules. ADR 0030's
PCI independence, person-side/world-side signal split and demand-driven retrieval remain in force.

**ADR 0028** records a constraint found by implementing UC01/UC02: every Joby event is about exactly
one person, and capturing an opportunity is not. `OpportunityImported` therefore stays in the closed
set **unpublished** rather than carrying a fabricated `personId`, and Intelligence finds outstanding
work by deriving it from the current evidence set through Opportunity's public interface. The event
becomes publishable when an opportunity enters a *person's* world.

ADRs 0002–0004 are technical/infrastructural. **0005–0011 record the product-model architecture** —
Durable Identity, the two timescales, trajectory evaluation, the Workspace context layers with the
Baseline Identity State, the Explicit State ontology, distinct Stated Context ownership, and the Person
lifecycle. The ownership placement in ADR 0012 is superseded by ADR 0023; its behavioral restrictions
on Adaptation remain carried forward. **ADR 0013** defines the
broad Identity read boundary, the life of Adapted State across an application cycle, and the
`Application Record = what happened` / `Adapted State = current contextual response` /
`Memory = what accumulated resolved history justifies learning` separation.

**ADR 0014** adds the third boundary inside Identity: an Identity Representation is a persistent,
reusable, **non-canonical** lens over Explicit State that stores no facts. **ADR 0015** makes it a
*positioning* lens — select/hide, order, emphasise and reword — held as decisions about canonical
node ids, and fixes the invariant that keeps it a prior rather than a boundary:
`HiddenInLens ≠ UnavailableToAdaptation`. **ADR 0016** makes it observable (a general CV, derived and
never stored) and defines what Adaptation consumes: `A^C = T(E_t, L_t, C, P_i)` with `P_i` optional
and carrying no evidence.

**Rewritten ADR 0011** resolves the semantic blocker for Stated Context without fixing its
representation: Identity owns the user's current stated operating conditions, absent remains unknown,
and Adaptation retrieves relevant `X_t` through a read-only boundary. ADR 0017 is retained as
superseded history because it over-specified taxonomy and implementation behavior.

**ADR 0018** is the first Adaptation behaviour: Module 1 turns an opportunity and the person's
conditions into something legible. The context stores references and revisions and re-derives on
every read; opportunity understanding always arrives through the Intelligence port; conditions are
retrieved, never inferred; and the comparison has **four** outcomes, because "you should ask about
this" and "here is what the role says" are different silences. `ConstraintConflict ≠ ApplicationBlock`
throughout.

**ADR 0019** is Module 2: the lens is the **default adaptation surface** and Durable Identity the
**fallback reservoir**, consulted only where the lens is silent about something the posting asks for.
Relevance is canonical capability equality and nothing cleverer, assessment is representational
rather than evaluative, and `A^C` is composed on request rather than stored.

**ADR 0020** defers a product decision on purpose: whether an application reuses, adapts or replaces
the general CV stays behind a replaceable seam, with a provisional constant that decides nothing —
so Module 3 cannot harden a routing policy nobody chose.

**ADR 0021** gives written generation a voice to imitate without giving it facts to invent:
Representation References are persistent user-owned expression material, Identity-owned, and — like a
professional source — **never canonical identity**. **ADR 0022** governs UC10/UC11: Adapted State
grounds every claim, missing meaning is **elicited rather than fabricated** (fit is not motivation),
the satisfaction gate stays a placeholder, and application progression is observational evidence that
must never be read as proof a representation caused an outcome.

The model as it currently stands:

```
D = (E, X)   E = (Structure, Activity, Relations)
             X_t = current user-stated operating conditions   (Identity-owned, distinct from E)
             Vᵢ = Pᵢ(Eₜ)             persistent, non-canonical positioning lens
             Aᶜ = T(E, X, C, Pᵢ, PCI) temporary, opportunity-specific
             PCI                     learned PERSON × WORLD model, owned by Memory / PCI (0030)
```

Superseded framings survive only in the historical text of earlier ADRs, deliberately; active
documentation always uses the current model. Three to know about: Applicant/Canonical Workspace and
PCI-as-separate-model (pre-0005); Workspace-as-purely-temporary (0005, refined by 0008); and
**Explicit State as an enumeration of education/experience/projects/skills** (0005 and 0008, replaced
by 0009's S/A/R ontology — those nouns are now projections).

## When to write one

- Changing a module boundary or what a module owns.
- Adding a deployed runtime.
- Adding infrastructure (broker, cache, queue, external service).
- Changing an event contract's meaning.
- Anything that touches product doctrine — **stop and write the ADR before implementing.**
