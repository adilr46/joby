# ADR 0012 - Adaptation as an Identity-owned Fast Operational Loop service

- **Status:** Superseded by [ADR 0023](0023-one-modular-core-with-strongly-owned-modules.md)
- **Date:** 2026-08-14
- **Domains affected:** Identity, Intelligence, Execution, Discovery, Memory
- **Related:** ADR 0001 (seven-domain modular monolith), ADR 0005 (Identity and representation),
  ADR 0006 (two timescales), ADR 0007 (Opportunity Evaluation), ADR 0008 (Workspace), ADR 0011
  (the Adaptation signature)

> **Superseded (2026-08-16).** ADR 0023 retains Adaptation's authority and hard negative boundary,
> but makes Adaptation a peer module in Joby Core rather than an Identity-owned service boundary.

> **Notation clarification (2026-08-16).** Rewritten ADR 0011 restores Explicit State as
> `E = (Structure, Activity, Relations)` and makes Stated Context `X_t` distinct. Read this ADR's
> `R, X, L` input lists as `E, X, L`. Its read-only Adaptation authority is unchanged.

> **2026-08-15 — extended by [ADR 0013](0013-adapted-state-across-the-application-cycle.md).** The
> ownership decision below is unchanged and still binding. ADR 0013 settles three things this ADR
> left open or under-specified: the Identity read is a **broad canonical snapshot** with contextual
> selection inside Adaptation ("narrow Identity reader" below means narrow in *authority*, not in
> scope); Adapted State continues across the **active application cycle** rather than one task
> context, and also covers stage-specific contextual interpretation; and recorded factual results may
> flow `Application Record -> Adapted State` automatically while system-generated stage insights
> require user accept / edit / decline / challenge and never become PCI automatically.

> **Current event ownership note (2026-09-13).** This superseded ADR predates Application as an
> implemented authority. ADR 0039 now makes Application, not Execution, the publisher of
> `ApplicationSubmitted` after it records submitted reality.

## Context

The Adaptation doctrine fixes the product semantics but deliberately leaves service ownership open.
It defines `A^c = T(R, X, L, C)`: a temporary contextual state produced from Durable Identity and a
current professional context, then rendered into contextual representations. It also separates
Adaptation from Opportunity Evaluation, application execution and slow learning.

The current repository contains seven domain packages, not deployable microservices. Existing
documentation says Identity's verb is **Represent** and assigns contextual representations to
Identity, while Execution owns Application Workspaces and submission records and Intelligence owns
opportunity understanding and evaluation. `packages/identity/CLAUDE.md` also says Adapted State lives
outside the Durable Identity boundary. Without a more precise ownership decision, an implementation
could plausibly put Adaptation into any of those three domains, create an eighth domain, or let an app
runtime become the de facto owner.

There is also a dependency-cycle risk. Intelligence consumes Identity for Opportunity Evaluation. If
an Identity-owned Adaptation implementation directly imports Intelligence to obtain opportunity
understanding, `Identity -> Intelligence -> Identity` becomes the package graph.

## Decision

### Domain and module ownership

**Adaptation is an Identity-owned service inside `packages/identity`, implemented behind the internal
`src/adaptation/` module boundary.** It is not an eighth domain, a fourth runtime or a network service.

Identity therefore contains two deliberately different boundaries:

1. **Durable Identity** is authoritative for `R`, `X` and the resulting `L` person-state.
2. **Adaptation** is authoritative only for temporary, context-bounded interpretation and
   representation artifacts.

Sharing a domain does not give Adaptation write access to Durable Identity. It reads through a narrow
Identity reader and follows the same rule as any other consumer: **Adaptation mutates no durable
person-state.**

### Authoritative state

Adaptation may be authoritative, for the lifetime of one task context, for:

- the **Adaptation Context** assembled for that task, including references and source revisions;
- the informational **Constraint Conflict Set** it derives;
- **Adapted State `A^c`**;
- contextual representation drafts rendered from that Adapted State;
- user edits to Adapted State or to one representation in that context.

These artifacts are operational state. They may be persisted in Identity-owned `adaptation_*` tables
when continuity, review or external model work requires it, but persistence does not make them Durable
Identity. They remain context-keyed, replaceable and removable. User edits may make an artifact
non-regenerable from the original inputs alone, but they still do not become `R`, `X` or `L`.

### Consumed authoritative state

Adaptation consumes, read-only:

- **Identity:** versioned `R`, `X` and `L`, plus claim/source provenance and disclosure visibility;
- **Intelligence:** a versioned, attributed opportunity/company/role understanding suitable for
  representation; this is not an evaluation or score;
- **Execution/caller:** the current task reference, application question or surface, current user
  intent for the task, and other Temporary Workspace state;
- **the user:** representation choices and edits.

Discovery remains upstream of Intelligence for opportunity sourcing and normalisation. Adaptation
does not read Discovery's tables or become another opportunity store.

### Cross-domain seams and dependency direction

- `packages/identity` defines the consumer-side opportunity-context port required by Adaptation.
- A composition root in `apps/api` or `apps/worker` wires an Intelligence adapter to that port.
- **Identity does not import Intelligence.** This avoids a package cycle while leaving Intelligence
  free to consume Identity for Opportunity Evaluation.
- Execution calls the exported Adaptation boundary and supplies task/workspace context. Adaptation
  does not import Execution or own the Application Workspace lifecycle.
- Execution may reference an Adapted State or representation while work is in progress. On actual
  submission, Execution freezes the submitted bytes/content into its immutable Application Record.
- Adaptation has no direct dependency on Memory or Development. A later real-world outcome may become
  a Record through its owning operational domain; a draft or representation edit is not one.

Exact DTOs, ports and method granularity are Slice 1 implementation choices. Contracts must carry
authoritative identifiers, source revisions and provenance rather than copying ownership into
Adaptation.

### Events

Creating, regenerating or editing temporary Adapted State is not a durable fact about the person, so
this stage adds no domain event. Historically this ADR placed `ApplicationSubmitted` with Execution;
ADR 0039 later moves publication to Application after submitted reality is recorded. A future event
is added only when an actual subscriber needs a meaningful state change, never merely to schedule an
internal model call.

### Hard negative boundary

Adaptation does **not** own or perform:

- writes to Reconstructed State, Stated Context or Learned State;
- professional-source ingestion, reconstruction, confirmation or correction;
- canonical opportunity records, opportunity understanding, company/role authority or evaluation;
- fit, trajectory, development-value or ranking scores;
- pursue/do-not-pursue decisions, filtering or application gates;
- the Application Workspace lifecycle, portal execution or immutable Application Records;
- slow learning, EvidenceItem accumulation or PCI updates;
- a canonical CV/profile store or any other durable identity projection;
- automatic promotion of a representation edit into person-state or a learning signal.

Constraint conflicts are outputs for the user to consider. They never disable an action.

## Consequences

- The seven-domain architecture remains intact and Adaptation lands where contextual representation
  already belongs.
- Durable Identity and Adaptation can share provenance and representation vocabulary without a
  cross-domain write or duplicate person model.
- The internal module boundary is load-bearing: code review must reject Adaptation imports of
  Identity repositories or tables even though both live in one package.
- Consumer-side ports prevent a compile-time Identity/Intelligence cycle. Runtime composition is
  explicit in the existing app runtimes.
- Execution retains historical authority: Adaptation produces a draft; Execution records what was
  actually submitted.
- Operational persistence may exist, but every such table must be named and documented as temporary
  adaptation state with a lifecycle. There is no default permission to retain it indefinitely.
- Cost: Identity now contains both canonical person-state and a temporary representation service.
  The separation must be enforced by module boundaries and tests rather than by a package boundary.

## Alternatives Considered

- **Create an eighth Adaptation domain/package.** Rejected: the current seven-domain model already
  assigns representation to Identity, and no distinct durable authority or deployment reason justifies
  another domain.
- **Put Adaptation in Execution.** Rejected: Adapted State and representations are reusable across
  CVs, answers, narratives and later non-submission surfaces. Execution owns acting and the historical
  record, not how identity is represented.
- **Put Adaptation in Intelligence.** Rejected: Intelligence owns understanding and evaluation of the
  opportunity. Giving it representation authority would blur "what does this opportunity mean?" with
  "how should this person be represented here?"
- **Make `apps/api` the owner.** Rejected: a composition root may orchestrate domains but cannot own
  business state or become an undocumented domain.
- **Let Identity import Intelligence directly.** Rejected: Intelligence already needs Identity for
  evaluation, producing a package cycle and unclear authority.

## Revisit When

Adaptation acquires durable state that genuinely outlives a task and is neither Identity nor an
Execution Record; the same Adapted State must be shared across unrelated domains with an independent
lifecycle; its operational load requires a separate runtime; or the Identity package can no longer
enforce the separation between canonical person-state and temporary representation behavior.
