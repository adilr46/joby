# ADR 0032 — Aligning the Codebase to the Canonical Topology

- **Status:** Accepted — implementation record for [ADR 0031](0031-identity-router-translation-application-pci.md)
- **Date:** 2026-09-03
- **Scope:** Package layout, semantic ownership in code, new module seams

## Context

ADR 0031 fixed the topology; the code still expressed the previous one. Three mismatches were
load-bearing rather than cosmetic:

1. **Opportunity understanding lived inside Translation** (`translation/src/intelligence`), with a
   *second* set of `OpportunityContext` / `ConditionComparison` types duplicating Adaptation's.
2. **Router and Interview Intelligence did not exist.** Representation selection was performed by
   whoever called `createContext` with a `representationId`.
3. **PCI had no home.** `packages/memory` described a Career Memory that ADR 0031 renames and
   re-scopes.

## Decision

### Opportunity understanding moves to Opportunity

`packages/translation/src/intelligence` is deleted. Its understanding half — interpreter, port,
validation, repository, service — moves to `packages/opportunity/src/understanding`. The duplicated
type set goes with it.

**The condition vocabulary becomes Opportunity's own.** `OPPORTUNITY_CONDITION_KINDS` replaces an
import of Identity's `USER_CONDITION_KINDS`: what a *posting* may state must not be bounded by what a
*person* may state about themselves, and `@joby/opportunity` now depends on neither Identity nor
Translation.

### Person × opportunity mapping moves to Adaptation

Comparing what a posting states against what the person has stated is contextual interpretation, so
it belongs to Adaptation (ADR 0031 removes person↔opportunity mapping from Opportunity). Adaptation
consumes understanding through one narrow `OpportunityUnderstandingPort` and performs the comparison
itself, on its own types. One set of types now exists where there were two.

### Profile Units become the canonical unit — composed, not stored

```text
ProfileUnit = Context + Contribution + Capabilities + Consequence
```

A unit's identity is its Activity node; its Context is the Structure it `occurred_within`. That
relationship already exists in `E`, so `getProfileUnits` is the *reading* of canonical truth as a
unit rather than a copy of it.

**No `profile_unit` table, and deliberately so.** A stored unit would be a second copy of the
person's history, and every existing Representation decision — keyed on canonical node id — would
dangle. Composing preserves reconstruction, confirmation, correction and positioning unchanged, and
a correction reaches every reading of a unit at once with no refresh path.

Experience / Projects / Skills / Achievements remain read-time projections. They were never canonical
stores; that assumption is not present in the code and must not arrive.

### Router is added

`@joby/router`: given an Opportunity, recommend the Representation to start from. Coverage is
normalised capability equality — the same rule Adaptation uses. It writes nothing, adapts nothing and
judges nobody.

**PCI influence is bounded below one covered capability**, so a learned prior can break a tie between
equally covering lenses and cannot promote one that covers the posting less. Observed coverage
outranks learned belief.

### Interview Intelligence is added as a seam

`@joby/translation/interview`: the stage vocabulary, the four input ports (Opportunity, Application,
Identity evidence, PCI priors) and **zero exported behaviour**.

What Prepare produces and what Rehearse evaluates are undecided product questions. A plausible
interface would harden the wrong answer, and a rehearsal that scores someone badly on a guess is a
real cost to a real person.

### PCI is added as an independent authority

`@joby/pci` replaces `packages/memory`. One `PciModel` interface spans the whole intended
progression — database-backed priors → statistical → clustering → individual → dedicated model — so a
consumer never learns which stage answered.

`NoLearnedPci` returns empty priors with zero support. That is the honest answer, not a placeholder:
at the Baseline there is almost nothing to learn from.

### Packages removed

`discovery`, `development`, `network` (superseded placeholders asserting module status the topology
does not grant) and `memory` (replaced by `pci`). `portal` remains, documented as infrastructure used
by Execution rather than a semantic authority.

## Consequences

- Translation holds no opportunity interpretation; a boundary test fails if one reappears.
- `@joby/opportunity` depends on neither Identity nor Translation.
- Identity exposes canonical truth as Profile Units without a schema migration.
- Router makes representation selection an inspectable decision instead of a caller's guess.
- 417 tests pass, up from 387: 19 restored mapping tests, 10 Profile Unit, 15 Router, 5 PCI.

## Deliberately not done

- **No storage migration for Profile Units.** Whether they become stored is left open by ADR 0031 and
  nothing yet requires it.
- **No Application implementation.** Its lifecycle states and resolved-evidence shape are genuine
  product decisions ADR 0031 lists as unresolved, and Interview Intelligence and PCI both wait on
  them.
- **No learning.** See above.
