---
name: career-memory-learning
description: The Slower Learning Loop — converting accumulated meaningful Records into justified PCI / Learned State updates. Covers Application Records, interview reflections, recruiter feedback, repeated edits, evidence preferences, outcomes, Development Signals, and constraint hypotheses.
---

# Career Memory and Learning

**The primary Slower Learning Loop workflow** (ADR 0006). It converts accumulated meaningful evidence
into *justified* updates to Personal Career Intelligence — the Learned State half of Durable Identity.

```
Records₁…ₙ → evidence aggregation → pattern evaluation
  → Observed / Inferred / Hypothesized → PCIₜ₊₁ → Durable Identityₜ₊₁
```

Every person starts at the **Baseline Identity State**: sparse Explicit State, an explicitly stated
career direction, and almost no PCI. This loop is how that becomes higher-resolution over time —
**Joby earns the right to infer more; it does not start with it.**

This is how Joby compounds. It is also where Joby could quietly do real harm, so the constraints
matter more than the capability.

## Slow, deliberately

The Fast Operational Loop — applications, portal execution, interview prep — produces **Records**.
This loop consumes them. Records are the only interface between the two.

- **It does not run at operational speed.** A live interaction may produce evidence; it does not get to conclude.
- **It updates PCI only when evidence justifies changing the learned model**, not whenever something happens.
- **It never learns from operational noise** — portal retries, dropdown errors, captcha events, transient UI failures. Those describe mechanics, not the person.
- It runs in `apps/worker` behind deferrable events, **idempotent on `event.id`**. Re-running interpretation must not strengthen a conclusion, or redelivery would manufacture confidence.

## The rule that governs everything here

**A single rejection, interview, or self-reflection must not become a permanent trait.**

One rejection is one rejection. It is not evidence that the person is weak at interviews, wrong about
their field, or aiming too high. A student who was rejected on a Tuesday must not find that Joby has
concluded something about them by Wednesday.

What follows from that:

- A single observation is `Observed` — the event happened. Nothing more.
- Interpretation requires a **pattern**: repetition, across contexts, over time, with a plausible mechanism. It is `Inferred`, and it stays labelled that way.
- Anything beyond that is `Hypothesized` — a question to ask the person, never a conclusion to store.
- Nothing becomes Explicit State about the person without **their** confirmation.
- Interpretations must be able to weaken and expire. A conclusion drawn from last term's evidence must not outlive the evidence, and the person must be able to see and reject any interpretation Joby holds about them.

## The three statuses, concretely

| Status | Means | Example |
|---|---|---|
| `Observed` | It happened. Directly evidenced. | Applied on 3 Feb; rejected 20 Feb; the feedback said X. |
| `Inferred` | A pattern across several observations, defensible from evidence. | Four rejections at technical screens, none at first-round chats. |
| `Hypothesized` | A candidate explanation. A question, not a finding. | Possibly under-prepared for algorithmic questions. |

They never collapse. The dangerous move is a hypothesis being stored, re-read later, and treated as
observed — check every path where interpretation is written and read back.

## Inputs

**Application Records.** Immutable facts about what was actually submitted, when, and to whom. The
richest longitudinal source in Joby. Never regenerate or correct one; if truth changed afterwards,
that's a new fact, not an edit.

**Interview reflections.** The person's own account. `Observed` as *their account* — which is not the
same as observed fact, and the distinction matters when the account is harsh about themselves.
Students routinely under-rate their own performance; do not compound that by treating self-criticism
as data about ability.

**Recruiter feedback.** Often vague, templated, sometimes untrue, occasionally contradicting the real
reason. Record verbatim with provenance. "Strong candidate, we went with someone with more
experience" is `Observed` as feedback, and evidence of nearly nothing.

**Repeated edits.** When the person consistently rewrites a phrasing, that's a signal about voice or
about a claim they're not comfortable making. Valuable — and easy to over-read. Ask before concluding.

**Evidence preferences.** Which EvidenceItems they keep, drop, or lead with across representations.
Strong signal about what they consider their real story. Use it for selection; never rewrite an item
because of it.

**Outcomes.** `OutcomeObserved`. Real-world results are the compounding substrate. Also the most
prone to over-interpretation, because outcomes are dominated by factors that have nothing to do with
the person — market conditions, timing, internal candidates, headcount freezes. Attributing a
market outcome to the person is the characteristic failure of systems like this.

## Longitudinal interpretation

Interpret across time, not per event. Look for repetition across independent contexts, sequences
(where in the funnel things end), and change over time — which is usually improvement.

Base rates first. If most placement applications end in rejection, a rejection carries almost no
information about this person. Weight the person's own account above inference. Prefer the
explanation that requires assuming least about them.

**Never infer sensitive characteristics.** Not disability, health, ethnicity, immigration status,
socioeconomic background — not from names, institutions, gaps, or phrasing. These come from the
person or not at all, and they remain the person's disclosure decision every single time.

## Development Signals

A Development Signal is a **surfaced observation the person can act on**, not a verdict about them.

- Specific and evidenced: "three technical screens ended after the algorithms round" beats "improve technical skills".
- Actionable. If there's nothing to do with it, it's a judgement, not a signal.
- Attributed — the person can see exactly which events produced it.
- Dismissible, and it stays dismissed.
- Framed as a gap between current evidence and a stated goal, never as a deficiency of character.

Development owns these. It consumes Memory's observed outcomes; it does not generate its own truth
about the person.

## Constraint hypotheses

Candidate explanations of something blocking progress — a missing skill, a geography, an
authorization constraint, an application-volume problem.

Always `Hypothesized`. Always shown as a question. Confirmed only by the person, never by
accumulating weight. Never combined into a profile or a score. Removable at any time, with everything
derived from them removed too.

If a hypothesis is one the person would find hurtful and can't act on, the right move is usually not
to surface it. "Compounding" is not a licence to tell someone what Joby thinks is wrong with them.

## Boundaries

Three domains, three responsibilities, kept separate on purpose (ADR 0005):

- **Memory** owns this process — evidence accumulation from meaningful Records, conservative PCI update logic, epistemic status handling. It publishes `EvidenceConfirmed` and `OutcomeObserved`, and it produces *justified* Learned State updates.
- **Identity** owns the resulting person-state, both Explicit State and Learned State/PCI. **Only Identity writes person-state**, and Explicit State only after the person confirms.
- **Development** owns longer-timescale interpretation of how the person is changing: constraints, development signals, interpretation of repeated experience.

Intelligence proposes; it confirms nothing. Execution and the fast loop feed this process Records —
they never write PCI directly.

`OutcomeObserved` is the canonical path in:

```
domain event → transactional outbox → durable Postgres queue → worker → this skill → justified PCI update
```

Deferrable, at-least-once, therefore **idempotent on `event.id`** — re-running must not produce a
second signal or a strengthened conclusion.

## Check before you finish

- Can one event alone create a durable trait? It must not.
- Does every interpretation carry its status and its evidence?
- Can the person see, question, and remove every interpretation Joby holds about them?
- Can any interpretation reach Explicit State without their confirmation?
- Does re-running interpretation strengthen a conclusion? That's a bug.
- Is any sensitive characteristic being inferred? Stop.
- Would the person, reading this about themselves, recognise it as fair?
