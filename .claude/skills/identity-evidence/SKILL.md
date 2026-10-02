---
name: identity-evidence
description: Turning a person's professional experience into Durable Identity Explicit State, reusable EvidenceItems, and truthful contextual representations. Use for CV/project/experience ingestion, provenance, canonicalization, EvidenceItem creation, claim traceability, user confirmation, and anything touching truth vs representation.
---

# Identity and Evidence

The path from what a person actually did to what Joby can truthfully say about them:

```
professional experience → explicit structured truth (Durable Identity Explicit State) → reusable EvidenceItems → truthful contextual representation
```

Every stage is lossy in a specific way, and the doctrine exists to stop the losses compounding.

This skill operates against **Durable Identity's Explicit State** — the half of Durable Identity that
holds what is explicitly true about the person (ADR 0005) — and it **writes there only through
user-confirmed Durable Identity updates.** It never touches Learned State / PCI; that is the
`career-memory-learning` skill's territory, on a much slower timescale.

Much of this work happens at the **Baseline Identity State**, where establishing grounded Explicit
State *is* the product: Joby may know little, but what it claims to know should be grounded.

## The distinction everything rests on

**Explicit State** is durable, user-owned, singular. **E = (R, X)** (ADR 0011).

**Reconstructed State (R) = (Structure, Activity, Relations)** — Structure (institutions,
organisations, programmes, roles, periods), Activity (**aᵢ = contribution, capability, consequence**,
any subset valid), and a small typed Relations vocabulary between them, plus provenance and the
captured sources. **This is the only thing reconstruction writes.**

**Stated Context (X) = (CareerDirection, Preferences, Constraints)** — authored **only** by the user.
A source may state a direction; that is evidence the person once wrote an ambition down, not their
current direction. Surface it as a proposal marked historical if it is useful, and never as fact.
**Writing X from an extraction is the violation this split exists to prevent.**

**Education, Experience, Projects, Skills and Achievements are projections of that graph, never
stores.** Skills in particular are capability components aggregated across activities: a maintained
skills list is a claim with nothing behind it. If you find yourself writing a fact into a table named
after one of those sections, the model has been misread.

**A representation** is a contextual rendering for a specific audience — a tailored CV, a profile, an
application answer. Derived, plural, disposable.

Consequences that are easy to get wrong:

- Generating a representation **never** mutates Explicit State.
- A representation is never a source. Nothing reads a generated CV to learn about the person.
- Editing a tailored CV changes the **current Adapted State** behind it, so later representations
  stay consistent (ADR 0013) — it changes nothing durable. If the user is actually correcting a
  *fact*, that is a separate, explicit act against Explicit State — and it needs confirmation.
- Deleting a representation loses nothing. Deleting Explicit State loses the person's history.

## Ingestion

Sources: an uploaded CV, a described project, a stated experience, a portal profile, an outcome
observed later.

- **Preserve the raw source.** Store what was uploaded, unmodified, with its capture time. Extraction improves; you cannot re-extract from something you discarded.
- Extraction is AI work: it runs in `apps/worker`, behind a deferrable event, and it produces **proposals**.
- Never assume the CV is accurate. It is the person's prior representation of themselves — evidence of a claim, not the claim itself.

## Provenance

Every EvidenceItem records where the fact came from, when it was captured, what produced it (which
source, which extraction, which model), and its epistemic status.

**Evidence without provenance cannot back a claim.** Not "should not" — it is unusable, because the
user cannot confirm what they cannot trace.

## Canonicalization

Turning extracted fragments into structured truth. This is where fabrication enters if you let it.

- Normalise shape — dates, organisations, roles. Do **not** normalise meaning.
- **A sparse activity is finished, not partial.** Contribution with no consequence stays that way; the shape does not invite you to complete it.
- Never upgrade: "contributed to" does not become "led"; "helped build" does not become "built"; a vague date does not become a precise one.
- Conflicts between sources are **not** resolved by choosing the better-sounding one. Surface both and ask.
- Uncertain is a valid Explicit State value. A missing end date is missing, not inferred from context.
- Deduplicate carefully — two similar roles at one organisation may be one role or two, and guessing wrong rewrites someone's history.

## EvidenceItems

Discrete, traceable, **reusable**. Reuse is the point: the same evidence backs claims across many
representations, so the same fact cannot diverge between two documents the person sends to two
employers.

- One fact per item, small enough to cite and to reuse.
- Carries epistemic status: `Observed` (in the source, stated by the user), `Inferred` (derived, defensible), `Hypothesized` (a guess awaiting confirmation). These never collapse into each other.
- Owned by Memory. Identity references them; it does not own them.
- Evidence is never silently rewritten. New understanding creates a new item with its own provenance.

## Claim traceability

**Every claim in every representation resolves to a specific EvidenceItem by id.**

If evidence doesn't support a claim, the output is a gap — not a plausible sentence. A generated
document must be able to answer, for each line: which evidence, and how does the user know that.

A claim whose evidence is later withdrawn or corrected becomes a claim needing attention. Find those
before the user sends the document, not after.

## User confirmation

**AI suggestions must never silently become Explicit State.**

- Proposals are stored and displayed as proposals, visually distinct from confirmed truth.
- **Confirmation is a decision about every item the user has seen.** Two shapes are legitimate: per-item confirmation, and **reviewed-set confirmation** — the whole reconstruction presented at the end of a flow, each item individually editable and excludable, then applied atomically. The second is what the Identity roadmap requires, and it is not a bulk accept: the user has addressed each item.
- **Bulk acceptance of the unseen is the violation** — "accept all" on a set the user never looked at, confirmation implied by continuing, or anything skipped above a confidence threshold. A threshold that bypasses confirmation is the violation wearing a feature's clothes.
- Make it mechanically impossible rather than a rule to remember: `packages/identity`'s confirmation requires an explicit decision for every proposed item and rejects the call if any is missing, so there is no input that means "accept all".
- Record who confirmed and when.
- The user can reject, edit, or leave a proposal pending indefinitely. Pending is a normal state, not a queue to clear.
- **Consequential claims and sensitive disclosures always require an explicit decision** — never defaulted, never inferred, never pre-filled.

## Check before you finish

- Can any path write AI output into an Explicit State record without confirmation?
- Does generating a representation touch Explicit State?
- Does every claim resolve to a real EvidenceItem?
- Does epistemic status survive every transformation — extraction, storage, generation, display?
- Is the raw source still there?
- Would the person recognise this as their own history, or a flattering summary of it?
