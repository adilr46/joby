# PCI

**Status: `LayeredPci` implements real Beta-Bernoulli learning (ADRs 0040, 0041); nothing calls
`observe` yet.** The independent learned PERSON × WORLD authority (ADR 0031).

```text
resolved Application evidence  ->  PCI  ->  person-side / context-side / routing priors
```

## Owns

The learned relational model, and the process that maintains it.

**PCI is not part of Identity.** Identity owns what is professionally *true* about the person; PCI
owns what Joby has come to *believe* about how this person and the professional world interact.

```text
Identity    = truth about PERSON.
Opportunity = current model of EXTERNAL WORLD.
PCI         = learned model of PERSON × WORLD.
```

## Two signal families, kept apart

| Family | Examples | What it evidences |
|---|---|---|
| **User response** | accepted or rejected framing, edits, evidence included or removed, recurring preferences | How this person prefers to operate and be represented |
| **World response** | recruiter response, screening and interview progression, rejection, offer, feedback | How the world appears to respond to them under a given representation |

```text
user preference ≠ external effectiveness
```

Someone liking a framing is not evidence it works; a rejection is not evidence they were wrong to
want it. They are separately typed rather than one union with a `kind`, because a shared shape
invites code that handles "a signal" generically — which is how "you liked this" and "this worked"
become one undifferentiated belief.

## Three prior paths out

Person-side, context-side, and routing weights for Router. All are **priors, not truth**.

## The progression seam

```text
simple / database-backed priors
  -> statistical learning
  -> population and clustering priors
  -> increasingly individual models
  -> a dedicated ML model or service
```

Every stage sits behind `PciModel`. A consumer asks for priors and never learns which stage
answered, so the progression is an implementation choice rather than an architectural event.

## Two layers: shared and personal (ADR 0040)

PCI learns at two depths, both behind the same `PciModel` interface:

```text
SHARED LAYER    population patterns, no personId, keyed on (signal family, track, role domain)
PERSONAL LAYER  this person's own counts, blended with the shared layer at read time
```

A new user gets the shared layer's population prior as a real starting point, honestly labelled
`basis: 'shared'`. An experienced user's own evidence increasingly dominates as it accumulates.
Neither layer is presented as more than it is — every prior carries `sharedSupport` and `basis` so
a consumer can never present population patterns as personal insight.

## The model: Beta-Bernoulli (ADR 0041)

`LayeredPci` is the first real learner. Each signal family is one Bernoulli trial per resolved
application — `world_response` asks "did this reach an interview?", `user_response` asks "did the
person accept the framing unedited?" — and each trial updates a Beta distribution:

```text
Prior:       θ ~ Beta(α, β)
Posterior:   θ | x ~ Beta(α + successes, β + failures)
E[θ]         = α / (α + β)              ← the prior returned
```

**The two families currently write to different layers — staged, not permanent.**
`world_response` updates both the shared cell and this person's own personal cell — how the
market responds to *this* person is worth tracking individually. `user_response` updates the
**shared cell only, for now** — deferred, not excluded. The type's own contract documents
`user_response` as evidencing "how this person prefers to operate and be represented", an
explicitly *personal* signal, the same status `world_response` has; starting shared-only is a
sequencing choice (establish the population pattern first), not a verdict that this signal is
less personal. The seam to add a personal term later needs no schema change — `observe` just
needs to pass `{ personId }` for the `user` trial the same way it already does for `world`.

Presence, not permission: whether a `user_response` trial runs at all is just whether the
evidence carries those signals, never a separate "should we use this" decision.

Where a personal cell exists, it is the shared posterior updated with this person's own counts —
exact Bayesian composition, not a tuned blend weight:

```text
α_blend = α_shared + α_personal
β_blend = β_shared + β_personal
```

With zero personal evidence, the blended estimate equals the shared prior. With many personal
applications, `α_personal + β_personal` dominates the sum and personal evidence wins — automatically,
without a tuning parameter to choose. Conjugacy means every update is two integer increments: no
retraining, no gradient, no model versioning.

One consequence worth naming: `personSidePrior` (built from `user_response` cells) always comes
back `basis: 'shared'` **today** — there is no personal term yet for it to blend. That changes the
moment `user_response` gets its personal term; it is not how `personSidePrior` is meant to stay.

Feature extraction (`extractSharedFeatures`) is pure and identity-free — it reads only
`representationId` and a (currently coarse) role domain, never `personId` or signal free text.
The shared table (`pci_shared_cell`) has no `person_id` column at all, so the privacy boundary is
enforced by the schema, not by convention.

## Why `NoLearnedPci` still exists

`NoLearnedPci` remains the right choice wherever no database is available, or as the pre-migration
default. It returns empty priors with **zero support**, which is still the honest answer when
there is nothing to learn from — and `LayeredPci` against an empty database returns exactly the
same numbers, through real SQL instead of a hardcoded zero.

## Hard boundaries

- Learns **only** from resolved Application evidence. Not live drafts, not Adaptation state, not
  execution telemetry. Mechanical noise is excluded by default: logging is not meaning.
- Cannot write Identity, Opportunity, Adaptation or a historical Application. No interface here
  points at them, and a test pins the surface.
- Idempotent on `applicationId`: an application resolved once must not count twice, or redelivery
  would manufacture confidence.
