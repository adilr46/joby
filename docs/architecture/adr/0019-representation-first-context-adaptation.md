# ADR 0019 — Representation-first context adaptation

- **Status:** Accepted
- **Date:** 2026-08-16
- **Domains affected:** Identity (Adaptation, Identity Representation), Intelligence (by seam)
- **Related:** ADR 0018 (Module 1), ADR 0016 (the representation prior), ADR 0015 (positioning),
  ADR 0013 (broad snapshot, Adapted State lifespan), ADR 0007 (Opportunity Evaluation is
  Intelligence's)

## Context

Module 1 makes an opportunity legible. Module 2 is the first slice that actually *adapts* the
person's professional material to it, producing `A^C`.

The obvious implementation is the wrong one. Given a broad canonical snapshot (ADR 0013) and an
opportunity, the natural move is to re-select from the whole of Durable Identity for every posting:
score every fact against every requirement, keep the best. That is a fresh opportunity-specific
identity each time — and it quietly makes the Identity Representation decorative. The person spends
effort deciding how they generally want to be seen in Markets, and the system overrules it on every
application.

It also inverts the architecture built over ADRs 0014–0016, where the lens is the reusable prior and
Durable Identity is what it draws from.

A second question: `A^C` continues across the application cycle (ADR 0013 §6), and ADR 0013 §10
defers its persistence, retention and versioning. This slice has to produce one without settling any
of that.

## Decision

### 1. Representation-first

```text
P_i(E_t) = default adaptation surface
E_t      = authoritative fallback reservoir
```

Adaptation begins from the lens the person selected, and consults Durable Identity **only where the
lens does not expose something this opportunity asks for**.

```text
normal      P_i(E_t) + C -> A^C
fallback    P_i(E_t) + C -> Recover(E_t, C) -> A^C
```

`recoveryUsed: false` is the healthy case and is reported on every Adapted State, so "the lens
covered it" is observable rather than assumed.

When no lens is selected there is no baseline, so everything the posting asks for is a gap and
recovery supplies it — still selectively, never the whole identity. A person applying outside every
lens they keep is a normal case (ADR 0016), not a reason to abandon selectivity.

### 2. Relevance is canonical capability equality, and nothing cleverer

An element **speaks to** a requirement when the activity's own `Capability` component matches it
under normalisation (case and spacing only).

No synonyms, no substring matching, no similarity scoring. "Your rota scheduler shows Python" must
mean the person confirmed Python on that activity — not that a machine thought it looked likely.
Where the posting asks for something no canonical evidence records, it is reported as
`unevidenced`. **Thin evidence is a real answer** (ADR 0008); inventing something to fill the gap is
the failure this architecture exists to prevent.

To make this possible, the read-time projection now carries each activity's capability components
per entry. That is canonical data — the `Capability` component of `aᵢ` — surfaced, not derived.

### 3. Assessment is representational, never evaluative

The assessment judges **the representation**: what already lands, what is relevant but understated,
what the lens exposes that this posting does not ask about, and where the lens is silent.

It produces no score, rank, fit judgement or pursue verdict about the opportunity or the person.
Opportunity Evaluation is Intelligence's authority (ADR 0007), and a test asserts the assessment
carries no scoring vocabulary.

De-emphasis is phrased as *"nothing this posting asks for is recorded against it"*, never as
"irrelevant". The person put it in their lens; this module has an opinion about ordering for one
application, not about the work.

### 4. Recovery is selective and gap-driven

Recovery walks the gaps the assessment found, and only those. Evidence that speaks to nothing this
opportunity asks about is never pulled in, however impressive. A per-gap cap keeps a long history
from burying the positioning the person maintains.

Recovered evidence arrives **exactly as Explicit State records it** — the lens has no framing for it,
because the lens does not expose it. Every element carries `origin`, `nodeId`, `canonicalTitle` and a
rationale, so a person can always see what came from their positioning, what came from their wider
history, and why.

### 5. Nothing is mutated, and nothing is dropped

Composing `A^C` writes nothing: not Durable Identity, not the lens, not Learned State, and no event.
**Recovering evidence a lens hides does not un-hide it** — hiding is a positioning prior, not an
evidence boundary (ADR 0015), and one opportunity does not rewrite how someone generally presents
themselves.

Nothing the person positioned is dropped from `A^C` either. An element this posting ignores stays,
ordered behind what it asks about.

### 6. Adapted State is composed on request, not stored

`A^C` is derived from the lens, the canonical snapshot and the interpreted context. No table, no
rows, no versioning — so nothing can go stale, and ADR 0013 §10's retention, refresh and
reconciliation questions **stay deferred**.

The trigger to revisit is precise: **user edits to Adapted State (UC12)**. An edit is a decision that
cannot be recomputed from inputs, and the moment it exists persistence becomes necessary. Until then
building it would be speculative machinery.

### 7. This module renders nothing

No CV, no cover letter, no application answer, no submission. `A^C` carries the professional material
those need; producing them is Module 3.

## Consequences

- The lens earns its keep: maintaining it changes every subsequent application, and the system
  starts from it rather than second-guessing it.
- `recoveryUsed` is a useful signal about a person's positioning — a lens that triggers recovery on
  every opportunity is a lens that needs attention. (Acting on that signal is Memory's, later, and
  user-governed.)
- Adaptation is cheap and deterministic: given the same lens, identity and context, the same state.
  Every judgement is explainable in one sentence to the person it is about.
- Cost: capability-equality matching only sees what the person recorded as a capability. An activity
  described richly in prose but with no capability components will not be found by recovery. That is
  a real limitation, and the honest one — the alternative is guessing.
- Cost: composing on request means `A^C` cannot yet be edited. That is the deferred decision above,
  not an oversight.

## Alternatives Considered

- **Re-select from the whole of Durable Identity per opportunity.** Rejected: it makes the lens
  decorative, discards the person's own positioning by default, and re-solves the identity for every
  posting.
- **Score evidence against requirements and rank.** Rejected: it is Opportunity Evaluation wearing a
  selection algorithm's clothes, and a number would imply a precision the evidence does not support.
- **Text similarity between requirements and evidence prose.** Rejected: it manufactures relevance
  claims the person never made, and a wrong one is invisible to them.
- **Drop de-emphasised elements from `A^C`.** Rejected: the person positioned them, and silently
  removing their material for one posting is the lens being overruled.
- **Persist Adapted State now.** Rejected: nothing in this slice needs it, and it would settle three
  deferred questions in passing.

## Revisit When

User edits to Adapted State arrive (UC12) — persistence becomes necessary then, and with it retention
and refresh; Module 3 begins and `A^C`'s shape meets a real renderer; capability equality proves too
narrow against real placement postings; or Memory exists and `recoveryUsed` becomes a signal worth
learning from.
