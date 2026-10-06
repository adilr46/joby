# ADR 0041 — PCI LayeredPci: Beta-Bernoulli Shared and Personal Layers

- **Status:** Accepted
- **Date:** 2026-10-03
- **Scope:** Resolves the open questions in ADR 0040 — blend formula, feature extraction, database
  schema, and minimum corpus — and specifies the `LayeredPci` implementation.

## Context

ADR 0040 decided that PCI has two layers (shared population + personal adjustment) and that the
blend is Bayesian. It left four things unresolved:

1. **Exact feature extraction** — the function that maps `ResolvedApplicationEvidence` → structural
   features for the shared layer, deterministic and identity-free.
2. **Blend formula** — exactly how shared and personal weights combine.
3. **How `basis` is determined** when both layers contribute.
4. **Database schema** — separate tables or a sentinel column.

This ADR resolves all four, and specifies the `LayeredPci` class that implements them.

## Decision

### The model: one Beta per signal, two layers deep

A Beta-Bernoulli model answers one question: *what is the probability the next trial succeeds,
given what I have seen?*

```
Prior:       θ ~ Beta(α, β)
Likelihood:  x | θ ~ Bernoulli(θ)
Posterior:   θ | x ~ Beta(α + successes, β + failures)
E[θ]         = α / (α + β)                 ← the prior we return
Var[θ]       = αβ / ((α+β)²(α+β+1))       ← uncertainty, honest and automatic
```

Every time a resolved application arrives, we increment either α or β in the relevant cells.
Because Beta is the conjugate prior of the Bernoulli likelihood, the posterior is another Beta —
no retraining, no gradient, no model versioning: two integer increments per cell per observation.

**Two signal families, two separate Beta models, staged layering.** This is the ADR 0030
invariant expressed as separate update paths — and a refinement, made after the first
implementation pass, on *which layers* each family writes to *right now*:

| Signal family | What the Bernoulli trial is | Writes to today | Writes to eventually |
|---|---|---|---|
| `world_response` | Did this application reach an interview? | shared cell **and** this person's own personal cell | same — no change planned |
| `user_response` | Did the person accept Joby's framing without editing? | shared cell **only** | shared cell **and** a personal cell |

`user preference ≠ external effectiveness`. They share the same mathematical structure; they must
never share the same Beta parameters.

**Why `user_response` is shared-only for now — and why that is staged, not a reinterpretation of
the signal.** The type's own contract (`ResolvedEvidenceSignal` in `model.ts`) documents
`user_response` as evidencing "how this person prefers to operate and be represented" — an
explicitly *personal* signal, the same status `world_response` has. An earlier draft of this ADR
justified shared-only on the grounds that "one person's sample is too small to be meaningful" —
that argument does not hold up: the same small-sample condition applies to `world_response`,
which keeps a personal term anyway and relies on the Beta's own `confidence()` (derived from
variance) to express low trust honestly rather than denying the signal a personal term outright.
Applying that argument to one family and not the other was inconsistent, not principled, and it
is retracted here.

The real reason to stay shared-only for now is sequencing, not validity: establishing the
population pattern ("which framing styles tend to land") first, before adding the personal term,
keeps the first implementation slice smaller. **Deferred, not excluded.** Turning the personal
term on later needs no schema change: `#increment` already accepts an optional `personal`
parameter; `observe` only needs to pass `{ personId: evidence.personId }` for the `user` trial,
exactly as it already does for the `world` trial.

One consequence of staying shared-only for now: it also avoids the self-inclusion double-count a
personal term would create (this person's own trial already lands in the shared pool; adding a
personal term on top counts it twice — see the Known Limitation section below, which
`world_response` already lives with). This is a side effect of the staging, not a reason for it
— once `user_response` gets its personal term, it inherits the same already-accepted trade-off,
not a new problem.

**Presence, not permission.** Whether a `user_response` trial happens is determined by whether
the evidence inherently carries `user_response` signals — not by a separate "should this data be
used" decision. An application with none simply has no trial to record; this is a direct
consequence of what's in the evidence, not a branch an implementer chose to gate.

**One Beta per (signal_family, cell_key).** A cell key is the string representation of the
structural features that identify a population pattern — see feature extraction below. Each cell
is fully independent.

### The blend formula (resolves ADR 0040 open item 2)

The personal layer is a Bayesian update *from* the shared posterior:

```
α_personal = α_shared + person_successes
β_personal = β_shared + person_failures

E[θ_personal] = α_personal / (α_personal + β_personal)
```

This is not a weighted average. It is exact Bayesian composition: the shared population counts
become the prior, and the person's own counts are the observations that update it. With zero
personal applications, `E[θ_personal] = E[θ_shared]`. With many personal applications,
`α_personal + β_personal >> α_shared + β_shared`, so the personal evidence dominates.

No tuning parameter, no blend weight to choose. The relative sizes of the counts determine the
blend automatically and correctly.

### Feature extraction (resolves ADR 0040 open item 1)

The function that maps `ResolvedApplicationEvidence` → a `SharedCellKey` for the shared layer.

A `SharedCellKey` is a deterministic string derived from structural features only. No `personId`,
no application content, no free-text signals:

```
SharedCellKey = "{signal_family}:{representation_track}:{role_domain}"
```

**Three components:**

| Component | Source | Notes |
|---|---|---|
| `signal_family` | literal `'world'` or `'user'` | keeps the two families in separate cells |
| `representation_track` | `evidence.representationId ?? 'untracked'` | the track whose population pattern we are learning |
| `role_domain` | `evidence.opportunityId` prefix convention, or `'unknown'` | identity-free; derived from the opportunity structure, not the person |

`role_domain` is deliberately coarse at this stage — `'unknown'` is a valid value and means the
shared cell is keyed only on the representation track. Enriching this with real Opportunity data
is future work; it does not block the first implementation.

**Privacy invariant:** the shared layer stores only the cell key and two integers (α, β). No
`personId` is stored against a shared row. No query against the shared layer can reconstruct
which persons contributed to a cell.

### `basis` determination (resolves ADR 0040 open item 3)

```
basis = 'shared'   if person_successes + person_failures = 0
basis = 'both'     if person_successes + person_failures > 0 AND sharedSupport > 0
basis = 'personal' if sharedSupport = 0 AND person_successes + person_failures > 0
```

`sharedSupport` is the total count in the shared cell (`α_shared + β_shared`) at the time of the
read. This is the number of cross-person observations that produced the shared prior, not the
number of people.

### Database schema (resolves ADR 0040 open item 4)

Two separate tables — not a sentinel-column pattern. A sentinel column (`person_id IS NULL`) in
one table makes it structurally possible to accidentally join shared and personal rows, and the
privacy boundary is enforced by a convention rather than by a schema.

```sql
-- Shared layer: population-level Beta parameters.
-- No person_id. Stores two integers per cell. Nothing else.
CREATE TABLE pci_shared_cell (
    cell_key         text        PRIMARY KEY,   -- "{signal_family}:{track}:{role_domain}"
    alpha            integer     NOT NULL DEFAULT 1,   -- successes + 1 (Laplace smoothing)
    beta             integer     NOT NULL DEFAULT 1,   -- failures + 1  (Laplace smoothing)
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Personal layer: per-person increments on top of the shared prior.
-- Only the person's own counts. The blend is computed at read time.
CREATE TABLE pci_personal_cell (
    person_id        text        NOT NULL,
    cell_key         text        NOT NULL,
    alpha            integer     NOT NULL DEFAULT 0,   -- person successes
    beta             integer     NOT NULL DEFAULT 0,   -- person failures
    updated_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (person_id, cell_key)
);
```

**Laplace smoothing on shared rows:** `alpha` and `beta` start at 1, not 0. This gives
`E[θ] = 0.5` for an empty cell rather than the 0/0 undefined form — a genuine uniform prior
over [0,1], not a fabricated belief. Personal rows start at 0 because they add to the shared
prior, not initialise one.

**`ON CONFLICT DO UPDATE`** is the upsert pattern for both tables — no explicit idempotency
check in application code for the shared layer. For the personal layer, the `applicationId`
deduplication guard in the class prevents double-counting before any SQL runs.

### Minimum corpus (resolves ADR 0040 open item 4)

A shared cell with `α + β = 2` (the Laplace-smoothed default, no real observations) returns
`basis: 'shared', sharedSupport: 0`. Consumers already handle `sharedSupport: 0` — it is what
`NoLearnedPci` returns today. No minimum corpus gate is needed: the `sharedSupport` count on the
returned prior is the signal consumers use to decide how much weight to place on it. Gating at
the PCI layer would hide uncertainty rather than surfacing it.

## Consequences

- `LayeredPci` implements `PciModel` and replaces `NoLearnedPci` when injected into `apps/api`.
  No consumer interface changes.
- The `SlowLearningPci` class predates this ADR and uses an exponential moving average, not
  Beta-Bernoulli. It is superseded by `LayeredPci` for the world-response path. It is retained
  in source for the test suite and the `CareerObservation` path, which is a separate concern.
- Migration `0020_pci_cells.sql` adds the two tables. It is forward-only; no rollback path.
- `LayeredPci` takes a `Queryable` — the same pool or open transaction the rest of the system
  uses. No new connection, no second database.
- The feature extraction function is pure — no I/O, no async, fully testable in isolation.
- A `LayeredPci` with no rows in either table returns exactly the same prior as `NoLearnedPci`:
  `E[θ] = 0.5`, `supportingApplications: 0`, `sharedSupport: 0`, `basis: 'shared'`. It degrades
  gracefully on an empty database.

## Known limitation: self-inclusion in the shared pool (world_response today; user_response once its personal term is added)

`observe` writes `world_response` evidence into both the shared cell and the person's own
personal cell. The blend then sums both (`α_blend = α_shared + α_personal`), so a person's own
observations are counted twice: once diluted as a 1/N contribution to the population pool, and
again at full weight as their personal term. `user_response` has no personal term yet (deferred,
see above), so this limitation does not apply to it today — but it will, symmetrically, the
moment `user_response` gets one too. That is expected and already accepted below, not a reason
to keep deferring it indefinitely.

At real population scale (a shared pool of hundreds or thousands of applications) this is
negligible — one person's handful of observations barely shifts a large pool, so the double-count
is a rounding error. **It is not negligible against a small pool** — in a new deployment, or in
tests that hand-seed a small shared cell, the same evidence pulling the estimate twice is visible.

The principled fix is leave-one-out attribution: the shared prior a person reads should exclude
their own contribution to it. That requires the shared layer to know *whose* evidence is in a
cell, which is exactly the identity-bearing information the privacy boundary in ADR 0040 excludes
it from storing. Resolving this without reintroducing person-level attribution into the shared
layer is unsolved; accepted here as a scale-dependent approximation that is correct once the
shared pool is large relative to any one person's personal evidence, and revisited only if
small-population skew is actually observed in production.

## What this ADR does not decide

- Enriching `role_domain` from Opportunity data (deferred: Opportunity understanding integration).
- Routing prior weighting strategy beyond the `E[θ]` per representation track (Router owns this).
- When to surface priors in the UI and with what language (product/frontend concern).
- The next step in the progression seam — clustering, sequence models — remains future work.
- **When to turn on the personal term for `user_response`.** The seam is built (`#increment`
  already accepts it; `observe` just needs to pass it), but the trigger — enough shared-pool
  evidence accumulated first, a fixed timeline, or simply "the next slice" — is not decided here.
