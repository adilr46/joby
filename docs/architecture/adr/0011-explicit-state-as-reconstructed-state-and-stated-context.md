# ADR 0011 — Stated Context as Identity-owned user-stated operating context

- **Status:** Accepted — rewritten 2026-08-16; supersedes ADR 0017
- **Original date:** 2026-08-14
- **Rewritten:** 2026-08-16
- **Domains affected:** Identity (owner), Adaptation and other downstream readers
- **Related:** [ADR 0009](0009-explicit-state-as-structure-activity-relations.md), [ADR 0010](0010-person-creation-at-first-capture-and-the-account-claim.md), [ADR 0012](0012-adaptation-as-an-identity-owned-fast-loop-service.md), [ADR 0013](0013-adapted-state-across-the-application-cycle.md)

> **Rewrite note.** The original decision correctly separated current user statements from
> reconstructed professional sources and made the user authoritative, but represented Explicit
> State as `E = (R, X)` and deferred the usable scope of `X`. ADR 0017 later resolved that gap by
> locking a comparable condition vocabulary and implementation behavior. The product decision is
> now narrower and final: Explicit State remains the Structure / Activity / Relations model of ADR
> 0009; Stated Context is a distinct Identity-owned context with only the minimal placement semantics
> below. This document preserves the original problem and rationale while replacing those two
> superseded conclusions.

## Context

ADR 0009 established Explicit State as reconstructed professional reality:

```text
E = (Structure, Activity, Relations)
```

It deliberately left current career direction, preferences and constraints unresolved. They are
not Structure, Activity or Relations, and they cannot safely be reconstructed from professional
sources. A CV may contain a personal statement or old ambition, but that is evidence of what the
person wrote for a past audience—not authority about how they currently intend or are able to
operate.

That unresolved context becomes load-bearing in Adaptation UC03. Adaptation needs current user
conditions without reconstructing them from a CV, inferring them from observed behavior, or keeping
an opportunity-specific copy as though it were canonical.

The original ADR correctly identified the separate write authority but placed Stated Context inside
Explicit State as `E = (R, X)`. That composition obscures the established meaning of `E` as
reconstructed professional reality. The follow-on ADR 0017 then fixed a closed comparable taxonomy
and several persistence-level behaviors. Those are broader decisions than UC03 requires.

## Decision

### 1. Meaning

**Stated Context** is:

> Persistent, explicit, user-authored professional operating context that remains valid until the
> user changes it.

Conceptually:

```text
X_t = current user-stated operating conditions
```

The initial placement scope includes:

- career direction / current professional intent;
- preferences;
- constraints;
- work authorisation;
- user-stated sponsorship requirement or status; and
- availability.

Fields may be absent. Absence means **unknown / not stated**, never false, unrestricted, available,
ineligible or any other default.

This list defines the minimum product meaning the placement slice must be capable of carrying. It is
not a complete preference or constraint taxonomy and does not prescribe how any field is represented.

### 2. Separation from other state

Stated Context is distinct from:

- **Explicit State `E = (Structure, Activity, Relations)`**—reconstructed professional reality;
- **Learned State / PCI `L`**—slowly accumulated, evidence-governed personal career intelligence;
- **Adapted State `A^c`**—temporary opportunity- or task-specific interpretation and
  representation; and
- **Opportunity Context**—external information about the current opportunity.

Stated Context is not reconstructed from CVs or other professional sources. A source may contain a
historical statement of intent or constraint, but it cannot become current Stated Context without an
explicit user act.

This decision does **not** redefine Durable Identity mathematically as `D = (E, L, X)`. Existing
Durable Identity decisions remain coherent without choosing a new top-level equation: Identity owns
canonical Stated Context and may return it alongside the professional-state inputs a consumer needs.

### 3. Ownership and authority

Identity owns canonical Stated Context. The user is authoritative over it.

Other domains may read Stated Context through Identity's public boundary, but may not silently
mutate it. In particular:

```text
Adaptation -> Read(X_t)
Adaptation -X-> Write(X_t)
```

The same restriction applies to Intelligence, Execution, Development, Memory and Discovery. A
downstream workflow may present an explicit user command to Identity; it does not thereby gain
canonical write authority of its own.

### 4. Update semantics

Stated Context changes only through explicit user creation, change or removal. The latest
user-maintained value is operative until the user changes it again.

Changing Stated Context must not automatically:

- mutate Structure, Activity or Relations;
- trigger professional-source ingestion or reconstruction;
- update Learned State / PCI; or
- create or regenerate Adapted State.

These are separate operations with separate owners and governance. A user may later perform one of
them deliberately, but no implication is built into a Stated Context change.

### 5. Adaptation UC03

For Adaptation:

```text
C_user = RetrieveRelevant(X_t)
```

Identity supplies the current canonical Stated Context through its public read boundary. Adaptation
selects what is relevant to the current opportunity or task and writes nothing back to `X_t`.

`RetrieveRelevant` does not author, infer or repair missing user conditions. It preserves unknowns
and keeps opportunity-specific interpretation in temporary Adaptation state.

### 6. Constraint semantics and agency

For the current placement slice, constraints are simply user-stated conditions that may later be
compared with Opportunity Context.

This decision introduces no:

- hard/soft constraint classes;
- strength, priority or weighting;
- inferred constraints;
- ranking; or
- application gating.

A later comparison may surface `Aligned`, `Conflict` or `Uncertain`, but the agency invariant is:

```text
ConstraintConflict != ApplicationBlock
```

No current stated condition may autonomously prevent the person from pursuing an opportunity.

### 7. Deliberately unresolved

This decision does not lock:

- database schema or persistence representation;
- DTOs, command/query method signatures or endpoints;
- a complete preference or constraint taxonomy;
- history, audit or versioning behavior;
- opportunity-specific overrides;
- learning from Stated Context changes;
- UI structure; or
- an event contract for Stated Context changes.

Those remain deferred or implementation discretion until a concrete slice needs them. An
implementation must preserve the semantics above without treating its chosen representation as a
new product ontology.

## Consequences

- `E = (Structure, Activity, Relations)` keeps one stable meaning: reconstructed professional
  reality with source provenance and user confirmation.
- Stated Context has one canonical owner and one authoritative author without becoming a
  professional-source reconstruction output.
- Adaptation UC03 has a safe dependency: retrieve relevant current user conditions from Identity,
  read-only.
- Unknown remains a first-class result. A sparse `X_t` is valid and must not be filled by defaults
  or inference.
- A Stated Context edit is intentionally isolated from professional truth, learning and temporary
  adaptation workflows.
- The placement slice can start small without prematurely designing a universal constraint system.

## Alternatives Considered

- **Fold Stated Context into Explicit State as `E = (R, X)`.** Rejected by this rewrite. The write
  authorities differ, but more importantly `E` already has a stable meaning under ADR 0009:
  reconstructed Structure, Activity and Relations. Separate ownership inside Identity preserves
  that meaning without losing governance.
- **Redefine Durable Identity now as `D = (E, L, X)`.** Not required. It expands the mathematical
  decision surface without helping UC03, so this ADR leaves the top-level equation unchanged.
- **Let Adaptation own or maintain Stated Context.** Rejected. `X_t` persists across opportunities;
  Adaptation is temporary and opportunity-specific.
- **Infer current intent or constraints from CVs, location history or application behavior.**
  Rejected. Those inputs do not author the person's current operating conditions.
- **Define a complete typed taxonomy now.** Rejected. The initial scope says what must be
  representable, not every form it can take; premature structure would constrain user expression.
- **Add hard/soft levels, weights or automatic gates.** Rejected. They are unnecessary for retrieval
  and would turn user context into an autonomous pursuit decision.

## Revisit When

A concrete consumer cannot retrieve or compare a required placement condition without a new product
meaning; users need governed history rather than only the current operative value; opportunity-
specific overrides need a defined relationship to canonical `X_t`; or accumulated Stated Context
changes are proposed as learning signals. Each is a separate decision and none is implied here.
