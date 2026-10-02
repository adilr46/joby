# ADR 0030 — Dual-Stream Translation and Independent Relational PCI

- **Status:** Topology superseded by [ADR 0031](0031-identity-router-translation-application-pci.md)
  (2026-09-03), which moves Opportunity upstream of Translation and gives the selection half of
  convergence to Router. **Retained in full:** PCI as an independent authority, the person-side /
  world-side signal split, and demand-driven retrieval.
- **Date:** 2026-09-02
- **Scope:** Semantic information flow, retrieval semantics, Translation Layer composition, and
  Memory / PCI ownership
- **Supersedes:** The PCI-ownership and fast-loop information-flow portions of ADR 0029. All other
  ADR 0029 ownership, modularity, Application-history and evidence-before-distribution rules remain
  valid.

## Context

ADR 0029 established the product topology (Career Workspace → Translation Layer → Application →
Career Memory) and the semantic authorities beneath it. Two properties were not represented strongly
enough.

**First, current application reasoning is not one linear flow** from Career Workspace through
Opportunity into Adaptation. Joby reasons from two independent current-state streams — a **Person
World** and an **External World** — that converge only when contextual reasoning requires them.

**Second, PCI is not learned person-state held by Durable Identity.** It is an independent learned
model of recurring relationships between a person and the professional world. The architecture must
distinguish *truth about the person* from *learned beliefs about person × professional-world
interaction*.

## Decision

### Canonical semantic information flow

```text
PERSON WORLD                         EXTERNAL WORLD

Durable Identity                     Opportunity
      │                                   │
      ▼                                   │
Representation                            │
      │                                   │
      └────────────┐        ┌─────────────┘
                   ▼        ▼
                    Adaptation
                        │
                        ▼
                    Execution
                        │
                        ▼
                   Application
                        │
                 resolved evidence
                        ▼
                 MEMORY / PCI
                 learned model of
                PERSON × WORLD
                  ↙          ↘
         person-side      context-side
           priors            priors
```

The two upper streams are independent. The lower loop converts contextual reasoning into action,
action into resolved evidence, and accumulated resolved evidence into future relational priors.

### Retrieval semantics

Runtime retrieval is distinct from semantic ownership.

```text
Opportunity      = always instantiated, retrieved or resolved for the current opportunity.
Representation   = the normal person-side prior for contextual reasoning.
PCI              = relevant learned relational prior; not canonical person truth.
Durable Identity = authoritative evidence reservoir, queried selectively when required.
```

**Representation-first.** Where a suitable persistent Representation exists, Adaptation begins from
it: it expresses the person's established positioning and is a higher-signal starting point than
indiscriminately loading the whole Durable Identity.

**Durable Identity on demand.** Where contextual reasoning identifies missing, hidden, contradictory
or insufficient professional evidence, it queries the canonical reservoir. Therefore:

```text
HiddenInRepresentation    ≠ UnavailableToAdaptation
Durable Identity authority ≠ mandatory full retrieval
```

The system retrieves canonical person evidence according to **information demand**, rather than
hydrating the complete person model by default.

### Memory / PCI as one independent authority

```text
Memory = the evidence-maintenance and learning process.
PCI    = the current learned model produced and maintained by that process.

PCIₜ₊₁ = Update(PCIₜ, ResolvedEvidenceₜ)
```

Durable Identity does **not** own, hold, canonicalize or mutate PCI. The boundary is:

```text
Durable Identity = truth about PERSON.
Opportunity      = current model of EXTERNAL WORLD.
Memory / PCI     = learned model of PERSON × WORLD.
```

PCI learns from two signal families that remain **semantically distinct even though one authority
interprets both**:

- **User-response signals** — accepted or rejected framing, user edits, evidence inclusion and
  removal, recurring representation preferences.
- **World-response signals** — recruiter response, screening and interview progression, rejection,
  offer, meaningful external feedback.

```text
User preference ≠ external effectiveness
```

PCI returns **person-side** and **context-side** priors to future Opportunity and Adaptation
reasoning. It outputs priors, not truth, and cannot automatically mutate Durable Identity, Identity
Representation, Opportunity or historical Applications.

PCI is explicitly designed to permit a tuneable, trainable implementation. The semantic invariant is
the trainable boundary itself: **PCI learns recurring relational patterns from resolved evidence
without converting learned predictions into canonical identity truth.** Model family, features,
targets and optimisation remain implementation decisions.

### Execution and Application

```text
Execution   = what Joby attempts.
Application = what is actually happening and what actually happened.
```

Translation may create, prepare, execute against and update an Application through public
capabilities without acquiring ownership of its lifecycle state or historical truth. Application is
the evidence boundary between current action and long-term learning. Mechanical execution noise stays
inside Execution and is not learning input by default — logging is not meaning.

## Implementation alignment

Corrected in the same pass as this ADR:

- **Adaptation retrieved the whole person on every path.** `composeAdaptedState` loaded a full
  `PermanentIdentityView` before it knew whether the Representation was silent about anything, and
  two further paths loaded it to read a revision number. Retrieval is now demand-driven: the
  Representation is loaded first, `requiresCanonicalEvidence` decides whether the reservoir is needed,
  and `readIdentityRevision` serves the paths that only ever wanted a revision. Pinned by tests that
  count reservoir reads — 0 when the lens covers the posting, >0 the moment it does not.
- **Durable Identity's public type carried `learned: null`**, teaching that PCI is a Durable Identity
  component awaiting implementation. Removed: asking Durable Identity for learned state is asking the
  wrong authority.

Not corrected, because they are not yet implemented: Application lifecycle and resolved-history
shape, Execution behaviour, and Memory / PCI itself. Their documentation now states the binding
constraints so the first implementing slice does not have to rediscover them.

## Consequences

- Joby has two independent current-state streams rather than one linear pipeline.
- Representation is the normal person-side starting point; Durable Identity is a selectively queried
  reservoir.
- Learned person–world relationships cannot contaminate canonical professional truth.
- Historical Application evidence survives PCI replacement and retraining.
- The modular-core, public-capability, one-database and evidence-before-distribution rules are
  unchanged.

## Unresolved implementation work

- The minimal initial PCI feature representation, target signals, loss function and update mechanism.
- The minimum resolved Application evidence required for training, and how model parameters, training
  evidence references and model versions are persisted.
- How PCI predictions expose confidence or support.
- Retraining and model-version replacement semantics.
- The exact public capabilities through which Opportunity and Adaptation consume PCI priors.
