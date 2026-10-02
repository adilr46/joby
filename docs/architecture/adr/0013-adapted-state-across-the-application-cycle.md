# ADR 0013 — Adapted State across the application cycle

- **Status:** Accepted
- **Date:** 2026-08-15
- **Domains affected:** Identity (Adaptation), Execution, Intelligence, Memory
- **Related:** ADR 0012 (Adaptation ownership — **extended by this ADR**), ADR 0005 (Durable
  Identity), ADR 0006 (two timescales), ADR 0007 (Opportunity Evaluation), ADR 0011 (the Adaptation
  signature)

> **Notation clarification (2026-08-16).** Rewritten ADR 0011 restores Explicit State as
> `E = (Structure, Activity, Relations)` and makes Stated Context `X_t` distinct. References below
> to a broad `R, X, L` snapshot mean `E, X, L`; no Adaptation ownership or lifecycle decision changes.

## Context

ADR 0012 placed Adaptation inside Identity as a Fast Operational Loop service and fixed what it may
not own. It described Adaptation's authoritative state as scoped to "one task context" and its
Identity access as "a narrow Identity reader", and it described the Execution seam as one-way at
action time: task context in, representation draft out, submitted copy frozen into the Application
Record.

Working through the placement cycle exposed three things that decision did not settle.

1. **How much Identity does Adaptation read?** "Narrow reader" is ambiguous between a narrow *write*
   surface and a narrow *scope*. If Identity pre-selects the evidence relevant to a role, Identity
   acquires a contextual-relevance responsibility that belongs to Adaptation, and the first slice
   needs a query/retrieval abstraction nobody has designed.
2. **How long does Adapted State live?** An application is not one task. It runs through submission,
   assessment, interview, further rounds and an outcome. Treating each stage as an unrelated task
   context throws away the contextual state the next stage needs.
3. **What happens to what the cycle produces?** Test results, recruiter feedback and interview
   occurrence are facts about what happened. Joby's readings of them ("your strongest signal was
   implementation rather than leadership") are not facts, and neither is PCI. Without a rule, either
   the interpretation leaks into person-state or the factual result never reaches the context that
   needs it.

Nothing here reopens ADR 0012's ownership decision. Adaptation remains an Identity-owned Fast
Operational Loop module, separate from Durable Identity, with no canonical write path.

## Decision

### 1. Identity read boundary — broad snapshot, selection inside Adaptation

Adaptation reads a **broad canonical Identity snapshot**: versioned `R`, `X` and `L` with provenance
and visibility, not a role-filtered subset.

```text
Identity:   what is true?
Adaptation: what matters here?  ->  Selected(E_t | C)
```

**Identity must not pre-select evidence for a role.** Contextual relevance selection is Adaptation's
responsibility and stays inside Adaptation.

ADR 0012's "narrow Identity reader" is hereby read as **narrow in authority, not in scope**: a
read-only interface with no write path and no repository or table access. Breadth of the snapshot
does not widen what Adaptation may change, which remains nothing.

### 2. Intelligence seam unchanged

Intelligence remains outside Identity and supplies structured, **attributed** opportunity
understanding — role, company, requirements, preferred capabilities, responsibilities, location,
duration, compensation, sponsorship and work-authorisation requirements, application questions,
uncertainty and source attribution — through the existing consumer-side port wired in an app
composition root.

Intelligence must not decide which of the person's projects or evidence is best for them. That is
Adaptation's selection step. Adaptation must not consume a fit, trajectory or development-value
verdict as representation truth.

### 3. Adaptation's authoritative state

Adaptation is authoritative, for the active application cycle, only for:

- the **Adaptation Context**, including input references and source revisions;
- informational **conflicts**;
- **Adapted State `A^c`**;
- **representation state and drafts**;
- **operational user edits**;
- **stage-specific contextual interpretation**.

Persistence for continuity does not promote any of these into Durable Identity.

### 4. User edits change Adapted State

A user edit to wording, contextual emphasis, positioning, ordering, inclusion or exclusion of a
particular experience, or how a specific experience is framed in this context, updates the **current
Adapted State** — not merely one rendered document, so later representations stay consistent.

```text
A^c --user edit--> A^c'      does not imply  E_t -> E_t+1
                             does not imply  L_t -> L_t+1
```

Changing professional truth is a separate Identity act. Learning is the Slower Learning Loop.

### 5. The Application Record is the durable temporal spine — Execution-owned

The **Application Record** is the durable temporal spine of the application cycle and remains
**Execution-owned**. It accumulates what actually happened, in order: created, applied, assessment,
interview, further rounds, offer / rejection / withdrawal.

```text
AR_t+1 = AR_t + ΔReality_t
```

Submitted CVs, submitted answers, communications and other externally completed actions become
**immutable historical reality** in the Application Record at the moment of submission. A submitted
CV does not change because Adapted State later changes.

Adaptation neither owns the Application Record nor writes to it. Execution freezes the submitted
copy.

### 6. Adapted State continues across the cycle, with a changing role

Adapted State continues across the **active application cycle** as the current stage-specific
contextual state.

- **Pre-application** it is primarily system-generated contextual adaptation — selected evidence,
  positioning, contextual framing, wording — with **optional** user edits. The system does most of
  the work; the user intervenes where they want to.
- **At the submission boundary** the working representation leaves through Execution and becomes
  historical reality in the Application Record. Adapted State does not follow it.
- **Post-application** each stage supplies further information into the current Adapted State, whose
  role shifts from representation to stage preparation and interpretation.

### 7. Factual results enter automatically; interpretations require user agency

```text
Result -> Application Record -> Adapted State
```

Externally observed **factual results** — test score, progression to interview, interview occurred,
recruiter feedback received, final-round invitation, rejection, offer — are recorded first as
historical facts in the Application Record, and relevant facts **may automatically become inputs** to
the current Adapted State.

**System-generated interpretations and insights from later stages are user-governed.** Each one is
presented for review with exactly four dispositions:

```text
system insight -> accept | edit | decline | challenge
```

Only a reviewed insight enters the user's current operational Adapted State. An accepted or edited
stage insight remains **operational Adapted State** and does not automatically become PCI.

### 8. The three-way separation

This is the invariant the rest of the ADR exists to protect:

```text
Application Record = what happened                 (Execution, durable, immutable)
Adapted State      = current contextual response   (Adaptation, temporary, per cycle)
Memory / PCI       = what accumulated resolved history eventually justifies learning
```

> Joby acts quickly, records continuously, and learns slowly.

Memory receives nothing directly from Adaptation. Only a later meaningful real-world Record from its
owning operational domain enters the slower loop.

### 9. Hard negative boundary — unchanged and extended

ADR 0012's negative boundary stands in full. Adaptation does not own or perform opportunity scoring
or ranking, trajectory or development-value evaluation, Opportunity Evaluation, autonomous gating,
opportunity authority, Discovery, portal execution, application lifecycle, Application Record
authority, permanent CV/profile state, canonical identity mutation, PCI mutation or slow learning.

Two promotions are named explicitly, because this ADR creates the paths that would tempt them:

- **no automatic promotion of a representation edit into identity;**
- **no automatic promotion of a stage insight into PCI.**

### 10. Deliberately deferred

These stay open and **must not be hardened in code** by an implementation slice that does not need
them resolved:

| Deferred | What is open |
|---|---|
| Result vs insight classification | The distinction is fixed; the exact classification rules are not |
| Adapted State historical retention | Whether prior stage-specific Adapted States are discarded, lightly snapshotted, or selectively preserved; versioning |
| Adaptation → Memory handoff | Which reviewed insights, if any, accompany a resolved Application Record into Memory |
| Persistence mechanics | Tables, JSONB shapes, versioning, reconciliation, lifecycle |
| Refresh triggers | The precise rule determining when a new application event regenerates Adapted State |

None of these blocks use-case decomposition or the first implementation slices.

## Consequences

- Adaptation can be decomposed into slices: ownership, read boundary, lifespan and governance are all
  settled, and every remaining question is an implementation detail with a named owner.
- The first slice avoids building an Identity contextual-query abstraction. Identity exposes truth;
  relevance lives in one place.
- A broad snapshot is a **read** widening only. It increases what an Adaptation bug could expose in a
  representation, so visibility and provenance must survive the snapshot — private sources stay
  private through selection and rendering.
- Adapted State now has a lifetime measured in application cycles, not requests. Continuity, refresh
  and retention become real design questions — deliberately deferred, and therefore real risks to
  watch rather than solved problems.
- A new seam exists in the direction ADR 0012 did not describe: Execution's recorded results become
  inputs to Adaptation. It carries **facts only**, and does not give Execution authority over Adapted
  State or Adaptation authority over the record. Wiring stays in a composition root; Identity still
  imports neither Intelligence nor Execution.
- Stage insights need a review surface before they can exist at all. Accept / edit / decline /
  challenge is a product requirement, not a UI preference — an insight that appears without one of
  those four dispositions is a doctrine violation.
- Cost: Adaptation holds more state, for longer, than a purely regenerable projection would. The
  separation from Durable Identity is now carried entirely by the module boundary, the write-authority
  table and tests.

## Alternatives Considered

- **Identity pre-selects role-relevant evidence.** Rejected: it moves contextual relevance into
  Identity, which owns what is true rather than what matters now, and forces a retrieval abstraction
  before any slice needs one.
- **Adapted State is scoped to a single task and rebuilt per stage.** Rejected: the interview stage
  needs the positioning the application used. Rebuilding from scratch loses it or silently
  reinvents it.
- **Later-stage insights go straight into Adapted State.** Rejected: an interpretation the user never
  saw becomes an unchallengeable claim about them, at exactly the moment they are most vulnerable to
  it.
- **Accepted insights update PCI directly.** Rejected: it is the Fast Operational Loop concluding.
  ADR 0006 exists to prevent precisely this, and one interview is not a pattern.
- **Application Record moves to Adaptation, or Adapted State moves to Execution.** Rejected: "what
  happened" and "how should this be understood now" have different mutability, different lifetimes
  and different owners. Merging them loses the immutability guarantee on one side or the
  regenerability on the other.

## Revisit When

Reviewed stage insights need to reach Memory (that handoff is deferred, and defining it is a decision
this ADR does not make); Adapted State needs to outlive the application cycle or be shared across
unrelated cycles; retention/versioning of prior Adapted States becomes load-bearing; or the automatic
Result → Adapted State path starts carrying anything that is not a plain external fact.
