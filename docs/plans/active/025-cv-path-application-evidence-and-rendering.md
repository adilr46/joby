# 025 - CV path, application evidence and rendering

## Goal

Make Joby's CV flow use the right authority at each point:

```text
CV source today -> confirmed Profile Units
Opportunity -> structured demand
Router -> selected Representation
Adaptation -> reuse/adapt CV path and contextual render plan
Rendering -> artifact
Application -> submitted snapshot and outcome history
PCI later -> strategy priors from resolved application evidence
```

The old `career-ops` flow is the reference implementation for artifact rendering and outcome
recording, not the authority model. Joby keeps the useful behavior and translates it into Identity,
Opportunity, Router, Adaptation, Application and PCI ownership.

## Domains affected

- **Identity** — owns confirmed Profile Units, Representations and Stated Context. The CV is the
  primary source today, but only as an ingested source of evidence.
- **Opportunity** — owns the JD/posting evidence and structured understanding.
- **Router** — selects the best Representation for the Opportunity.
- **Adaptation** — decides whether to reuse the selected Representation or produce a contextual CV,
  and prepares a grounded render plan when needed.
- **Rendering** — produces HTML/PDF, generated LaTeX or user-owned `latex-tex` artifacts from the
  render plan.
- **Application** — records the submitted artifact snapshot and append-only outcome history.
- **PCI** — later learns strategy priors from resolved Application evidence, not identity truth.

## Doctrine check

- **CV source is not runtime truth.** `cv.md`, `resume.tex` or another CV file may be the first
  source, but tailoring uses confirmed Profile Units.
- **Professional claims come only from Identity.** Application outcomes and PCI priors may affect
  strategy, ordering, thresholds and effort, but never create skills or achievements.
- **Reuse before render.** Rendering is skipped when the selected Representation already covers the
  Opportunity well enough.
- **Adaptation remains contextual.** JD-specific wording, ordering and slot patches do not update the
  persistent Representation.
- **Application history is append-only evidence.** Submitted artifacts and outcomes are historical
  records, not drafts to rewrite.
- **PCI is downstream.** This slice prepares resolved evidence so future PCI can learn; it does not
  implement learning.

## Source-system references from `career-ops`

The following `career-ops` behaviors are the reference points:

- `outcome.mjs` — archives submitted artifacts, appends `outcome.md`, syncs tracker state and writes
  transition history.
- `modes/outcome.md` — product rules: verbatim feedback, append-only history, idempotent reruns and
  explicit posting stubs.
- `lib/outcome-types.mjs` — one shared outcome vocabulary with aliases and canonical meanings.
- `calibrate.mjs` — reads outcome journals: last entry wins, feedback blocks are collected, unknown
  final outcome clears earlier optimistic state.
- `set-status.mjs` — current status update plus transition ledger; the ledger is observation
  history, not the current source of truth.

Joby should translate these into Application-owned submission snapshots, outcome journals and
resolved evidence reads.

## CV path threshold

```text
reuse
  if selected Representation covers all must-have Opportunity requirements
  and top evidence already appears near the top
  and vocabulary gap is low

adapt
  if requirements are supported by Identity/Profile Units
  but ordering, emphasis, recovery or vocabulary needs contextual change

needs_attention
  if requirements are unsupported, the selected Representation is the wrong lens,
  or the Opportunity is too vague to justify tailoring
```

Spend tokens, slot patching and PDF/LaTeX rendering only when the Opportunity would materially
change selection, ordering, prominence or wording of confirmed evidence.

## Application evidence model

Application should own two durable records:

1. **Submission snapshot** — what was actually submitted or selected to submit: CV artifact, cover
   letter if any, posting snapshot, Opportunity revision, selected Representation, Adaptation/render
   references and render surface.
2. **Outcome journal** — append-only entries containing outcome type, canonical state, stage reached,
   verbatim feedback and notes.

Resolved Application evidence is then derived from those records:

- reached interview;
- reached offer;
- terminal positive or negative;
- no response / discarded;
- feedback signals;
- strategy used: Representation, reuse/adapt decision, prominent evidence and render surface.

Those resolved signals become future PCI training/evaluation material.

## Rendering surfaces

- **HTML/PDF** — ATS-first artifact generated from the grounded render plan.
- **Generated LaTeX** — Overleaf-compatible `.tex` and compiled PDF generated from the same grounded
  plan.
- **`latex-tex`** — user-owned `.tex` parsed for editable prose slots, patched only where grounded,
  then compiled. The parser must fail closed on ambiguous LaTeX and preserve layout/macros.

Rendering adapters should not perform semantic selection. They consume Adaptation's render plan.

## Steps

1. Define Application submission snapshots and outcome journals as the durable historical spine.
2. Translate the `career-ops` outcome vocabulary into Joby outcome semantics.
3. Add resolved Application evidence reads for progression and feedback signals.
4. Implement Router selection of persistent Representation for an Opportunity.
5. Implement CV path decision: `reuse`, `adapt`, `needs_attention`.
6. Add a renderer-neutral contextual CV render plan grounded in Profile Units.
7. Add rendering adapters for HTML/PDF, generated LaTeX and `latex-tex`.
8. Preserve unresolved gaps and unsupported requirements visibly instead of rendering around them.
9. Prepare the resolved evidence boundary that PCI will later learn from.

## Verification

- A well-covered Opportunity reuses the selected Representation and performs no rendering.
- A covered-but-buried Opportunity produces an adapted render plan without changing the
  Representation.
- Unsupported requirements produce `needs_attention`, not invented keywords.
- Submitted artifacts are snapshotted immutably under Application.
- Outcome updates append history; the latest readable entry is current, and feedback remains
  verbatim.
- Resolved Application evidence can identify progression signals and the strategy used.
- Rendering artifacts cite grounded Profile Units or non-professional render metadata only.

## Out of scope

- PCI model training or prediction.
- Automatic persistent Representation changes from contextual CV work.
- External design renderers such as Canva.
