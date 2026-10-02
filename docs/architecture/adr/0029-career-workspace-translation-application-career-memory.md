# ADR 0029 — Career Workspace, Translation Layer, Application and Career Memory

- **Status:** Topology superseded by [ADR 0031](0031-identity-router-translation-application-pci.md)
  (2026-09-03). Its umbrella/state-ownership separation, per-owner mutation rule and
  Application-as-junction constraints are retained there.
- **Date:** 2026-09-01
- **Scope:** Product architecture, semantic ownership and fast/slow-loop information flow
- **Supersedes:** ADR 0023; ADR 0024; ADR 0025; ADR 0026; ADR 0027; the module-placement parts of
  ADRs 0007, 0008 and 0028

## Context

Joby's prior architecture evolved through several locally correct decisions: one modular core,
Translation enclosing Intelligence/Adaptation/Execution, Opportunity separate from Intelligence,
and Application history feeding Career Memory. The repository consequently teaches multiple
topologies at once. Product umbrellas, semantic authorities, packages and runtime terms are mixed,
and Application appears after the fast loop instead of as the live junction that spans it.

The model needs one authoritative description while preserving a critical architectural principle:
product grouping, semantic ownership, implementation layout and deployment topology are different
questions. A conceptual umbrella does not require a package, process or network boundary.

## Decision

### Product architecture

```text
CAREER WORKSPACE
      ↓
TRANSLATION LAYER
      ↓
APPLICATION
      ↓
CAREER MEMORY
```

- **Career Workspace** is what the user maintains about themselves and how they generally want to
  be represented.
- **Translation Layer** understands the opportunity, maps person ↔ opportunity, adapts
  representation and executes the application.
- **Application** owns the live and historical career interaction across its lifecycle.
- **Career Memory** interprets accumulated resolved history and learns selectively and slowly.

These are product umbrellas and lifecycle concepts, not deployment units. In active architecture,
**Translation Layer** is the canonical term. “Translation Service” does not imply a distributed
service; ADR 0023's evidence-before-distribution rule remains valid.

### Semantic architecture

```text
CAREER WORKSPACE
├── Durable Identity
└── Identity Representation

TRANSLATION LAYER
├── Opportunity
├── Adaptation
└── Execution

APPLICATION
└── Application

CAREER MEMORY
└── Memory / PCI
```

Semantic modules own behavior, invariants and state. Product umbrellas own none of the state beneath
them and grant no module privileged access to another. Current packages and runtimes may compose or
split these responsibilities differently while the implementation catches up.

## Semantic ownership

- **Durable Identity** owns authoritative professional truth: Explicit State, user-authored Stated
  Context, provenance and the held learned understanding used as PCI.
- **Identity Representation** owns persistent, user-governed general positioning over that truth:
  lenses, decisions, expression references and reusable materializations.
- **Opportunity** owns opportunity evidence and records, attributed opportunity understanding,
  person ↔ opportunity mapping and evaluation of that relationship. **Opportunity Intelligence** is
  information produced by Opportunity, not a separate semantic module.
- **Adaptation** owns temporary opportunity-specific representation decisions, Adapted State,
  elicited application input, contextual drafts and operational representation edits.
- **Execution** owns temporary attempts/actions within an Application lifecycle: submission
  orchestration, portal interaction state and mechanical feedback. It does not own the Application.
- **Application** owns the live lifecycle and the immutable historical account of what happened. It
  is the junction between fast operational work and slow learning.
- **Memory / PCI** owns slower interpretation of accumulated resolved history and the generalized
  learned understanding produced from it. Durable Identity remains the governed holder of resulting
  person-state; Memory cannot bypass that boundary.

## Governing distinctions

- Career Workspace is a product/UX umbrella over Durable Identity and Identity Representation, not a
  second store and not the owner of Application task state.
- Translation Layer is a product umbrella over Opportunity, Adaptation and Execution, not a facade,
  shared interior, deployment or network service.
- Application exists throughout its lifecycle. Execution attempts are temporary actions inside that
  lifecycle; Application records their meaningful result.
- Career Memory is the product concept; Memory / PCI is its semantic authority and learned output.
- Representation is persistent and user-governed. Adaptation is temporary and opportunity-specific.
- Information may flow backward through learning, but semantic ownership never flows backward with it.

## Fast and slow loops

### Fast operational loop

```text
Career Workspace + Opportunity + Adaptation + Execution → current Application
```

Current identity and representation, Opportunity Intelligence, adaptation decisions and execution
activity feed the live Application through public capabilities. Each semantic owner mutates only its
own state. Application preserves the meaningful state actually used without acquiring authority over
its sources.

**Fast loop adapts the current application.**

### Slow learning loop

```text
resolved Application history → Memory → PCI → future Opportunity / Adaptation priors
```

Application passes meaningful resolved evidence forward: what was submitted, meaningful changes,
communications, outcomes and other durable observations, together with traceable references or
snapshots of the Opportunity, Adaptation and final Execution state actually used. Memory interprets
patterns across that history and produces governed PCI proposals.

Future Opportunity and Adaptation reasoning may read held PCI as a prior. PCI does not silently
rewrite Durable Identity, Identity Representation, historical Applications or prior Translation
state.

**Slow loop adapts Joby's future expectations.**

Mechanical execution noise—retries, selectors, dropdown failures, captchas and transient portal
errors—stays inside Execution and is not learning input by default. Logging is not meaning.

## Core information-flow contracts

1. **Workspace + Fast Loop → Application.** Current Durable Identity, Identity Representation,
   Opportunity Intelligence, Adaptation decisions and meaningful Execution activity inform the live
   Application.
2. **Application → Memory.** Application exposes resolved meaningful history through its future
   public capability or meaningful identifier-based notification. Memory never reads Application or
   Translation tables directly.
3. **Memory / PCI → Future Fast Loops.** Held PCI returns as learned priors for future Opportunity and
   Adaptation reasoning. The receiving module remains the only writer of its state.

These contracts establish meaning and direction, not DTOs, event taxonomies, persistence shapes or
algorithms.

## Consequences

- Application is both the live coordination junction and the durable temporal spine of a career
  interaction.
- Opportunity intelligence and representation decisions remain traceable into what was actually
  attempted and submitted.
- Slow learning sees resolved evidence rather than live drafts or operational telemetry.
- Future reasoning can improve without rewriting historical truth or user-governed positioning.
- Module collaboration remains through public interfaces and meaningful events; no cross-module
  table access or writes are introduced.
- The modular core, one-database default, runtime composition freedom and evidence-before-
  distribution rule remain valid technical defaults.

## Implementation alignment

The current layout does not yet mirror the semantic diagram:

- **B — conceptual naming mismatch:** `@joby/opportunity` owns capture/evidence while
  `@joby/translation/intelligence` owns understanding
  and person mapping. Under this ADR they are two implementation partitions of the **Opportunity**
  semantic authority. The `Intelligence` package name and `intelligence_*` tables are a conceptual
  naming mismatch, not a license for cross-writes and not a reason for an immediate migration.
- **B — conceptual naming/layout mismatch:** `packages/translation` currently contains
  `intelligence/`, `adaptation/` and `execution/`, while
  Opportunity capture is top-level. This is an implementation-layout mismatch; Translation Layer is
  the product umbrella regardless of folder placement.
- **D — future architecture seam:** `packages/application` and `packages/memory` remain
  documentation-first seams. Application-as-
  junction and slow learning are future architecture seams, not implemented behavior.
- **A — documentation-only mismatch, corrected:** `packages/portal` is an infrastructure placeholder. Portal interaction semantics belong to
  Execution; the adapter need not be a semantic module.

No package move, table rename or compatibility alias is performed by this ADR migration. Those
changes require a dedicated implementation plan with migration and rollback analysis.

No **C — boundary mismatch** was found in implemented mutation paths: capture and understanding use
public capabilities and write only their own table namespaces; Adaptation writes only Adaptation
state; Execution has no implemented state. The conceptual Opportunity partitions remain narrower
than their shared semantic authority, not wider.

## Superseded decisions

- **ADR 0023:** superseded as the governing semantic topology. Its modular-core, ownership,
  one-database and delayed-distribution rules remain technical defaults carried here.
- **ADR 0024:** superseded. Translation Layer now contains Opportunity, Adaptation and Execution
  semantically; Intelligence is not a fourth semantic module.
- **ADR 0025:** superseded. Its local-write-authority rule remains; its Intelligence/Opportunity
  ownership split does not.
- **ADR 0026:** superseded as a complete loop description. Its type-only contracts remain compatible
  implementation seams, but Opportunity owns Opportunity Intelligence and Application is the live
  junction through which fast-loop activity becomes history.
- **ADR 0027:** superseded as the authoritative high-level diagram and incorporated here. Its
  resolved-history, mechanical-noise and no-upstream-rewrite constraints remain unchanged.
- **ADR 0007:** trajectory-evaluation doctrine remains; ownership moves from Intelligence to
  Opportunity.
- **ADR 0008:** Baseline Identity State and Workspace-as-view invariants remain. Career Workspace is
  now the umbrella over Durable Identity and Identity Representation; Application/Interview task
  state is not a Career Workspace submodule.
- **ADR 0028:** its polling and person-event decisions remain. References to Opportunity and
  Intelligence as separate semantic modules are superseded; they describe current implementation
  partitions of Opportunity.

Historical ADR text remains unchanged except for status notices so the evolution is inspectable.

## Unresolved implementation work

- Choose whether and how to converge the top-level Opportunity package with
  `translation/intelligence`, including table and public-import compatibility.
- Define Application's live coordination boundary and resolved-history shape from the first concrete
  lifecycle slice.
- Define the governed Memory → held-PCI proposal capability when slow learning is implemented.
- Decide when a mechanical Execution fact becomes meaningful Application history from a real portal
  use case; exclusion remains the default.
