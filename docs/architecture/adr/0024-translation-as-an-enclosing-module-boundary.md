# ADR 0024 — Translation as an Enclosing Module Boundary

- **Status:** Superseded by ADR 0029
- **Date:** 2026-09-01
- **Modules affected:** Adaptation (moved), Intelligence (new seam), Execution (new seam);
  Durable Identity and Identity Representation structurally
- **Amends:** ADR 0023 (module topology and terminology)
- **Related:** ADR 0007 (Opportunity Evaluation), ADR 0013 (Adapted State), ADR 0018 (Adaptation
  Context Interpretation), ADRs 0014–0016, 0019–0022

## Context

`CLAUDE.md` has always named **Translation** as a first-class idea — *"Translation turns Durable
Identity plus context into a representation or an action. The user owns intent. Joby owns
translation and administration."* — but Translation had no place in the architecture. It was a
sentence, not a boundary.

Meanwhile the code said something different from the documents in three places:

1. **Adaptation lived inside `packages/identity`.** ADR 0023 made Adaptation a peer Joby Core module
   and explicitly noted that "existing package layout is an implementation state, not the
   architecture" and that "modules may be extracted from `packages/identity` into clearer package
   boundaries without becoming network services". The extraction had not happened, so every
   enforcement rule about Adaptation was written as a list of *sibling files it must not import* —
   a rule that holds only as long as someone maintains the list.

2. **`packages/intelligence` and `packages/execution` existed as placeholder READMEs** asserting
   that neither is a module. They were dead directories whose entire content was a negative claim.

3. **Intelligence was referred to in live code comments as a thing that would arrive** (the
   composition root in `apps/api`, `@joby/identity/testing`) with no place for it to arrive into.

Intelligence is going to be built. Without a decided home, the first slice would have to choose one
under delivery pressure, and the likely choices were the two worst: inside `packages/identity`,
repeating the Adaptation mistake, or as a bare top-level package with no stated relationship to the
work it is part of.

## Decision

**Translation becomes an explicit enclosing architectural boundary containing three strongly owned
modules: Intelligence, Adaptation and Execution.**

```text
JOBY CORE
│
├── Durable Identity
├── Identity Representation
├── TRANSLATION
│   ├── Intelligence
│   ├── Adaptation
│   └── Execution
├── Opportunity
├── Application
├── Portal
└── Memory
```

It is realised as one workspace package, `@joby/translation`, with one directory and one declared
public entry point per module.

### Translation encloses; it does not own

Translation owns **no behaviour, no tables, no events and no public interface of its own**. Every
capability belongs to one of the three modules. Specifically:

- **The package has no root export.** There is no `@joby/translation`, only
  `@joby/translation/intelligence`, `/adaptation`, `/execution` and `/testing`. A root export would
  become a facade, and a facade over three modules is the boundary dissolving rather than holding.
- **A sibling is not an internal.** Intelligence, Adaptation and Execution are as separate from each
  other as any two Joby Core modules. No sibling imports a sibling; each is reached through its
  public entry point or not at all, and collaboration goes through a composition root.
- **Translation names no module in the event vocabulary.** `MODULE_NAMES` is unchanged: Adaptation is
  already there, and the two seams own no events because they own no behaviour.

### Terminology

ADR 0023 fixed **service** to mean an independently distributed runtime boundary. Translation is not
one, and this ADR does not make it one. In active documentation Translation is a **boundary** or a
**module group**; the word "service" is not used for it. No transport, HTTP, RPC or broker is
introduced, and ADR 0023's distribution rule applies unchanged: distributing Translation or any
module inside it requires demonstrated evidence and a further ADR.

### Adaptation moves, and nothing else about it changes

`packages/identity/src/adaptation` becomes `packages/translation/src/adaptation`, verbatim.
Behaviour, public surface, tables (`adaptation_context`, `adaptation_application_input`,
`adaptation_representation_draft`), migrations, ports and doctrine are untouched. Every ADR governing
Adaptation — 0013, 0018, 0019, 0022 — continues to govern it in full.

Two consequences are improvements rather than side effects:

- **The read boundary becomes structural.** Adaptation could previously have reached Durable Identity
  internals with a relative import, and was stopped by a maintained deny-list of filenames. Across a
  package boundary that reach is not spellable. The rule is now an allow-list of two public entry
  points (`@joby/identity`, `@joby/identity/representation`), which is smaller, stronger and does not
  rot as Durable Identity grows files.
- **`FakeOpportunityUnderstandingPort` moves to `@joby/translation/testing`.** The double proves
  Adaptation's own seam, so it belongs beside it rather than in Durable Identity's testing surface.

The dependency edge is one-directional and enforced: Translation reads Durable Identity; Durable
Identity does not import Translation. Otherwise `Identity -> Adaptation -> Identity` would be on the
package graph.

### Intelligence and Execution are seams, not implementations

Each gets a directory, a public entry point, registered resolution in `tsconfig.json` and
`vitest.config.ts`, a README, and the same enforced import rules as Adaptation — and **zero
exports**, pinned by a test. No types, no interfaces, no factories, no ports, no tables, no
migrations, no scoring, no evaluation, no persistence.

That pin is the load-bearing part. A seam with a plausible-looking placeholder interface is worse
than no seam, because the first implementer inherits a contract nobody decided. A seam pinned at
zero forces the decision to be made in the open.

### The legacy placeholder packages are removed

`packages/intelligence` and `packages/execution` are deleted. Their content was a negative claim
about a layout that no longer exists. The substance of that claim — the ownership question below —
is carried here instead, where it is answerable.

## What this ADR deliberately does not decide

Two ownership questions are **open**, and creating a seam does not settle either. Both are recorded
in the module READMEs and in `packages/translation/CLAUDE.md`, and neither may be resolved by writing
code.

1. **Intelligence vs Opportunity.** ADR 0007 and ADR 0023 assign opportunity sourcing,
   normalization, company/role understanding and Opportunity Evaluation to **Opportunity**. What
   Intelligence owns that Opportunity does not is undecided. Adaptation's existing
   `OpportunityUnderstandingPort` is a consumer port and remains one regardless of the answer, so
   nothing in Adaptation changes when the answer arrives — which is exactly the property the seam
   was created to preserve.

2. **Execution vs Application and Portal.** ADR 0023 assigns application lifecycle, tasks,
   submissions and the immutable Application Record to **Application**, and external portal
   interaction plus portal-specific execution state and failures to **Portal**. That division stands
   until an ADR changes it. Execution having a named place does not transfer either.

Naming a module is not the same as giving it responsibilities. Until a further ADR states what these
two own, the honest description is: Translation has three modules, one of which does something.

## Consequences

- Translation is now a boundary in the architecture, not only a sentence in the doctrine, and the
  three things Joby does with a person's identity have one enclosing name.
- Adaptation's isolation from Durable Identity is enforced by package structure rather than by a
  maintained list of forbidden filenames.
- Intelligence has a home, an entry point and enforced boundaries before it has behaviour, so its
  first slice is about Intelligence rather than about where Intelligence lives.
- ADR 0023's seven-module map gains one level of nesting. Module ownership, the one-database
  topology, the event contract and the distribution rule are all unchanged.
- Two ownership questions are now recorded as explicitly open where a reader will find them, instead
  of implied by placeholder directories.
- `@joby/identity/adaptation` no longer exists; consumers use `@joby/translation/adaptation`. This is
  a compile-time break with no runtime behaviour change, and every call site was updated in the same
  change.

## Alternatives Considered

- **Leave Adaptation in `packages/identity` and create Translation as documentation only.** Rejected:
  it reproduces exactly the gap this ADR exists to close — an architecture that lives in prose while
  the import graph says something else.
- **Give Translation a root export that re-exports the three modules.** Rejected: convenient, and it
  makes the boundary permeable in one line. A consumer would import "Translation" and reach whichever
  module was re-exported, with no rule left to enforce.
- **Give Intelligence and Execution provisional interfaces so they compile as "real" modules.**
  Rejected as speculative design. A placeholder contract is a product decision made by whoever was
  fastest, and it is far harder to remove than to add.
- **Make Translation a distributed service, as the phrase "Translation Service" suggests.** Rejected
  under ADR 0023's distribution rule: no module has demonstrated a need for independent
  distribution, and a network edge here would add failure modes and consistency problems with no
  product value.
- **Three top-level packages instead of one enclosing package.** Rejected: it produces the same file
  layout with no expressed relationship, and the enclosing boundary is the thing being decided.

## Revisit When

Intelligence or Execution acquires behaviour — at which point the corresponding ownership question
above must be answered by an ADR first. Also revisit if Translation starts to accumulate anything of
its own, which would mean the boundary has quietly become a module and needs either a real ownership
statement or removal.
