# ADR 0017 — Stated Context as user-maintained operating conditions

- **Status:** Superseded by rewritten ADR 0011
- **Date:** 2026-08-15
- **Domains affected:** Identity (owner and Adaptation), Intelligence (opportunity-condition input)
- **Extends:** [ADR 0011](0011-explicit-state-as-reconstructed-state-and-stated-context.md)
- **Related:** [ADR 0012](0012-adaptation-as-an-identity-owned-fast-loop-service.md), [ADR 0013](0013-adapted-state-across-the-application-cycle.md)

> **Superseded (2026-08-16).** The rewritten [ADR 0011](0011-explicit-state-as-reconstructed-state-and-stated-context.md)
> keeps the user-authority, persistence, unknown-value and non-gating semantics, but restores
> `E = (Structure, Activity, Relations)` and deliberately does not lock this ADR's comparable
> taxonomy, persistence behavior or event semantics. The historical decision below is retained as
> context and is no longer binding.

## Context

ADR 0011 established Stated Context (`X`) as persistent, explicit and user-authored, but deliberately
left Career Direction, Preferences and Constraints opaque until a real consumer needed more. That
consumer now exists: Adaptation Module 1 must retrieve the person's current operating conditions and
compare the comparable subset with attributed opportunity conditions.

Leaving `X` wholly opaque would force one of three failures: Adaptation guesses structure from prose,
Identity pre-selects or interprets context for a role, or every comparison reports that the person
has stated nothing. All three contradict existing doctrine.

The first placement slice needs only current career direction and intent, preferences, free-form
constraints, work authorisation, sponsorship requirement/status, availability, and the ordinary
placement conditions already named by the Adaptation doctrine: location, duration, working
arrangement and start date. Fields may be absent. Silence is not permission, prohibition or a
negative answer.

## Decision

### 1. Meaning and ownership

Stated Context is:

> Persistent, explicit, user-authored professional operating context that remains valid until the
> user changes or removes it.

Identity owns its canonical state. The user is its only authoritative writer. Reconstruction,
professional sources, Adaptation, Intelligence, Memory and model output cannot write it. A material
change increments the canonical Identity revision and emits the existing `IdentityUpdated` event;
an idempotent statement changes neither.

Stated Context remains separate from Reconstructed State (`R`), Learned State / PCI (`L`), Adapted
State (`A^c`) and Opportunity Context (`C_opportunity`). Changing it triggers none of their write or
reconstruction flows.

### 2. Placement representation

`X = (CareerDirection, Preferences, Constraints)` remains the conceptual model. The implementation
holds:

- optional career-direction text;
- optional ordered preference text;
- optional free-form constraint text; and
- an optional, small set of user conditions whose kind is comparable with the same kind in an
  opportunity: `location`, `duration`, `work_arrangement`, `start_date`, `work_authorisation`,
  `sponsorship`, and `availability`.

Values remain in the person's words. One condition kind can have several acceptable values. The
typed subset does not replace free-form constraints and is not a general constraint ontology; it is
only the vocabulary the current placement comparison actually consumes.

Missing values are absent and mean **unknown / not stated**. They never default to false, true,
unrestricted, unavailable or ineligible. Removal is explicit. Omitted fields in a partial command
remain unchanged.

### 3. Mutation boundary

Identity exposes one explicit user-command capability, guarded by the Identity revision and an
identified user actor. It accepts creation, partial change and removal. Empty commands are invalid;
semantically idempotent commands succeed without creating a state transition.

Downstream consumers receive Stated Context only through Identity's public read boundary. Adaptation
uses a dedicated interface with no mutation method, repository or table access. It stores references
and revisions for its context and re-reads the current canonical value; it does not maintain a copy.

Authentication and proof that the actor controls the Person remain Account Claim concerns under ADR
0010 and are not invented in this slice.

### 4. Comparison semantics

Adaptation may compare only a condition the person stated with the corresponding attributed
opportunity condition. The output vocabulary is:

```text
Aligned | Conflict | Uncertain
```

Comparison performs conservative text normalization only. It does not infer a missing condition or
fuzzily decide that two different statements mean the same thing. Free-form constraints are shown
without machine comparison.

No current stated condition has a hard/soft level, priority, weight or strength. The comparison
produces no ranking, eligibility verdict or automatic gate:

```text
ConstraintConflict != ApplicationBlock
Pursue(Opportunity) = UserDecision
```

### 5. Events

No new event contract is introduced. A material user change records `IdentityUpdated` in the same
transaction as canonical state with `changedFields: ['stated']` and a user actor. Reading,
comparison, context creation and idempotent commands emit nothing.

## Consequences

- Baseline Identity can now contain explicit current direction instead of permanently empty `X`.
- Adaptation can make placement conditions legible without inference, a second person store or a
  cross-domain write.
- Unknown remains visible throughout persistence, retrieval and comparison.
- The closed vocabulary is intentionally small and must grow only when a real same-kind comparison
  requires it. Adding weights or gating would be a new product decision, not a field addition.
- User statements can become stale in human terms. Persistence means the system keeps the last
  maintained statement; it does not grant permission to guess that the person's life changed.

## Alternatives Considered

- **Keep all constraints opaque.** Rejected: the real Adaptation consumer would have to parse user
  prose opportunistically or be unable to compare anything.
- **Infer conditions from CVs, location history or application behaviour.** Rejected: reconstructed
  history and observed behaviour do not author current intent or ability.
- **Put Stated Context in Adaptation.** Rejected: it persists across opportunities and is canonical
  person-state, while Adaptation is temporary and read-only with respect to Durable Identity.
- **Add hard/soft constraints, priorities or weights.** Rejected: the placement slice needs a
  legible comparison, not a ranking model, and none of those semantics has a current consumer.
- **Block conflicting opportunities automatically.** Rejected: a conflict is information for the
  person, not authority for Joby to hide or disable an option.

## Revisit When

A real consumer needs a new same-kind comparison, values require a governed normalization scheme,
Account Claim is implemented and can replace the provisional actor identifier, or users need a
history/audit view of prior stated conditions. None permits inference, weighting or gating by
default.
