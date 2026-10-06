# ADR 0040 — PCI: Shared Model and Personal Layer

- **Status:** Accepted
- **Date:** 2026-10-02
- **Scope:** PCI learning structure — how population-level patterns and individual adjustments relate

## Context

The current PCI contract (ADRs 0030, 0031) is intentionally model-agnostic. `PciModel` accepts
resolved evidence and returns person-side, context-side, and routing priors through a stable
interface. No learning is implemented yet (`NoLearnedPci` is the active class).

The unresolved questions from ADR 0030 — "the minimal initial PCI feature representation, target
signals, loss function and update mechanism" — are still open. Before the first learning slice is
built, the **structure of what PCI learns** needs to be decided.

Two properties are currently underspecified:

**First, a new user has no personal history.** The existing model correctly returns empty priors
with zero support. That is honest but limited: there *is* useful prior information available from
aggregate patterns across other applicants, opportunities, representations, and outcomes. A new user
today gets nothing useful; that is a product gap.

**Second, personal evidence eventually dominates.** An experienced user should receive increasingly
individual judgement — patterns that are *theirs*, not population averages. The model must grow
toward the person, not stay fixed at the population mean.

These two requirements pull in the same direction: a **layered model**, where shared population
patterns provide the starting point, and personal evidence progressively adjusts from there.

## Decision

PCI has two layers. Both sit behind the existing `PciModel` interface — consumers ask for priors
and never know which layer answered or how the two were blended.

```text
SHARED LAYER
  learns from: resolved evidence across all persons (privacy-safe aggregate)
  keys patterns on: opportunity domain, role type, representation track, industry segment
  produces: population priors — "for opportunities of this kind, representations of this track
             have historically correlated with these outcomes"

PERSONAL LAYER
  starts from: the shared layer's prior for this person × opportunity × track combination
  adjusts on: this person's own resolved evidence — their edits, accepted framings, world outcomes
  produces: personalised priors — "for this person, in contexts like this, these patterns hold"
```

Together:

```text
personSidePrior(personId)          = blend(shared_person_style_prior, personal_adjustments)
contextSidePrior(personId, oppId)  = blend(shared_opportunity_prior, personal_context_history)
routingPrior(personId, oppId, reps) = blend(shared_track_weights, personal_track_history)
```

### The shared layer

The shared model accumulates patterns **without `personId`**. When evidence arrives, the shared
layer extracts the structural features of that application (role domain, seniority tier,
representation track, industry, progression outcome) and updates its aggregate pattern. The
individual's identity must not be recoverable from what the shared layer stores.

Key pattern dimensions the shared model tracks:

| Dimension | Examples |
|---|---|
| Representation track | SWE, Markets, Product |
| Role domain | software-engineering, finance, product-management |
| Seniority tier | early-career, mid, senior |
| Outcome trajectory | none → submitted → interviewed → offered |
| User-response pattern | edit rate, rewrite frequency, emphasis changes |

The shared layer returns a prior for a given combination of dimensions. Where no data exists, it
returns an honest zero-support prior — not an invented default.

### The personal layer

The personal layer is an individual adjustment on top of the shared prior. It starts with the
shared prior as its Bayesian starting point, then updates toward the individual's own resolved
evidence as it accumulates.

With zero personal applications: the personal layer contributes nothing and the shared prior
dominates. With many personal applications: the personal layer's weight grows proportionally to
the evidence count and the confidence the update earns.

```text
personalPrior(track) = bayesian_update(sharedPrior(track), personalEvidence(personId, track))
```

The personal layer stores only its own adjustments and the features of the personal evidence that
drove them — not a second copy of the application content.

### Evidence-proportionate disclosure

The prior outputs gain explicit provenance so consumers can present them honestly:

```text
PersonSidePrior
  observations:          string[]   -- human-readable, challengeable
  supportingApplications: number    -- personal resolved applications behind this
  sharedSupport:          number    -- cross-person patterns behind the shared starting point
  basis: 'personal' | 'shared' | 'both'

ContextSidePrior
  (same additions)

RoutingPrior
  weights: Map<representationId, number>
  (no provenance change needed at this interface — Router already bounds prior influence)
```

This is what keeps claims evidence-proportionate (JOBY_MEMORY §7). A new user sees
`basis: 'shared'`, `supportingApplications: 0` — and any surface that renders this can say "based
on patterns from similar applications" rather than "you consistently thrive here", which remains a
doctrine violation until personal evidence accumulates.

### What does not change

- **The `PciModel` interface contract is unchanged.** `observe`, `personSidePrior`,
  `contextSidePrior`, `routingPrior`. Consumers depend on this; the layered implementation is
  invisible to them.
- **Signal family separation.** The shared model tracks `user_response` and `world_response`
  separately. Population preference ≠ population effectiveness, just as individual preference ≠
  individual effectiveness.
- **PCI returns priors, never truth.** Neither layer writes Identity, Opportunity, Adaptation or
  historical Applications.
- **Idempotency.** Both layers guard against double-counting: `applicationId` is checked before
  the personal layer updates, and a content hash of the structural features is checked before the
  shared layer updates.
- **No mechanical noise enters either layer.** Portal retries, captchas, selector failures — not
  learning input.

### Privacy boundary

The shared layer must never be a covert channel from one person's career to another. This means:

- The shared layer receives only the structural *features* extracted from evidence (role domain,
  seniority tier, track, progression outcome, edit-pattern summary), never the textual content of
  an application or the identity of its author.
- No query against the shared layer can reconstruct which individuals contributed to a pattern.
- The personal layer stores adjustments keyed by `personId`. Cross-person reads are never performed.

### Progression seam (unchanged from ADR 0030)

The layered model is one step in a described progression. Both layers remain behind `PciModel`.

```text
NoLearnedPci (current: honest zero)
  -> LayeredPci: shared database-backed counts + personal Bayesian adjustments   ← this ADR
  -> richer population model (e.g. clustering over role × track × outcome)
  -> increasingly individual models (sequence models over personal history)
  -> dedicated ML service if operational evidence ever justifies it
```

## Consequences

- A new user immediately benefits from aggregate patterns — they see a real prior rather than
  nothing — without Joby pretending that prior is personal insight.
- An experienced user sees increasingly personal judgement as their own resolved evidence grows.
- The `PersonSidePrior` and `ContextSidePrior` types gain `sharedSupport` and `basis` fields.
  Consumers that currently use these types must handle the new fields; existing consumers only
  read `observations` and `supportingApplications`, so new fields are additive.
- `NoLearnedPci` remains valid and unchanged. It is the correct implementation until a `LayeredPci`
  is built with real database backing.
- The shared layer requires cross-person evidence flow into PCI, which means the event handler for
  `OutcomeObserved` must extract and forward structural features to the shared model without
  forwarding identity. This is a new responsibility for the PCI event consumer, not a change to
  Application or Identity.
- Privacy constraints mean the shared layer must be implemented and reviewed as a distinct concern
  before it receives any real data.

## Unresolved

- Exact feature extraction: the function that maps `ResolvedApplicationEvidence` → structural
  features for the shared layer. Must be deterministic and identity-free.
- Blend function: exactly how personal and shared weights are combined when both have evidence
  (weighted sum by count, Bayesian update, or something else).
- How `basis` is determined at read time when both layers contribute.
- Database schema: whether shared and personal state live in the same `pci_*` tables with a
  `person_id IS NULL` sentinel for shared rows, or in separate tables.
- Minimum shared-layer corpus before a prior is surfaced to consumers (to avoid surfacing a
  shared prior built from one application).
