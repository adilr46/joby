# ADR 0014 — Identity Representation as a persistent, non-canonical projection

- **Status:** Accepted — extended by ADR 0015
- **Date:** 2026-08-15
- **Domains affected:** Identity (Durable Identity, Adaptation)

> **2026-08-15 — extended by [ADR 0015](0015-representation-positioning-as-decisions-over-canonical-nodes.md).**
> The decision below is unchanged and still binding. ADR 0015 builds the decision layer §9 deferred:
> select/hide, priority, emphasis and context-independent framing, stored as decisions **about
> canonical node ids** in their own tables — `identity_representation` still holds only a lens. It
> also settles the invariant this ADR did not need yet: a lens is a **prior, not a boundary**.
> `HiddenInLens ≠ UnavailableToAdaptation`.
- **Related:** ADR 0005 (Durable Identity), ADR 0009 (projections, not stores), ADR 0011 (Explicit
  State by write authority), ADR 0012 (Adaptation ownership), ADR 0013 (Adapted State across the
  application cycle)

## Context

Joby has two ways of showing a person their professional truth, and neither fits what a placement
student actually wants to keep.

- The **Permanent Identity View** is the complete projection of Reconstructed State at read time
  (ADR 0009). One per person, unnamed, unlensed, everything at once.
- **Adapted State** is temporary and tied to one opportunity: `A^C = T(E_t, L_t, C)` (ADRs 0012,
  0013). It exists for one application cycle and is discarded.

A student applying into markets, investment banking and software engineering does not want one
undifferentiated view, and does not want to rebuild their framing from scratch for every posting.
They want a small number of **reusable lenses** they keep and return to:

```text
V_i = P_i(E_t)
```

and then, for a specific posting, they want Adaptation to work from one of them:

```text
Markets Identity Representation + Barclays Markets JD -> Barclays Markets Adapted State
```

This is a persistent, user-observable object that is **not** canonical truth — which is exactly the
shape ADR 0009 rejected for Education/Experience/Projects/Skills, and for good reason: a stored
projection is a second, staler copy of the person's history, and it will look like a performance
win. The decision below exists to introduce persistence without introducing a second source of
truth.

There is also a vocabulary collision to settle. "Representation" already means Adaptation's
contextual rendering — a tailored CV, an application answer.

## Decision

### 1. A third boundary inside Identity

Identity now contains three deliberately different boundaries:

| Boundary | Owns | Lifetime |
|---|---|---|
| **Durable Identity** | canonical `R`, `X`, `L` | permanent, until the user changes it |
| **Identity Representation** | named, reusable, non-canonical lenses over `E_t` | persistent, until the user deletes it |
| **Adaptation** | temporary opportunity-specific state `A^C` | one application cycle |

Identity Representation lives at `packages/identity/src/representation/`. It is not a new domain, not
a deployment, and not part of Durable Identity.

### 2. It persists a lens, never a fact

**`identity_representation` stores a name, a purpose, and ownership. Nothing else.**

There is no content, snapshot, section, node-list or summary column, and there must never be one.
The representation's content is **derived from Reconstructed State at read time**, through the same
projection the Permanent Identity View uses. Reading a representation returns:

- the stored lens;
- **lineage** — the person, the durable identity root, the canonical revision it was derived from,
  and when;
- the projection, in which every entry carries the canonical `nodeId` and visibility behind it.

Consequences that follow directly, rather than by discipline: nothing to synchronise, nothing to
invalidate, no drift, and no way to hold a fact canonical Explicit State does not stand behind.

### 3. Non-canonical means non-canonical

Creating or reading an Identity Representation:

- does not write `R`, `X` or `L`, and does not move the identity revision;
- records no correction and no provenance;
- **publishes no event.** `IdentityUpdated` means a confirmed change to canonical Explicit State,
  nothing else. Choosing to look at your history through a lens is not a change to your history.

This is enforced structurally, not by review: the representation module holds a two-method read port
onto Durable Identity and no canonical repository or transaction. It cannot write person-state
because it was never given anything that could.

### 4. A lens is not Stated Context

An Identity Representation is user-authored, which makes it adjacent to `X` — and it is not `X`.

> **Stated Context** is what the person says about where they are going. Person-state, canonical,
> user-owned (ADR 0011).
>
> **An Identity Representation** is which reusable projection of their truth they want to keep. Not
> a claim about them at all.

Someone may hold a Markets representation while their stated Career Direction is something else, or
unstated entirely. Creating one must never write `X`, and `X` must never be inferred from one.

### 5. It is reusable, and never opportunity-specific

A representation carries no opportunity, JD, requirements or company. The moment a lens is bound to
one posting it is Adapted State, and Adapted State belongs to Adaptation, temporarily.

The purpose field is deliberately opaque free text — no taxonomy of industries, functions or
domains — for the same reason `X` is not decomposed (ADR 0011): a schema written first limits what a
person may say about their own professional intent to what was imagined in advance.

### 6. The Durable Identity seam

Identity Representation consumes canonical state through a narrow **read-only** port:

```text
Durable Identity --(findPerson, projectIdentity)--> Identity Representation
```

It is wired to Durable Identity's public read interface, so the content a representation shows is the
same derivation the Permanent Identity View shows — one projection, not two implementations that can
disagree about the same person.

### 7. The Adaptation seam

Adaptation may **read** an Identity Representation as a starting lens for an opportunity:

```text
Identity Representation (V_i) + opportunity understanding (C) -> Adapted State (A^C)
```

Three rules govern that seam, and none of them is implemented yet because no Adaptation behaviour
exists:

- **A representation is a lens, not source truth.** Claims still ground in canonical Identity
  provenance. Adaptation must not treat a representation's projection as the thing it reads instead
  of `E_t` — that would be translating a translation.
- **Adaptation never writes an Identity Representation.** Opportunity-specific selection, ordering,
  emphasis and wording belong to Adapted State, for that cycle.
- **A representation does not narrow what Adaptation may read.** ADR 0013 locked a broad canonical
  snapshot; the lens says which framing the user prefers, not which facts exist.

### 8. Vocabulary

The full term **Identity Representation** is used everywhere, in prose and in code, precisely
because "representation" is taken:

| Term | Means | Owner |
|---|---|---|
| **Identity Representation** (`V_i`) | persistent reusable lens over Durable Identity | Identity |
| **Contextual representation** | a tailored CV, answer or narrative rendered from Adapted State | Adaptation |

### 9. Deliberately not in this slice

Selection and hiding, ordering and emphasis, persistent wording edits, rendering, synchronisation,
and application submission. When persistent user *decisions* arrive, they arrive as their own rows
keyed by canonical node id — so a decision always reads as "what the user chose about this fact",
never as the fact itself.

## Consequences

- A person can keep several stable professional framings, and Adaptation gets a meaningful starting
  point that is not "the whole identity, every time".
- ADR 0009 is not weakened. The rule was never "nothing about identity may be persisted" — it was
  "no derived projection of person-state becomes a second store". A lens is not a projection of
  person-state; the projection is still computed.
- Correcting a fact updates every representation of it at once, with no refresh path, because there
  is nothing to refresh.
- The Identity contract widened from nine capabilities to twelve. That is a deliberate widening with
  named consumers (the web/API surface now, Adaptation next), asserted by the export-surface test so
  the next widening also has to be argued for.
- Cost: Identity now holds a persistent table that is *not* person-state, and the distinction is
  carried by the schema, the read port and the tests rather than by a package boundary. If a later
  slice adds a content column to `identity_representation`, everything above quietly stops being
  true.
- A person's representation of an empty identity is empty. Sparse is a correct answer (ADR 0008),
  and nothing here fills it in.

## Alternatives Considered

- **Store the derived content with the representation.** Rejected: it is the second source of truth
  ADR 0009 exists to prevent, and it immediately requires synchronisation, invalidation and drift
  handling — all to avoid a query that already exists.
- **Make it a filter over the Permanent Identity View with no persistence.** Rejected: the user asked
  for something they keep and return to. A lens that disappears is not reusable, and the next slice's
  ordering and wording decisions need somewhere to live.
- **Put it in Adaptation.** Rejected: Adaptation is temporary and opportunity-scoped by ADRs 0012 and
  0013. A reusable lens that outlives every application cycle would break the property that makes
  Adapted State safe to discard.
- **Make it Stated Context.** Rejected: `X` is canonical person-state about direction. A lens is a
  view preference, and merging them would let a UI choice become a claim about who the person is.
- **Make it an eighth domain.** Rejected: it is a projection of Durable Identity, and Identity's verb
  is *Represent*.
- **Apply the lens now — filter the projection by purpose.** Rejected as out of scope by the slice,
  and rightly: selection is the next decision, it is AI-shaped, and it needs the review and
  provenance treatment that a filter written in passing would not get.

## Revisit When

Representations acquire persistent user decisions (selection, ordering, wording) and the decision
layer needs its own concurrency and history rules; a representation needs to be shared, exported or
submitted externally; a lens genuinely needs to be applied at derivation time rather than after it;
or `identity_representation` is proposed to hold anything other than a lens — which is the signal
that this decision has stopped holding.
