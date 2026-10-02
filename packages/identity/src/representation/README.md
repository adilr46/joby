# Identity Representation module boundary

```text
V_i = P_i(E_t)
```

A **persistent, reusable, non-canonical** projection of Durable Identity under a named lens —
"Markets", "Investment Banking", "Software Engineering". The person keeps it and returns to it.

With its positioning decisions applied:

```text
E_t + Decisions_i -> V_i
```

> How do I generally want my existing professional truth organized and represented in this
> professional domain?

See [ADR 0014](../../../../docs/architecture/adr/0014-identity-representation-as-a-persistent-non-canonical-projection.md)
(the lens),
[ADR 0015](../../../../docs/architecture/adr/0015-representation-positioning-as-decisions-over-canonical-nodes.md)
(positioning) and
[ADR 0016](../../../../docs/architecture/adr/0016-representation-materialization-and-the-adaptation-prior.md)
(materialization and the Adaptation prior).

## The three boundaries inside Identity

| Boundary | Question | Lifetime |
|---|---|---|
| **Durable Identity** | what is true about this person? | permanent |
| **Identity Representation** | which reusable projection of that truth do I want? | persistent |
| **Adaptation** | how should that truth be interpreted for this exact opportunity? | one cycle |

```text
Markets Identity Representation + Barclays Markets JD -> Barclays Markets Adapted State
```

**Never say "representation" alone here.** Adaptation's *contextual representation* is a tailored CV
or answer rendered from Adapted State. These are different objects with different lifetimes, and the
full term keeps them apart.

## What is stored, and what is not

**Stored:** the lens (name, purpose, ownership, revision), its ordered positioning themes, and
**decisions about canonical node ids**.

**Not stored, ever:** content, sections, node lists, summaries, snapshots — and no opportunity, JD,
requirements or company. Content is derived from Reconstructed State **at read time**, through the
same projection the Permanent Identity View uses.

That is why there is no synchronisation, no invalidation and no drift in this module: a correction to
Explicit State simply shows up on the next read. A content column would undo all of it at once.

A decision names a fact and says what this lens does with it. It copies no label, contribution,
capability, consequence or date — and it cannot exist without the canonical node, which is a foreign
key, and which must belong to this lens's person.

| Decision | Use case | Neutral default |
|---|---|---|
| `included` | UC05 select / hide | included |
| `priority` | UC06 order — lower is higher, sparse | unranked, sorts last |
| `emphasis` | UC07 emphasise / de-emphasise | neutral |
| `framing` | UC08 context-independent wording | the canonical label |

Emphasis and priority are separate signals: de-emphasising is not demoting, and merging them would
make one of them unexpressible.

Reading returns four things:

| | |
|---|---|
| `representation` | the stored lens |
| `derivedFrom` | lineage — person, durable identity root, canonical revision, when |
| `projection` | the **ungoverned** canonical projection: what Durable Identity says, in full |
| `positioning` | themes, the raw decisions, and `evidence` — the lens applied |

## The lens is a prior, not a boundary

```text
HiddenInLens   ≠ UnavailableToAdaptation
PriorityInLens ≠ CanonicalImportance
```

A general positioning choice made once must never silently censor the evidence a specific opportunity
can reach. Three structural guarantees (ADR 0015):

- canonical state is untouched — hiding writes a decision row, and Explicit State does not know this
  lens exists;
- the read model keeps the ungoverned `projection` beside the positioned view;
- hidden evidence comes back **flagged and sorted last, never dropped** — rendering takes what is
  included, and recovering what was set aside needs no special access.

## Framing presents truth; it never replaces it

`canonicalTitle` travels beside `framing` on every positioned entry. Wording may reinterpret how
existing truth is presented — "Rota scheduler" read as "constraint solving under operational
uncertainty" — and what Explicit State records stays visible underneath.

**General positioning only.** Wording aimed at one employer, posting or interviewer is Adapted State.

## Seams

**Durable Identity — a two-method read port.** `findPerson` and `projectIdentity`. This module holds
no canonical repository and no transaction, so "writes nothing canonical" is a property of what it
was given, not a promise about how it behaves.

**Adaptation — documented, not built.** Adaptation may read a representation as the starting lens for
an opportunity. Three rules:

- a representation is a lens, **not source truth** — claims still ground in canonical Identity
  provenance, and reading a projection instead of `E_t` would be translating a translation;
- **Adaptation never writes a representation** — opportunity-specific selection, ordering, emphasis
  and wording are Adapted State, for that cycle (ADRs 0012, 0013);
- a lens **does not narrow what Adaptation may read** — the broad canonical snapshot stands.

## Materializing a lens (UC09)

```text
Identity Representation -> CvDocument -> LaTeX -> PDF
```

`CvDocument` is the schema; **LaTeX is a renderer downstream of it**, not the domain model and never
a source of truth. One server-controlled template, and **no user-authored LaTeX, ever**: every value
is escaped through a single-pass table before it reaches the output, and the compiler runs with shell
escape disabled. LaTeX is a programming language, and Joby compiles the result on its own machine —
`escapeLatex` is security code, not formatting.

**Nothing is stored.** No document rows, no PDF bytes. A render is derived from current Explicit
State plus the lens, so a correction reaches the next CV with nothing to invalidate.

The CV is **general to the lens**:

```text
ReusableMarketsCV     ≠ BarclaysSubmittedCV
MarketsRepresentation ≠ BarclaysMarketsAdaptedState
```

Nothing in the path takes an opportunity, JD or employer. A tailored document is Adapted State; what
was actually sent is Execution's immutable Application Record.

The header (name, contact) is **caller-supplied presentation input**. Joby holds no name for the
person — the Account Claim is authentication and never enters the ontology (ADR 0010) — so it is
printed and not stored, and never inferred into person-state.

Compilation sits behind a port. Without a toolchain the document and `.tex` are still returned, and
the missing compiler is reported rather than silently degraded.

## The Adaptation prior (UC10)

```text
A^C = T(E_t, L_t, C, P_i)      P_i optional
```

`getRepresentationPrior` hands Adaptation the lens's themes and its **preferences keyed by canonical
node id** — suggested inclusion, suggested priority, emphasis, reusable wording. Two properties make
"prior, not filter" structural:

- **It carries no professional evidence.** A consumer holding only a prior cannot say what any node
  *is*; it has to read Durable Identity. That is what makes `T(V_i, C)` unwritable by accident.
- **Hiding travels as a preference** (`suggestedInclusion: false`), not as an absence. Dropping those
  entries is the one change that turns this into an evidence whitelist — and it would look like a
  harmless filter in review.

When a role makes de-emphasised evidence locally valuable, Adaptation recovers it from Explicit State
and promotes it **for that opportunity only**. The lens does not change.

## The future learning seam (UC11 — deferred)

```text
Application history -> Memory -> personal learning -> representation improvement -> better prior
```

Direction and constraints only; **no behaviour, and none to be added here.** Memory decides what
accumulated resolved history justifies learning; a generalized improvement is a proposal to the user
about their own positioning, arriving through the Slower Learning Loop; and **Adaptation may never
write a lens** — one opportunity does not get to rewrite how someone generally presents themselves.

## Hard negative boundary

Code under this directory must never:

- write `R`, `X` or `L`, or move the identity revision;
- import Identity repositories, the correction/review/capture services, or their tables;
- name a canonical table for anything but the ownership check — which selects ids, never facts;
- store derived facts, a snapshot, or a summary of the person;
- copy a label, contribution, capability, consequence or date into a decision;
- **filter the canonical projection**, or let hiding remove anything from what downstream can reach;
- omit a hidden node from the Adaptation prior, or put professional evidence into it;
- accept user-authored LaTeX, or reach the output without passing through `escapeLatex`;
- store a rendered document, PDF or any other materialized copy of the person's history;
- carry an opportunity, job description, requirements or company — that is Adapted State;
- write Stated Context, or let a lens be read as a statement of Career Direction;
- publish an event. `IdentityUpdated` means canonical change, and this is not one.

## Not yet

Skill-level positioning — skills aggregate across activities, so there is no single canonical node to
key a decision to, and a decision needs one. Positioning history. Output formats beyond the one
template. Opportunity-specific adaptation, which is Adaptation's. And any inference of positioning
from what the person has done before: that needs the learning system, which does not exist, and a
prior inferred from two applications is a confident conclusion from nothing.
