# ADR 0031 — Identity, Router, Translation, Application and PCI

- **Status:** Accepted — authoritative topology
- **Date:** 2026-09-03
- **Supersedes:** the topology and ownership placement of ADRs 0029 and 0030; the top-level framing
  of ADR 0009. Their retained rules are listed below.

## Context

The model has moved in three ways that the recorded topology no longer expresses.

**Opportunity is upstream of Translation, not inside it.** ADR 0029 placed Opportunity in the
Translation Layer. It is the external situation Joby reasons *about*, not part of the contextual
action taken in response.

**Selecting which Representation to start from is its own responsibility.** ADR 0030 made
Representation the normal person-side prior but left the choice of *which* one to the caller. That
choice is a person × world judgement, and it is where learned priors first become useful.

**Interview work belongs beside adaptation and execution.** Understand → Prepare → Rehearse is
immediate contextual action on a live application, not a separate lifecycle.

## Decision

```text
IDENTITY SERVICE
├── Canonical Profile Units
├── Persistent Representations
└── Stated Context

OPPORTUNITY
    ↓
ROUTER
    ↓
TRANSLATION SERVICE
├── Adaptation
├── Execution
└── Interview Intelligence
    ↓
APPLICATION
    ↓
resolved evidence
    ↓
PCI
```

### Semantic authorities

| Authority | Owns |
|---|---|
| **Identity** | Persistent person-side state: Canonical Profile Units, Persistent Representations, Stated Context |
| **Opportunity** | The current external professional situation: evidence, records, understanding |
| **Router** | Selecting the best existing Representation as the starting prior for an Opportunity |
| **Adaptation** | The opportunity-specific delta from the selected Representation |
| **Execution** | Realizing that delta externally: submission, portal interaction, mechanical feedback |
| **Interview Intelligence** | Understand → Prepare → Rehearse for interview stages |
| **Application** | The live lifecycle and durable record of what actually happened |
| **PCI** | The learned person × world model, and the priors it returns |

### Identity

A **Profile Unit** is one coherent professional unit composed of **Context, Contribution,
Capabilities and Consequence**. It is canonical truth.

A **Representation** is persistent positioning over that truth. It may include, prioritize,
emphasize, order and frame units *or their pieces* — and changes no canonical truth by doing so.
**Stated Context** is current user-authored preferences, constraints and intentions.

### Router

Router is deliberately small: given an Opportunity, choose the Representation that should serve as
the starting prior. It selects; it does not adapt, and it writes neither Identity nor Opportunity
state. It is the first consumer of PCI priors, and the natural home for "which lens has worked for
work like this".

### Translation

Translation owns **immediate contextual action**. Adaptation computes the delta from the selected
Representation rather than re-deriving the person per opportunity. Execution realizes it and may
repair and retry. Interview Intelligence handles interview stages.

```text
Execution   = what Joby attempts.
Application = what is actually happening and what actually happened.
```

Translation may create, prepare, execute against and update an Application through public
capabilities without owning its lifecycle or history.

### Application and PCI

Application is independent and owns submission, communications, interviews, progression and
outcomes — the evidence boundary between current action and long-term learning.

PCI is an independent learned person × world authority. It learns **only from meaningful resolved
Application evidence**, and supplies learned priors to **Router, Opportunity reasoning and
Adaptation**. Its implementation may evolve from simple priors through population and clustering
models to a dedicated ML model without changing this contract.

**Information may flow recursively; semantic ownership must not silently flow backwards.** PCI
returns priors, never truth, and cannot automatically rewrite Identity, Opportunity, Adaptation or
historical Applications.

## Implementation alignment

Recorded so the diagram is not mistaken for the codebase.

| Element | State |
|---|---|
| Identity — Representations, Stated Context | Implemented |
| Canonical Profile Units | **Framing only.** Implemented as ADR 0009's `E = (Structure, Activity, Relations)`, where an activity is (contribution, capability, consequence). The components are unchanged; the Profile Unit names the coherent unit they compose into |
| Opportunity | Implemented — capture and understanding |
| **Router** | **Not implemented.** `createContext` takes a caller-supplied `representationId`; that caller currently performs the selection |
| Adaptation | Implemented |
| Execution | Type-only seams, no behavior |
| **Interview Intelligence** | **Not implemented.** No interview behavior exists; `InterviewRecorded` exists in the event vocabulary only |
| Application, PCI | Documentation seams |

No package move, table rename, event change or public contract change is made by this ADR. Naming
mismatches — `packages/translation/src/intelligence`, `intelligence_*` tables — remain conceptual,
not licence for cross-writes, and are not a reason for migration.

**Service** still means an independently distributed runtime. "Identity Service" and "Translation
Service" are semantic groupings; neither is a deployment claim.

## Superseded and retained

- **ADR 0029** — superseded as topology: Career Workspace becomes Identity, Opportunity leaves
  Translation, Router and Interview Intelligence are added. Retained: umbrellas own no state, each
  owner mutates only its own state, Application as the live-and-historical junction, collaboration
  through public capabilities.
- **ADR 0030** — superseded where it placed Opportunity inside Translation and made Adaptation the
  sole convergence point; Router now holds the selection half of that convergence. **Retained in
  full:** PCI as an independent authority and not a component of Identity; person-side and
  world-side signals remaining distinct; demand-driven retrieval — `Identity authority ≠ mandatory
  full-state retrieval`, and `HiddenInRepresentation ≠ UnavailableToAdaptation`.
- **ADR 0009** — its top-level framing is superseded by the Profile Unit. Its component ontology,
  the rule that any subset of an activity is valid, and its projection rules remain in force.
- **ADR 0028** — its polling and person-event decisions remain unchanged.
- ADRs 0005–0008, 0010–0022 remain accepted; where they name Career Workspace or place Opportunity
  inside Translation, this ADR governs.

## Unresolved

- Router's selection rule, and what it does when no Representation fits.
- Whether Profile Units become an implementation change to `E` or remain a framing over it.
- Interview Intelligence's boundary with Application's interview record.
- The public capabilities through which Router, Opportunity and Adaptation consume PCI priors.
