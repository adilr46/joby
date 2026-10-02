# ADR 0022 — Written representation: elicitation over fabrication

- **Status:** Accepted — implemented 2026-08-16 (plan `015`)
- **Date:** 2026-08-16
- **Domains affected:** Identity (Adaptation), Execution (Application Record), Memory (future signal)
- **Related:** ADR 0021 (representation references), ADR 0019 (Adapted State), ADR 0013 (the
  application cycle, the Application Record), ADR 0006 (two timescales), ADR 0020 (the CV path seam)

> **Implementation note (2026-08-16).** UC10/UC11 are built. The two placeholders below are now
> *replaceable boundaries with provisional defaults*, not absent code: `SatisfactionGate` and
> `ReferenceSelectionPolicy` are interfaces with `Provisional*` implementations that report
> `provisional: true`. The provisional gate asks only for what is structurally underivable
> (a cover letter's motivation and timing; a why-question; a disclosure) and carries no thresholds,
> confidence values or completeness scores. Attribution and PCI learning remain entirely unbuilt.

## Context

UC10 generates an answer to an application question; UC11 generates a cover letter. Both put words in
a person's mouth that they will send to an employer under their own name, and be asked about in an
interview.

The failure mode is not bad prose. It is **fabricated meaning**: a model that has an Adapted State
full of true facts, a question asking "why do you want to work here?", and no information about why
this person wants to work here — and writes something plausible anyway. Nothing in the professional
truth is violated. The person is simply given a motivation they do not have, in their own voice, and
may not notice until an interviewer asks them to expand on it.

The same shape recurs with a cover letter: "why this opportunity" is not derivable from fit. That a
role suits someone is not evidence that they want it.

## Decision

### 1. Four inputs, with one authority

```text
Representation = Render(
    AdaptedState,              contextual professional truth — the authority for claims
    SurfaceContext,            question, limit, structure, format, opportunity
    RepresentationReferences,  how this person writes (ADR 0021)
    ApplicationSpecificInput   what Joby cannot safely infer, and therefore asks for
)
```

**Adapted State grounds every professional claim.** References shape expression and establish
nothing. Surface context constrains form. Application-specific input supplies meaning that only the
person has.

### 2. Elicitation over fabrication

Where meaningful intent, motivation, disclosure or context is missing, **Joby asks the person** and
keeps asking until it can generate without inventing.

```text
Assess -> ask if necessary -> incorporate -> reassess -> gate
                                              ├── insufficient -> keep asking
                                              └── sufficient   -> generate
```

```text
SatisfactionGate(...) = PLACEHOLDER
```

The gate's algorithm is **unresolved and must not be invented in passing** — no thresholds, no
confidence values, no completeness score. What is decided is the invariant it serves:

> Joby continues eliciting until it can generate the representation **without fabricating meaningful
> user intent or claims.**

When the gate is eventually implemented, the safe failure is to keep asking, not to proceed.

Elicited information belongs to the current opportunity's adaptation context. It does **not**
automatically become Explicit State or PCI. If something a person says while writing an application
turns out to be durable truth about them, it enters `E` the ordinary way: explicitly, confirmed.

### 3. Fit is not motivation

A cover letter combines *why this opportunity*, *why this person is relevant*, and *why now*. Only
the middle one is derivable from Adapted State. **The other two are the person's, and are asked
for.** Converting a good match into stated enthusiasm is fabrication with a professional veneer, and
it is forbidden.

### 4. Draft, edit, submit

Generated material is a **draft**. User edits — wording, emphasis, evidence selection, positioning,
ordering, inclusion/exclusion, tone — change the current representation/adaptation state and never
Explicit State or PCI (ADR 0013 §4).

Generation and submission stay distinct. Before submission the material is temporary
Adaptation-owned working state. On submission it becomes immutable history in Execution's Application
Record, which preserves enough to understand what actually went out: the artifact, its framing, the
evidence used, meaningful user edits, the associated opportunity and question, and later progression.

**Not** every generation attempt or micro-edit. A record of what happened is not a keystroke log, and
keeping one would make the record unreadable while telling nobody anything.

### 5. The learning contract is deliberately thin

Submitting something is not evidence that it worked.

```text
Submitted representation + subsequent progression -> representation-performance signal

RepresentationPerformanceSignal(...) = PLACEHOLDER
UpdateRepresentationLearning(...)    = PLACEHOLDER
```

Memory treats progression as **observational** evidence and nothing more:

```text
Progression ≠ proof the representation caused success
Rejection   ≠ proof the representation caused failure
```

Placement outcomes are dominated by factors the representation had nothing to do with — headcount,
timing, a stronger candidate, an internal referral. Attributing them to wording would teach Joby
superstitions and then apply them to someone's career.

The signal is interpreted at the **application/representation-package level**, never as proof that
one answer, sentence or letter caused an outcome. Attribution and PCI update logic stay unresolved.

The long path, when it exists:

```text
explicit references -> initial personalised generation
submitted applications -> Application Records -> repeated signals -> Memory
  -> justified PCI representation learning -> better future generation
```

**One edit, one application or one outcome never establishes a permanent learned preference**
(Product Doctrine 10). Adaptation cannot write PCI at all; Memory concludes, slowly, across resolved
history.

## Consequences

- The generator has a defined way to be honest about not knowing: ask. That is a product behaviour
  and a UI requirement, not an error path.
- Cover letters will sometimes require input before Joby produces anything, which is slower than a
  system that guesses. That is the intended trade.
- The Application Record gains a defined content scope for submitted written material, and an
  explicit instruction not to become an edit log.
- Memory gains a signal it is explicitly forbidden from over-reading — recorded now so that when it
  is built, "we always meant this to be causal" is not available as a reinterpretation.
- Cost: two placeholders (the gate, and attribution) sit on the critical path of the next slices.
  Both are named here so they are chosen deliberately rather than discovered as accidents.

## Alternatives Considered

- **Generate with what is available and let the user fix it.** Rejected: a fluent invented motivation
  is exactly the kind of error people accept because it reads well, and the cost lands in an
  interview.
- **Infer motivation from the person's history.** Rejected: `E` records what they did, not why they
  want something next. It is the same invention with an evidential costume.
- **Score how complete the context is and generate above a threshold.** Rejected: it is the
  satisfaction gate, invented rather than decided, and a number would imply a precision nothing
  supports.
- **Preserve every draft in the Application Record.** Rejected: the record is what happened in the
  world, not what was typed on the way there.
- **Treat progression as representation performance directly.** Rejected: it is correlation
  presented as attribution, and it would be learned about a person's career.

## Revisit When

The satisfaction gate is designed (it is the blocking decision for UC10/UC11); the elicitation surface
meets real users and the asking/answering loop needs its own state; Execution implements the
Application Record and "meaningful user edits" needs a definition; or Memory begins and the
performance signal needs an actual attribution model.
