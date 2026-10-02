# PCI

**Status: contract only, no learning implemented.** The independent learned PERSON × WORLD authority
(ADR 0031).

```text
resolved Application evidence  ->  PCI  ->  person-side / context-side / routing priors
```

## Owns

The learned relational model, and the process that maintains it.

**PCI is not part of Identity.** Identity owns what is professionally *true* about the person; PCI
owns what Joby has come to *believe* about how this person and the professional world interact.

```text
Identity    = truth about PERSON.
Opportunity = current model of EXTERNAL WORLD.
PCI         = learned model of PERSON × WORLD.
```

## Two signal families, kept apart

| Family | Examples | What it evidences |
|---|---|---|
| **User response** | accepted or rejected framing, edits, evidence included or removed, recurring preferences | How this person prefers to operate and be represented |
| **World response** | recruiter response, screening and interview progression, rejection, offer, feedback | How the world appears to respond to them under a given representation |

```text
user preference ≠ external effectiveness
```

Someone liking a framing is not evidence it works; a rejection is not evidence they were wrong to
want it. They are separately typed rather than one union with a `kind`, because a shared shape
invites code that handles "a signal" generically — which is how "you liked this" and "this worked"
become one undifferentiated belief.

## Three prior paths out

Person-side, context-side, and routing weights for Router. All are **priors, not truth**.

## The progression seam

```text
simple / database-backed priors
  -> statistical learning
  -> population and clustering priors
  -> increasingly individual models
  -> a dedicated ML model or service
```

Every stage sits behind `PciModel`. A consumer asks for priors and never learns which stage
answered, so the progression is an implementation choice rather than an architectural event.

## Why nothing is learned yet

The feature representation, target signals, loss function and update mechanism are undecided. A
plausible default would be a learned belief nobody chose, applied to someone's career.

`NoLearnedPci` returns empty priors with **zero support**, and that is the honest answer rather than
a gap: at the Baseline there is almost nothing to learn from. `observe` accepts resolved evidence and
retains none — Application is the durable record, and storing a second copy before the model that
would use it exists is persistence ahead of a decision.

## Hard boundaries

- Learns **only** from resolved Application evidence. Not live drafts, not Adaptation state, not
  execution telemetry. Mechanical noise is excluded by default: logging is not meaning.
- Cannot write Identity, Opportunity, Adaptation or a historical Application. No interface here
  points at them, and a test pins the surface.
- Idempotent on `applicationId`: an application resolved once must not count twice, or redelivery
  would manufacture confidence.
