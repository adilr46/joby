# ADR 0006 — Two-Timescale Career Intelligence

- **Status:** Accepted
- **Date:** 2026-08-12
- **Domains affected:** Memory, Development, Identity, Execution, Intelligence
- **Builds on:** [ADR 0005](0005-durable-identity-as-the-person-centric-primitive.md) (Durable Identity, Explicit vs Learned State), [ADR 0004](0004-transactional-outbox-and-postgres-durable-queue.md) (durable delivery)

## Context

ADR 0005 established Learned State (PCI) inside Durable Identity. It did not say **when** it changes,
and that turns out to be the load-bearing question.

Joby does two things at incompatible speeds. It reacts to live professional pressure — an application
due tonight, an interview tomorrow — where latency matters and the person needs Joby to be decisive.
And it learns who this person is becoming, where being decisive on thin evidence is the failure mode.

Run them on one timescale and one of two things happens. Either learning inherits operational speed —
a rejection arrives on Tuesday and by Wednesday Joby believes something durable and discouraging
about the person, which is the harm this product must not cause. Or operational work inherits
learning's caution, and Joby is too slow to help with the thing the student actually needs help with.

There is also a volume problem. The operational loop generates enormous quantities of events that
describe *mechanics*, not the person: portal retries, dropdown mismatches, captcha checkpoints,
transient UI failures. Feeding those into a learning process produces confident conclusions from
noise.

## Decision

Two explicitly separated loops, with **Records as the only interface between them.**

### Fast Operational Loop

React to live professional contexts using the current Durable Identity and PCI as a **baseline**.

```
Durable Identity + current context → Workspace → Translation / Decision / Action → meaningful Record
```

Used during opportunity evaluation, applications, portal execution, interview preparation, recruiter
communication, networking, and other live professional interactions.

- It may change **Workspace or session state** freely.
- It **generally must not directly rewrite long-term Learned State.** A live interaction may produce evidence; it does not get to conclude.
- Explicit State changes are possible here but only through the ordinary confirmation gate (ADR 0005).

### Slower Learning Loop

Aggregate meaningful evidence across many professional experiences and update PCI **only when the
evidence justifies changing the learned model.**

```
meaningful Records → evidence aggregation → pattern evaluation
  → Observed / Inferred / Hypothesized → PCI update → higher-resolution Durable Identity
```

May consume: Application Records, Interview Records and reflections, recruiter feedback, outcomes,
repeated user edits, evidence-selection patterns, projects, professional experiences, development
experiences.

**Must not store or learn from trivial operational noise** — portal retries, dropdown errors, captcha
events, transient UI failures. If a signal describes the mechanics of a portal rather than something
about the person, it does not enter this loop.

### Why single events must not rewrite learned identity

A single event is one observation, and observations about careers are dominated by factors external
to the person — market conditions, timing, internal candidates, headcount. `Observed` is what a
single event supports. `Inferred` requires a pattern across independent contexts with a plausible
mechanism. `Hypothesized` is a question to ask, never a conclusion to store.

Concretely: a single rejection, interview, or self-reflection must not become a permanent trait.
Learned State must also be able to weaken and expire as evidence ages.

### How this maps to existing infrastructure

The slow loop needs no new infrastructure. It is exactly the shape ADR 0004 already built for:

```
domain event → transactional outbox → durable Postgres queue → worker → deferrable handler → justified PCI update
```

- `OutcomeObserved`, `InterviewRecorded`, `ApplicationSubmitted` and `EvidenceConfirmed` are the events that feed it.
- Slow-loop handlers are **deferrable**, run in `apps/worker`, and are therefore **at-least-once — idempotent on `event.id`**. Re-running interpretation must not strengthen a conclusion; that would let redelivery manufacture confidence.
- The fast loop's inline handlers stay inline.

Ownership follows ADR 0005: **Memory** owns the learning process and conservative PCI update logic;
**Development** owns longer-timescale interpretation and signals; **Identity** owns the resulting
person-state and is the only domain that writes it.

**No new events are added for this.** The existing six are interpreted under the new architecture.

## Consequences

- Live features can be fast and decisive without their speed leaking into what Joby believes about the person.
- PCI updates are traceable to an aggregation over Records, not to whatever happened most recently.
- The person can be told *why* Joby thinks something, because the input set is a set of Records.
- **Cost:** latency between an experience and Joby learning from it. That is the intended trade, and it should not be "fixed".
- **Cost:** deciding what counts as a *meaningful* Record versus operational noise is a judgement call per feature. Getting it wrong in the permissive direction poisons the learned model, so the default is to exclude.
- The fast loop reads a PCI baseline that may be slightly stale. Acceptable: a slightly old belief about a person is far better than a freshly wrong one.
- Idempotency stops being merely a delivery concern and becomes a correctness property of learning.

## Alternatives Considered

- **One loop, update learned state as things happen.** Rejected: produces exactly the harm the product must avoid — durable conclusions about a person from single events.
- **Learn synchronously but require more evidence.** Rejected: the threshold ends up enforced in scattered call sites rather than in one process with one owner.
- **A scheduled batch job over all history.** Not rejected outright, but not the mechanism: event-driven aggregation reuses ADR 0004 and keeps provenance per Record. A periodic re-evaluation may be added later without changing this decision.
- **Statistical machinery now** (Thompson Sampling, Bayesian update schemas). Explicitly out of scope. The separation of timescales is the architectural decision; the method for evaluating patterns is a later, separate one and needs its own ADR.

## Revisit When

Learning latency becomes a felt product problem; the "meaningful Record vs noise" line proves
unworkable in practice; or the pattern-evaluation method needs to be formalised beyond
`Observed`/`Inferred`/`Hypothesized`.
