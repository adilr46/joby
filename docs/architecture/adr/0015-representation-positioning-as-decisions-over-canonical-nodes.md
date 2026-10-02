# ADR 0015 — Representation positioning as decisions over canonical nodes

- **Status:** Accepted — extended by ADR 0016
- **Date:** 2026-08-15
- **Domains affected:** Identity (Identity Representation, Adaptation seam)

> **2026-08-15 — extended by [ADR 0016](0016-representation-materialization-and-the-adaptation-prior.md).**
> The decision below is unchanged and still binding. ADR 0016 makes a positioned lens observable
> (`CvDocument → LaTeX → PDF`, nothing stored) and gives §4's prior-not-boundary invariant a concrete
> shape: `A^C = T(E_t, L_t, C, P_i)`, where `P_i` carries preferences keyed by canonical node id and
> **no professional evidence**, so it cannot stand in for Durable Identity. It also records the
> deferred `Memory → Representation` learning path.
- **Related:** ADR 0014 (Identity Representation — **extended by this ADR**), ADR 0009 (projections,
  not stores), ADR 0011 (write authority), ADR 0012 / ADR 0013 (Adaptation)

## Context

ADR 0014 established the Identity Representation as a persistent, non-canonical lens and deliberately
stopped there: it stored a name and a purpose, and every lens projected the same content. It also
named the next decision — "when persistent user *decisions* arrive, they arrive as their own rows
keyed by canonical node id" — and listed this as its Revisit When.

A lens that shows everything is not positioning. What a placement student actually needs is:

> How do I generally want my existing professional truth organized and represented in this
> professional domain?

A Markets lens leads with quantitative work and decision-making under uncertainty; a Software
Engineering lens leads with what was built. Same person, same history, different generalized
positioning — reusable across every application in that domain, and **not** tailoring for one
employer or posting, which is Adapted State (ADRs 0012, 0013).

Two failure modes are available here, and they are the reason this needs a decision rather than an
implementation.

1. **The lens becomes a copy.** Store the positioned content and the representation is a second,
   staler professional history — exactly what ADRs 0009 and 0014 exist to prevent.
2. **The lens becomes a boundary.** If hiding a fact removes it from what downstream can see, then a
   general positioning choice made months earlier silently censors the evidence available to a
   specific opportunity. A Markets lens that de-emphasises a teaching role must not make that role
   unavailable when a role genuinely values it.

## Decision

### 1. Positioning is a set of decisions about canonical nodes

```text
E_t + Decisions_i -> V_i
```

A decision row names a canonical node id and says what this lens does with it. **It carries no
professional fact** — no label, contribution, capability, consequence or date is copied out of
Explicit State. Four fields, one per use case:

| | Use case | Field | Neutral default |
|---|---|---|---|
| Select / hide | UC05 | `included` | included |
| Order / prioritize | UC06 | `priority` — lower is higher, sparse | unranked, sorts last |
| Emphasise / de-emphasise | UC07 | `emphasis` | neutral |
| Context-independent wording | UC08 | `framing` | the canonical label |

Grounding is enforced by the schema, not by care: `node_id` is a foreign key to
`identity_explicit_node`, and the service additionally refuses any node that is not **this person's**.
A representation therefore cannot hold an opinion about a fact that does not exist, and removing a
canonical fact removes the decisions about it (`ON DELETE CASCADE`) rather than leaving an opinion
that could resurrect it.

**Emphasis and priority stay separate signals.** De-emphasising something is not demoting it, and
collapsing the two would make one of them unexpressible.

### 2. Framing presents truth; it never replaces it

`canonicalTitle` travels beside `framing` on every entry in the read model. Wording may reinterpret
how existing truth is presented — "Rota scheduler" read as "constraint solving under operational
uncertainty" — and a reader can always see what Explicit State actually records underneath.

Framing is **general positioning**. Wording aimed at one employer, posting or interviewer is Adapted
State, and belongs to Adaptation for that cycle.

### 3. Lens-level positioning themes

A representation also carries an ordered list of themes it generally leads with — "quantitative
reasoning", "decision-making under uncertainty". These live in their own table, so ordering is
explicit and `identity_representation` stays a row that identifies a lens and nothing else. Its
pinned column list from ADR 0014 is unchanged, which is the cheapest available proof that the lens row
never became a profile.

**A theme is a positioning choice, never a claim.** It says what this lens foregrounds, not that the
person is good at something. Claims still come from canonical facts, with provenance.

### 4. The recursive-role invariant: a prior, not a boundary

```text
Durable Identity      canonical truth
      ↓
Identity Representation  general reusable positioning     ← a strong prior
      ↓
Adaptation            opportunity-specific optimization
```

```text
HiddenInLens   ≠ UnavailableToAdaptation
PriorityInLens ≠ CanonicalImportance
```

Three structural guarantees, not one promise:

- **Canonical state is untouched.** Hiding writes a decision row; `getExplicitState`, `getNode` and
  the Permanent Identity View do not know the lens exists.
- **The read model keeps the ungoverned projection.** `getRepresentation` returns the full canonical
  projection *and* the positioning applied over it. A lens can never become the only way to see the
  person.
- **Hidden evidence is flagged, not dropped.** It comes back marked `included: false`, sorted last.
  Rendering takes what is included; recovering what was set aside needs no special access.

Adaptation still reads the broad canonical snapshot ADR 0013 grants it. A lens tells it what the
person generally prefers; it never tells it what exists.

### 5. Concurrency uses the existing mechanism

Every positioning write supplies the lens `revision` it read, and bumps it inside the same
transaction — the same optimistic-concurrency shape confirmation uses identity-wide and correction
uses per node, and the same `ConcurrencyError` (moved to its own module so a non-canonical module can
use the mechanism without importing a canonical write surface). A whole call applies or none of it
does; a stale caller is told rather than silently applied on top.

### 6. No event

Positioning publishes nothing. `IdentityUpdated` means a confirmed change to canonical Explicit
State, and deciding how to present a fact is not a change to the fact.

### 7. Not in this slice

Skill-level positioning (skills aggregate across activities, so there is no single canonical node to
key a decision to, and a decision needs one); rendering; opportunity-specific adaptation; any
inference of positioning from history — that requires the learning system, which does not exist, and
inferring it early would manufacture a conclusion from nothing.

## Consequences

- Two lenses over one identity can express substantially different generalized positioning while
  sharing exactly one factual authority. Correcting a fact updates both, with no synchronisation.
- A decision survives a correction to the fact it is about, because it was never about the label.
- The failure mode this design cannot have: a lens showing something Explicit State does not contain.
  The positioning function is pure and takes the canonical projection as input, so it is checkable in
  unit tests without a database.
- Hiding is cheap and safe to use, which is the point — the person can position aggressively without
  quietly destroying the evidence base a future opportunity might need.
- Cost: three tables now describe one lens, and the read model returns both the canonical projection
  and the positioned view. That redundancy is deliberate; collapsing it would give up the property in
  §4.
- The Identity contract widened again, to fourteen capabilities. Both additions are argued here and
  re-pinned in the export test.

## Alternatives Considered

- **Store the positioned content.** Rejected: a second professional history, plus synchronisation and
  drift, to avoid a query that already exists.
- **Have the lens filter the projection.** Rejected — this is failure mode 2. It makes a general
  positioning choice a hard evidence boundary for every future opportunity, and the loss is invisible
  at exactly the moment it matters.
- **One combined "importance" score instead of priority and emphasis.** Rejected: they answer
  different questions, and a single number would hide which one the person actually meant.
- **Per-decision revisions.** Rejected: the person positions a lens, not a row. The lens revision is
  the unit of "what I was looking at when I decided this", and it is the existing mechanism.
- **Let a decision carry its own wording *and* its own facts for completeness.** Rejected outright:
  it is the copy, wearing an editor's clothes.
- **Infer positioning from what the person has done before.** Rejected: that is the Slower Learning
  Loop's job, it does not exist yet, and a prior inferred from one or two applications is a confident
  conclusion from nothing (ADR 0008).

## Revisit When

Skills or other aggregates need positioning of their own; positioning needs history ("what did this
lens look like in March?"); a lens needs to be shared, exported or rendered; Adaptation begins and the
lens-as-prior seam becomes real code; or a positioning decision is proposed that cannot be expressed
as a choice about a canonical node — which is the signal that something is trying to become a fact.
