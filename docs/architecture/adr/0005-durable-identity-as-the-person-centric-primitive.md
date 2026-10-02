# ADR 0005 — Durable Identity as the Person-Centric Primitive

- **Status:** Accepted — extended by [ADR 0008](0008-workspace-context-and-baseline-identity-state.md), [0009](0009-explicit-state-as-structure-activity-relations.md), [0010](0010-person-creation-at-first-capture-and-the-account-claim.md) and [0011](0011-explicit-state-as-reconstructed-state-and-stated-context.md)
- **Date:** 2026-08-12
- **Domains affected:** Identity, Memory, Development, Execution (cross-cutting product model)
- **Extends:** [ADR 0001](0001-modular-monolith-with-seven-domain-packages.md) — domain boundaries unchanged; what Identity, Memory and Development *own* is sharpened here

> **Extended, not superseded (2026-08-12).** Durable Identity as the primitive, the Explicit/Learned
> State split, PCI inside Durable Identity, and the ownership boundary below all stand unchanged.
> What changed is the **Workspace** definition: this ADR recast Workspace as a purely temporary
> contextual projection, and ADR 0008 refines it into two layers — a **Permanent Workspace Context**
> (the persistent user-facing environment over Durable Identity) and **Temporary Workspace Contexts**
> (task-specific compositions, as described here). Durable Identity remains the sole owner of
> persistent person-state; the Permanent Workspace holds no copy of it. ADR 0008 also adds the
> **Baseline Identity State**, the starting condition this ADR did not define.

> **Extended again (2026-08-14).** Two later decisions refine this one; nothing below is withdrawn.
> **ADR 0009** replaces the *enumeration* of Explicit State in the section below — "education,
> experience, projects, achievements, EvidenceItems, skills where explicitly maintained…" — with an
> ontology of Structure, Activity and Relations. Rewritten **ADR 0011** confirms that this remains
> **Explicit State `E`**, while **Stated Context `X_t`** is distinct Identity-owned context which only
> the user may author. Each activity is
> (contribution, capability, consequence) and any subset is valid. Those nouns remain exactly what
> the user sees, as **projections**; they are not stores. What Explicit State *is* — user-owned,
> confirmed, never silently mutated by AI — is unchanged. **ADR 0010** fixes when the Person and the
> Durable Identity root are created (with the first professional source, unclaimed) and keeps account
> verification outside this ontology.

## Context

The earlier model organised durable person-state around a **Workspace** — variously an Applicant
Workspace or Canonical Workspace — as the source of truth, with a Personal Career Intelligence model
sitting beside it as a separate person-level thing. The top-level architecture read as
Workspace → Translation → Application Record → PCI.

Three problems with that.

**The durable thing was the wrong shape.** A workspace is inherently contextual: it exists because a
person is doing something right now. Making it the source of truth means the person's durable
professional reality is stored inside whichever task they last performed, and everything durable has
to be copied, merged, or re-derived when the context changes. In practice this produces the
application-centric behaviour the product exists to avoid — knowledge accumulating per application
instead of per person.

**PCI floated free of Identity.** Two person-level models, both claiming to describe the person, with
no stated relationship. That guarantees eventual disagreement about which one is authoritative, and
guarantees the question "what does Joby think about me?" has two answers.

**The flow diagram implied a pipeline.** Workspace → Translation → Application Record → PCI suggests
learning is the tail end of applying. It isn't: learning aggregates across many experiences, most of
which are not applications.

## Decision

**Durable Identity is the persistent professional model of the person, and the primitive Joby
organises around.** It holds two governed state families.

### Explicit State — what is explicitly true about the person

Education, experience, projects, achievements, EvidenceItems, skills where explicitly maintained,
preferences, work constraints, career direction where explicitly stated, documents and artifacts, and
provenance.

User-owned, inspectable, editable. AI may propose changes; **AI must not silently mutate Explicit
State**; consequential changes require explicit user confirmation.

### Learned State — Personal Career Intelligence

Representation preferences, evidence preferences, voice tendencies, recurring performance patterns,
market-response patterns, career-direction signals, inferred strengths, inferred constraints,
developmental patterns, uncertainty and confidence, hypotheses worth testing.

Must be evidence-backed. Preserves `Observed` / `Inferred` / `Hypothesized`. Does not treat single
outcomes as permanent truth. Changes more slowly than operational state.

**PCI is the Learned State component of Durable Identity**, not a competing top-level model.

### Workspace is redefined

> Workspace is the **dynamic operating projection** of Durable Identity into the user's current
> professional context.

Contextual and temporary — an Application Workspace, an Interview Workspace, a Network Workspace. It
may hold whatever operational state the current task needs. **It does not own canonical professional
truth.** Anything that must outlive the task becomes a Record, or enters Durable Identity after
confirmation.

### Translation is preserved

Given Durable Identity and the current context, how should Joby represent or act on that identity
now. The user owns intent; Joby owns translation and administration. Translation must not mutate
Explicit State merely because a contextual representation changed.

### Identity, Memory and Development stay separate

Deliberately, against the obvious simplification of folding all person-state into Identity:

- **Identity** owns the *state* — Explicit State and Learned State as resulting person-state, plus canonical professional state. It does not own every process that changes that state.
- **Memory** owns the *slower learning process* — evidence accumulation from meaningful Records, conservative PCI update logic, epistemic status handling. It produces justified Learned State updates.
- **Development** owns *interpretation of change over time* — constraint identification, development signals, interpretation of repeated experience. It does not react to every operational event.

These are three different rule sets with three different failure modes: a wrong Explicit State write
misrepresents the person to an employer; a wrong PCI update misjudges them quietly and durably; a
wrong development signal tells them something discouraging and unfounded. Collapsing them into one
identity domain would put all three behind one boundary with one set of rules — and the domain that
owns the state would also own the process that changes it, which is precisely the check worth
keeping.

## Consequences

- The durable thing is now person-shaped. Knowledge accumulates per person, across contexts, which is the product thesis.
- There is one answer to "what does Joby know about me", with two clearly governed halves and different confirmation rules for each.
- Workspaces become cheap and disposable — reconstructible from Durable Identity plus context. Losing one loses nothing durable.
- **Cost:** more indirection. Every operational feature reads through a projection instead of owning its state, and the boundary between "operational state this task needs" and "something that should become durable" must be decided per feature. That decision is now a design step, not an accident.
- **Cost:** three domains rather than one for person-state. Some changes touch Identity and Memory together. Accepted, for the separation of process from state.
- Execution reads Durable Identity and contextual Workspace and must not directly mutate Explicit State — which means some flows need an explicit confirmation step they would otherwise have skipped.
- Existing event contracts are unaffected. `IdentityUpdated` already means confirmed change to person-state; it now names Explicit State specifically.

## Alternatives Considered

- **Keep Workspace as the durable source of truth.** Rejected: the durable model would be shaped by the last task performed, which reproduces application-centric knowledge.
- **Keep PCI as a separate top-level model beside Identity.** Rejected: two person-level models with no stated relationship is a guaranteed authority conflict.
- **Collapse Identity, Memory and Development into one identity domain.** Rejected above: it merges three distinct governance regimes and lets the owner of the state also own the process that changes it.
- **Merge Explicit and Learned State into one store with a confidence field.** Rejected: confirmation rules differ fundamentally. "The user said this" and "we inferred this from four rejections" cannot share a write path without one of them being governed too loosely.

## Revisit When

Learned State turns out to need a genuinely different storage or lifecycle model from Explicit State;
or a Workspace type accumulates state that legitimately must be durable and isn't a Record — which
would mean a concept is missing, not that Workspace should own truth again.
