# ADR 0009 — Explicit State as Structure, Activity and Relations

- **Status:** Accepted — extended by [ADR 0011](0011-explicit-state-as-reconstructed-state-and-stated-context.md);
  top-level framing superseded by [ADR 0031](0031-identity-router-translation-application-pci.md)
  (2026-09-03), which names the coherent unit a **Profile Unit** (Context, Contribution,
  Capabilities, Consequence). The component ontology and projection rules below remain in force.
- **Date:** 2026-08-14
- **Domains affected:** Identity (owner), Memory, Intelligence, Execution (all read Explicit State)
- **Extends:** [ADR 0005](0005-durable-identity-as-the-person-centric-primitive.md) (which defined Explicit State by enumeration), [ADR 0008](0008-workspace-context-and-baseline-identity-state.md) (Explicit State at the Baseline Identity State)

> **Clarified (2026-08-16 by rewritten ADR 0011).** The ontology below is unchanged and remains the
> whole of Explicit State: **E = (Structure, Activity, Relations)**. Stated Context `X_t` is distinct
> Identity-owned context authored only by the user. The earlier 2026-08-14 framing of `E = (R, X)`
> is superseded; read every `Eₜ = (Sₜ, Aₜ, Rₜ)` below as Explicit State, as originally written.

## Context

ADR 0005 defined Explicit State by listing what it contains: *education, experience, projects,
achievements, EvidenceItems, skills where explicitly maintained, preferences, work constraints,
career direction, documents, provenance.* That was the right level of precision for establishing
Durable Identity as the primitive. It is the wrong level for building it.

An enumeration read as a schema produces one canonical store per noun — an Education table, an
Experience table, a Projects table, a Skills table. Three problems follow, and all three are
expensive after data exists.

**The nouns overlap.** A final-year project done inside a placement is a project, an experience, and
evidence of a skill. Under four stores it is written three times and drifts three ways, which is the
second-source-of-truth failure ADR 0005 exists to prevent, reintroduced one level down.

**The nouns are the wrong grain for provenance.** A CV line — *"contributed to the payments
migration, cutting settlement time 40%"* — is one traceable fact containing a contribution, a
capability and a consequence. Stored as an Experience row, its parts cannot be separately confirmed,
corrected, or traced to the source that supports each, and Tier 1 requires atomic provenance for
every confirmed fact.

**Sparse information does not survive them.** A row shaped like a job expects an employer, a title
and dates. A placement student's real material is frequently missing several of those. Under a
noun-per-store model the absences become nulls to be filled, and the pressure at extraction time is
to fill them — which is fabrication with a schema's blessing.

The identity roadmap fixes the ontology instead, and forbids the separate canonical stores. This ADR
records that, and reconciles it with documentation that still enumerates.

## Decision

### Explicit State is a graph, not a set of typed records

> **Eₜ = (Sₜ, Aₜ, Rₜ)**

**Structure (S)** — the durable professional contexts a life is organised into: an institution, an
organisation, a programme, a course, a role, an engagement, a team, a period. Structure says *where
and within what*, never *what was done*.

**Activity (A)** — what the person actually did. Each activity is

> **aᵢ = (Contributionᵢ, Capabilityᵢ, Consequenceᵢ)**

*Contribution* is what they did; *Capability* is what doing it required or demonstrated;
*Consequence* is what resulted. The three are stored independently.

**Relations (R)** — typed, directed links between Structure and Activity nodes. The initial
vocabulary is deliberately small: `occurred_within`, `associated_with`, `uses_capability`. These are
**candidates, not permanent ontology** — a relation earns its place by being needed to answer a
concrete query. A generic `related_to` is not introduced; a link that means nothing in particular
cannot be queried and cannot be explained to the user.

### Sparse activities are valid, not incomplete

Any supported subset of contribution, capability and consequence is a legitimate activity. An
activity with a contribution and nothing else is complete information about an incomplete source.

**Absence is never filled.** A missing consequence is missing — not inferred from the contribution,
not softened into a plausible one. Missing must survive extraction, storage, retrieval, correction
and projection without ever becoming stronger.

### Education, Experience, Projects, Skills, Achievements and Evidence are projections

They remain exactly as they are in the product and the UI. They stop being storage.

| View section | Derived at read time from |
|---|---|
| Education | Structure nodes for institutions and programmes, plus the activities that `occurred_within` them |
| Experience | Structure nodes for organisations and roles, plus their activities |
| Projects | Activities, with the Structure they occurred within where one exists |
| Skills | **Capability components aggregated across activities.** Not a maintained list |
| Achievements | **Consequence components**, surfaced with the contribution that produced them |
| Evidence | The provenance behind confirmed facts, wherever they sit in the graph |

The Permanent Identity View is a projection of Explicit State. It stores no person-state, holds no
copy, and is regenerated from current Explicit State — the same rule ADR 0008 sets for the Permanent
Workspace, applied to identity content.

Skills deserve the emphasis: a maintained skills list is a claim detached from what the person did.
Deriving capability from activity is what keeps every skill traceable to something they actually did,
which is Product Doctrine 4 holding at the level where it usually breaks.

### What this does not decide

**Stated Career Direction, preferences and work constraints are out of scope here.** They are
Explicit State under ADR 0008, they are user-owned, and they are none of Structure, Activity or
Relations — they are *stated*, never reconstructed from a professional source. The triple above
governs **reconstructed professional truth**; where stated context sits relative to it is a real
open question and gets its own decision when a slice needs it. UC01–UC03 does not: CV reconstruction
produces history, not direction.

One rule applies to it regardless, and applies now: **no source reconstruction may write stated
context.** A CV that mentions an ambition is evidence that the person once wrote an ambition down,
not a statement of their current direction.

Also not decided: storage shape (normalised tables versus JSONB), identifiers, indexes, repository
decomposition, and how relations are represented directionally. Those are implementation choices and
stay open (roadmap Tier 3).

## Consequences

- **One place to write a fact.** The overlap between project, experience and evidence disappears, because they are the same graph viewed differently.
- **Provenance gets the grain it needs.** Contribution, capability and consequence are separately traceable, separately confirmable, and separately correctable — which is what "atomic provenance" requires in practice.
- **Sparse material is representable without nulls-to-be-filled**, removing the structural pressure to fabricate at extraction time.
- **The UI is unaffected.** Users still see Education, Experience, Projects and Skills. Nothing about the product's surface changes; what changes is that those sections can no longer disagree with each other.
- **Cost: reads are harder.** Every familiar section is now a query with joins and aggregation, where a table read would have done. Projection performance will eventually invite a cache of person-state, and that cache would be a second source of truth. It is forbidden here for the same reason ADR 0008 forbids it in the Permanent Workspace, and it will look like a sensible optimisation when it is proposed.
- **Cost: the graph is less obvious than four tables.** Anyone reading the code has to learn the vocabulary before the model makes sense, which is what `packages/identity/CLAUDE.md` exists to carry.
- **Relation vocabulary will be under pressure to grow.** Each addition is a decision, not a convenience; the small set is the point.
- **Documentation that enumerates is now wrong** and is corrected in the same change: `JOBY_MEMORY.md` §2.1/§3.1/§7/§11, `packages/identity/README.md`, and the `identity-evidence` skill. ADRs 0005 and 0008 keep their original text and gain dated forward notes, per the ADR conventions.
- No event contract changes. `IdentityUpdated` still means a confirmed change to Explicit State.

## Alternatives Considered

- **Keep the enumeration and build four canonical stores.** Rejected above: overlap, provenance grain, and sparse-information handling all fail, and each failure is expensive to reverse once real identities exist.
- **Keep four stores and add a cross-cutting evidence table.** Rejected: provenance would be atomic while the facts it describes remain duplicated, so the same fact could carry two different provenances.
- **A single generic `fact` table with a type column.** Rejected: it is a graph with the relations left implicit, so the queries the product needs — what did this person do inside this organisation, what capability does this claim rest on — become string matching.
- **Model skills as a first-class maintained list alongside activities.** Rejected: a skill with no activity behind it is exactly the untraceable claim Product Doctrine 4 forbids. A user asserting a capability directly is an activity-less claim, and needs its own decision if the product ever wants one.
- **Defer the whole question until Release 2, when schema is written.** Rejected: Release 1 produces drafts containing proposed Structure, Activity and Relations, so the vocabulary is load-bearing one slice earlier than the storage is.

## Revisit When

A concrete query needs a relation the initial vocabulary cannot express; projection cost becomes a
real measured problem rather than an anticipated one (and the answer is a materialised projection with
an explicit invalidation rule, **never** a durable second copy of person-state); a slice needs stated
Career Direction, preferences or constraints modelled, which is the open question above; or the
product wants user-asserted capability with no activity behind it.
