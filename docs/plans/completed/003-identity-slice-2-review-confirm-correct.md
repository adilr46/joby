# 003 — Identity Slice 2: Proposal → review → canonical E → correction (UC04–UC07)

## Goal

A user can review a reconstruction proposal, edit and exclude parts of it, confirm the retained set
**atomically** into canonical Reconstructed State, read it back, and correct it later — without
another reconstruction and without touching PCI.

## Provenance ownership checkpoint (roadmap R2, required before schema)

**Resolved: no domain boundary changes. Identity owns source provenance for its own canonical
nodes; Memory keeps EvidenceItems.** These are two different things, and the existing documents
already assign them separately:

| | Source provenance | EvidenceItem |
|---|---|---|
| Answers | "Where did this confirmed fact come from?" | "What evidence backs this claim in a representation?" |
| Attached to | A canonical Structure/Activity/Relation node | A claim in a tailored CV, an application answer |
| Cardinality | Intrinsic to the node; many sources may support one node | Reusable across many representations |
| Owner | **Identity** — ADR 0005 lists provenance inside Explicit State; ADR 0009/0011 say R "carries provenance for every confirmed fact"; `packages/identity/CLAUDE.md` invariant 13 and the write-authority table already give Identity this write | **Memory** — `packages/memory/README.md`, `identity-evidence` §EvidenceItems |

Identity storing where its own facts came from is not Identity owning evidence-for-claims. Nothing
in this slice creates an EvidenceItem, reads one, or writes a Memory table — Memory has no tables at
all yet.

**What stays open, and is R3/translation's problem, not this slice's:** whether confirmed Explicit
State nodes *become* EvidenceItems, are *projected into* them, or whether EvidenceItems are a
distinct Memory-owned accumulation. That question first has a real consumer when a representation
must cite something. **If you read the boundary differently, this becomes an ADR before R3** —
flagged rather than buried.

Also amended in this slice, per plan `000` §3.1: `identity-evidence` §User confirmation forbade
"a bulk accept", which as written forbids the mandated end-of-flow review. Reworded to separate
**bulk-accept-unseen** (still forbidden) from **reviewed-set confirmation** (required).

## Doctrine check

| Rule | How |
|---|---|
| AI never becomes truth without confirmation | Only `confirmReview` writes canonical nodes, and it requires an explicit decision for **every** proposed item |
| Reviewed set, not bulk accept | A confirmation missing a decision for any item is rejected, naming the items |
| Exactly the retained set, atomically | One transaction; excluded and rejected items are never written |
| Sparse Activity valid | A database CHECK requires ≥1 of contribution/capability/consequence and permits any subset |
| No competing canonical stores | Two canonical tables (`identity_explicit_node`, `identity_relation`). No Education/Experience/Projects/Skills table exists — tested |
| Correction never touches PCI | No Learned State table exists; corrections write Identity tables only — tested |
| `IdentityUpdated` only on canonical change | Published on confirmation that applied something, and on correction. Never on review-in-progress |
| Concurrency | Identity-level revision guards confirmation; node-level revision guards correction |

## Steps

1. Migration `0004`: canonical nodes, relations, provenance, review and correction history, revisions.
2. Canonical model types + repository.
3. Review service: decisions, validation, atomic apply, `IdentityUpdated`.
4. Correction service: add/update/remove, history, `IdentityUpdated`.
5. Read path: `getExplicitState`, `getDurableIdentity` returning R, X and L as distinct components.
6. API routes.
7. Tests.
8. Amend `identity-evidence`; update docs.

## What actually happened

Done and verified 2026-08-14. `pnpm typecheck` clean; **88 tests pass** (28 new). End to end through
real processes: a CV was captured, reconstructed, then confirmed with **8 decisions covering every
proposed item** — 5 retained, 1 edited, 2 excluded, plus 1 user supplement. Canonical E went to
revision 1 with 5 nodes and 2 relations; the excluded activity never appeared; a correction took it
to revision 2; a second write at the stale revision was rejected with **409**; two `IdentityUpdated`
events were published, both `userConfirmed`, revisions 1 and 2; `stated` came back `{}` and `learned`
came back `null`.

Decisions taken during implementation:

1. **One node table with a discriminator**, not two. Relations point at either kind, and a single
   node identity space gives those endpoints real foreign keys instead of a polymorphic id nothing
   can enforce. CHECK constraints keep Structure and Activity genuinely distinct — neither can carry
   the other's columns.
2. **The sparse-activity rule is a database constraint**, not only code: `identity_node_shape`
   requires at least one of contribution/capability/consequence and permits any subset. Tested by
   asserting a raw INSERT of an empty activity is rejected.
3. **Two concurrency scopes.** Identity-level revision guards whole-set confirmation; node-level
   revision guards corrections, so two people fixing two different facts do not collide. Tested both
   ways.
4. **A retained relation whose endpoint was excluded is an error, not a silent drop.** Dropping it
   quietly would mean the applied set is not the reviewed set.
5. **`exclude` and `reject` are distinct decisions** with identical effect on E. The resulting state
   is the same; only the history remembers which, and "not this, not now" is not "this is wrong".
6. **A review that retains nothing publishes nothing** and does not bump the revision — canonical
   Explicit State did not change, so `IdentityUpdated` would be false.
7. **`learned` is `null`, not `{}`** — distinguishable from "this person has an empty Learned State",
   which would be a claim rather than a gap.

Two things changed outside this slice: `identity-evidence` §User confirmation was amended (plan `000`
§3.1, now closed), and an R1 test that asserted canonical tables *did not exist* was rewritten to
assert they are **empty** after extraction — the stronger claim, and the one that keeps meaning as
the system grows.

**Not done, deliberately:** `apps/web`. The review UI is the natural home for a screen, but the slice
is provable through the API and a UI would have doubled it. Flagged as the strongest candidate for
the next slice.

## Out of scope

The Permanent Identity View projections (R3/UC11 — this slice only proves no competing store exists) ·
GitHub and enrichment (R3) · Stated Context capture (plan `000` §3.6) · PCI learning · `apps/web`.
