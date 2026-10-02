# ADR 0016 — Representation materialization and the Adaptation prior

- **Status:** Accepted
- **Date:** 2026-08-15
- **Domains affected:** Identity (Identity Representation, Adaptation seam), Memory (future seam)
- **Related:** ADR 0014 / ADR 0015 (Identity Representation — **extends both**), ADR 0009
  (projections, not stores), ADR 0006 (two timescales), ADR 0012 / ADR 0013 (Adaptation),
  ADR 0010 (the Account Claim is not identity)

## Context

After ADRs 0014 and 0015 a lens is persistent, non-canonical, and can position canonical evidence.
Two things are still missing before Identity Representation is usable for the placement wedge, and
one thing needs preserving before Adaptation starts.

1. **Nobody can look at a lens.** It is reachable only as JSON. A placement student's actual artifact
   is a CV, and a *general* Markets CV they can send to many Markets employers is the thing the lens
   exists to make cheap.
2. **Adaptation has no defined way to consume a lens.** ADR 0013 grants it a broad canonical
   snapshot; ADRs 0014–0015 say a lens is "a prior, not a boundary". Nothing says what it actually
   receives, and the natural sloppy implementation — hand Adaptation the lens's positioned output and
   let it work from that — collapses the hierarchy into `A^C = T(V_i, C)` and quietly makes a
   months-old general preference the limit of what any opportunity can use.
3. **The feedback direction needs fixing before it exists.** Application outcomes should eventually
   improve how someone generally positions themselves. If that path is left undefined, the obvious
   shortcut is for an opportunity-specific Adaptation to write back into the lens — which is the fast
   loop concluding, the exact failure ADR 0006 exists to prevent.

## Decision

### 1. UC09 — one bounded rendering path

```text
Identity Representation -> CvDocument -> LaTeX -> PDF
```

- **`CvDocument` is the schema.** One canonical structure for a rendered representation, derived at
  request time from the positioned projection. LaTeX is a *renderer downstream of it*, never the
  domain model and never a source of truth. A second output format later must not need a second idea
  of what a CV is.
- **One server-controlled template, and no user-authored LaTeX, ever.** Every value is escaped
  through a single-pass table before it reaches the output, and the compiler runs with shell escape
  disabled. LaTeX is a programming language; an unescaped backslash in someone's job title is
  arbitrary code on Joby's machine. Two independent barriers, because one of them is a regular
  expression.
- **Nothing is stored.** No document table, no PDF bytes, no artifact rows. A render is derived from
  current Explicit State plus the lens, so a correction reaches the next CV with nothing to
  invalidate — and Joby never holds a stale parallel copy of someone's history in a binary.
- **Compilation sits behind a port.** The toolchain is external and usually absent; a missing one is
  reported (`503`) rather than degrading silently, and the document and `.tex` remain available.
- **The header is caller-supplied presentation input.** Joby holds no name, email or phone for the
  person: the Person is created from a professional source and the Account Claim is authentication
  that never enters the ontology (ADR 0010). A name is printed and not stored, and is never inferred
  into person-state.

**A general CV is not an application artifact:**

```text
ReusableMarketsCV ≠ BarclaysSubmittedCV
MarketsRepresentation ≠ BarclaysMarketsAdaptedState
```

Nothing in the rendering path takes an opportunity, JD, employer or posting. A tailored document is
Adapted State (Adaptation); what was actually sent is an immutable Application Record (Execution).

Rendering lives on `@joby/identity/runtime`, not the domain contract: its only consumer is the HTTP
surface and its compiler is a composition choice, exactly like the model adapters.

### 2. UC10 — the lens as an optional prior

```text
A^C = T(E_t, L_t, C, P_i)      P_i optional
```

`getRepresentationPrior` returns `P_i`: the lens's name and purpose, its positioning themes, and
**preferences keyed by canonical node id** — suggested inclusion, suggested priority, emphasis, and
the person's own reusable wording.

Two properties make "prior, not filter" structural rather than a rule to remember:

- **The prior carries no professional evidence.** No canonical label, contribution, capability,
  consequence or date. A consumer holding only a prior cannot say what any of those node ids *are* —
  it must read Durable Identity. That is what makes `T(V_i, C)` unwritable by accident rather than
  merely discouraged.
- **Hiding travels as a preference, not as an absence.** A set-aside fact appears with
  `suggestedInclusion: false`. Dropping those entries is the single change that would turn this into
  an evidence whitelist, and it would look like a harmless filter in review.

```text
HiddenInLens   ≠ UnavailableToAdaptation
PriorityInLens ≠ CanonicalImportance
```

Adaptation keeps the broad canonical snapshot of ADR 0013. When a specific role makes normally
de-emphasised evidence locally valuable, it recovers that evidence from Explicit State and promotes
it **for that opportunity only** — and the lens does not change. `P_i` is optional throughout, because
applying to something outside every lens a person keeps is a normal case, not a degraded one.

No Adaptation behaviour is implemented here. This is the seam it will consume, and the seam is on the
Identity side because Adaptation has no code yet and Identity must not import it.

### 3. UC11 — the learning seam, deferred

```text
Application history -> Memory -> personal learning -> representation improvement -> better prior
```

Preserved as direction and constraint only. Nothing is implemented: no learning, no scoring, no
recommendation, no automatic lens mutation.

The constraints that must hold when it is built:

- **Memory decides what accumulated resolved history justifies learning** (ADRs 0005, 0006). One
  application is not a pattern.
- **Identity Representation owns the persistent lens.** A generalized improvement is a *proposal to
  the user* about their own positioning, arriving through the slow loop.
- **Adaptation may never write a lens.** The contract exposes no path for it, and one opportunity
  rewriting how someone generally presents themselves is the fast loop concluding.
- Any future update stays grounded in Durable Identity and user-governed where it is consequential.

### 4. Identity Representation is complete for the placement scope

Create, position, materialize, and offer as a prior. What remains is deliberately out: skill-level
positioning (skills aggregate, so there is no single canonical node to key a decision to), positioning
history, additional output formats, and the learning path above.

## Consequences

- The wedge artifact exists: a student shapes a Markets lens once and renders a general Markets CV
  for every Markets application, with each line traceable to a confirmed fact.
- Correcting a fact changes every future CV and every prior, with no synchronisation anywhere,
  because nothing derived is stored.
- Adaptation can be built without re-litigating the hierarchy: it reads canonical Identity, optionally
  reads a prior, and receives its context. The failure mode it cannot fall into is using the lens as
  its evidence base, because the prior does not contain evidence.
- Deployments without a LaTeX toolchain lose PDF only, and say so.
- Cost: the escaping table is now security-critical code in a domain package, and the CV template is
  a place formatting requests will accumulate. Both are contained in one file each, deliberately.
- A person's name is still not something Joby holds. Rendering a CV makes that gap visible rather
  than papering over it, which is the right way round.

## Alternatives Considered

- **Store the rendered CV (document or PDF).** Rejected: a second, staler copy of the person's
  history, and immediate synchronisation and versioning machinery to manage it — for a render that is
  cheap and always correct when derived.
- **Give Adaptation the lens's positioned output as its input.** Rejected — this is the collapse into
  `T(V_i, C)`. It reads as an efficiency and silently makes a general preference an evidence
  boundary.
- **Omit hidden nodes from the prior.** Rejected for the same reason, in smaller form: a whitelist
  wearing a filter's clothes.
- **Let the user supply their own LaTeX template.** Rejected: arbitrary LaTeX is arbitrary code
  execution, and there is no safe sandbox worth building for a formatting preference.
- **Put CV rendering on the domain contract.** Rejected: no domain consumes it; the HTTP surface does.
- **Sketch the Memory→Representation learning path in code now.** Rejected: it needs Memory, which
  does not exist, and a learning path built against an imagined producer would be re-designed the day
  a real one appeared.

## Revisit When

A second output format is wanted (the split between `CvDocument` and the renderer is what makes that
cheap); rendering needs to happen asynchronously or at volume; a person's name genuinely needs to be
person-state; Adaptation is implemented and the prior's shape meets real use; or Memory begins, and
the deferred learning path in §3 becomes a decision someone must actually make.
