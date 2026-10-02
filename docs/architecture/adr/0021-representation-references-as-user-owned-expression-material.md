# ADR 0021 — Representation References as user-owned expression material

- **Status:** Accepted
- **Date:** 2026-08-16
- **Domains affected:** Identity (ownership), Adaptation (consumer)
- **Related:** ADR 0011 (Explicit State and Stated Context), ADR 0010 (a source is never identity),
  ADR 0022 (written representation), ADR 0016 (the general CV)

## Context

Generated application material that does not sound like the person is worse than useless — they will
not send it, or they will send it and be asked about it in an interview. The obvious fix is to let
them show Joby how they write: a previous cover letter, an answer they were happy with, a piece of
professional writing.

That material has to live somewhere, and it is dangerous in a specific way. A previous cover letter
is full of *claims* — "I led the redesign", "I have always been drawn to markets" — written for a
different audience, possibly overstated, possibly no longer true. If it enters Joby as identity, the
system inherits every exaggeration a nervous student ever wrote about themselves, and launders it
into future applications as fact.

The doctrine that introduced these references places them "within Durable Identity / Explicit State",
while also requiring that they "must not independently establish professional facts or claims".
Those two statements cannot both hold literally: ADR 0011 defines `E = (Structure, Activity,
Relations)` as reconstructed professional reality, and anything inside `E` **is** a factual claim
about the person.

## Decision

**A Representation Reference is persistent, user-owned, Identity-owned material that is not part of
`E`, `X` or `L`.**

It sits beside professional sources, and inherits their governing rule (ADR 0010):

> A source is never canonical identity. A CV is the person's prior representation of themselves —
> evidence of a claim, not the claim.

A representation reference is the same kind of object, kept for a different purpose. A professional
source is material Joby **reconstructs facts from**, through proposal and confirmation. A
representation reference is material Joby **learns expression from**, and never reconstructs.

| | Professional source | Representation reference |
|---|---|---|
| Answers | what has this person done? | how does this person write? |
| Feeds | reconstruction → proposal → confirmation → `E` | expression: tone, structure, vocabulary |
| May establish a fact | yes, once the user confirms it | **never** |
| Reconstructed | yes | **no — nothing extracts claims from it** |

### What that forbids, concretely

- No reconstruction path may read a representation reference. It produces no proposals, so it has no
  route into `E` even with user confirmation — the user confirming "this sentence appeared in my old
  cover letter" is not the user confirming the sentence is true.
- No generated claim may cite a reference as its grounding. Every professional claim still resolves
  to canonical Identity provenance (ADR 0016); a reference explains *how something is said*, never
  *that it is so*.
- A reference must not become a second opportunity to state professional truth. If a person notices
  something true in an old letter that Joby does not hold, the route is the ordinary one: state it,
  and confirm it into `E`.

### Ownership and lifecycle

Identity owns them. The user is the only author: they add them explicitly, and they can remove them.
They persist until removed — a person's way of writing is not opportunity-specific, which is why this
is not Adaptation state.

Adaptation reads them through Identity's public boundary, exactly as it reads everything else, and
cannot write them.

### Deliberately unresolved

```text
ResolveReferenceConflict(...) = PLACEHOLDER
```

Two references may pull in different directions — a formal letter and a conversational one, or a
reference whose voice contradicts the framing the person chose in their lens. **No implementation may
silently resolve such a conflict**, and in particular may not resolve it in a way that overrides
factual grounding or current user agency.

Also unresolved, and not to be settled in passing: how references are stored, how many a person may
keep, whether they are scoped to a lens, and whether Joby ever proposes one from material it already
holds.

## Consequences

- Generated material can sound like the person from the first application, before any learning
  exists — which is the whole point, since PCI starts empty (ADR 0008).
- The dangerous path is closed structurally rather than by care: references have no reconstruction
  path, so there is no code that could promote a claim from one.
- Cost: Identity now holds a third class of durable user material (sources, stated context,
  references), and each has different rules. The distinction is only obvious if the naming stays
  precise — "reference", never "source".
- A reference is personal writing and may contain sensitive disclosures the person would not repeat
  in every application. Visibility and disclosure handling for references is not solved here.

## Alternatives Considered

- **Put references in `E`.** Rejected: `E` is what is true about the person, and a previous cover
  letter is what they once said. It would launder old overstatement into future applications as fact.
- **Put them in Stated Context `X`.** Rejected: `X` is what the person says about their situation and
  direction; a writing sample is neither, and mixing them would make `X` a document store.
- **Make them Adaptation state.** Rejected: they are reusable across every application, and
  Adaptation state is temporary and opportunity-scoped.
- **Derive voice from the person's confirmed facts instead.** Rejected: `E` records what they did,
  not how they write, and inferring a voice from it would be invention.
- **Let a reference ground a claim when the user confirms the reference.** Rejected: confirming that
  a document is theirs is not confirming that its contents are true, and conflating the two is
  exactly how the failure happens.

## Revisit When

UC10/UC11 are implemented and references meet a real generator; conflicting references need
resolution (the placeholder above); disclosure handling for personal writing becomes necessary; or
Memory begins learning expression preferences, at which point the relationship between explicit
references and learned preference needs its own decision (ADR 0022).
