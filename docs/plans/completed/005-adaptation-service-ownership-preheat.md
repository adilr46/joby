# 005 - Adaptation Service ownership and architectural pre-heating

## Goal

Place the Adaptation Service inside Joby's existing architecture and leave the repository ready for
Adaptation Slice 1 without implementing any Adaptation behaviour.

## Domains affected

- **Identity owns Adaptation** as a separate fast-loop subservice because Identity's verb is
  *Represent*. This does not widen Durable Identity: `R`, `X` and `L` remain authoritative person-state,
  while Adapted State is temporary.
- **Intelligence** remains authoritative for opportunity, company and role understanding and for
  Opportunity Evaluation. It supplies a versioned opportunity-context view; Adaptation neither
  normalises the canonical opportunity nor scores it.
- **Execution** remains authoritative for the Application Workspace, application lifecycle, portal
  execution and immutable Application Records. It consumes Adaptation output and freezes what was
  actually submitted.
- **Discovery** remains authoritative for opportunity sourcing/import/deduplication.
- **Memory** remains authoritative for the slower learning process. Adaptation edits and drafts are
  not Records and do not update PCI.

## Doctrine check

- `A^c = T(R, X, L, C)` reads four inputs and mutates none of them.
- Adaptation is in the Fast Operational Loop and owns only temporary, context-bounded artifacts.
- Every contextual claim remains traceable to canonical Identity provenance.
- Constraint conflicts inform; they never filter, gate or decide pursuit.
- User edits remain operational unless the user separately invokes an Identity correction or stated-
  context write path.
- Adapted State is upstream of representations and is not a CV, profile or durable identity component.

## Events

No event contract changes. Creating or editing temporary Adapted State is not a meaningful durable
fact. Historically this plan left `ApplicationSubmitted` with Execution when a representation is
actually submitted.

> Current architecture note: ADR 0039 later moved `ApplicationSubmitted` publication to Application,
> after Application records submitted reality.

## Steps

1. Record the ownership and dependency decision in an accepted ADR.
2. Establish the internal `packages/identity/src/adaptation/` module boundary with no behaviour.
3. Document authoritative state, consumed state, inputs, outputs, seams and the hard negative boundary.
4. Align Identity, Intelligence, Execution, Discovery and Memory documentation.
5. Correct the `ai-translation` workflow so it consumes Identity provenance rather than requiring a
   Memory EvidenceItem and does not imply that representation approval writes Explicit State.
6. Update repository memory and current state.
7. Run architecture searches, typecheck and tests.

## Verification

- No eighth domain, new runtime, migration, route, worker handler, event or Adaptation behaviour exists.
- Documentation names one owner for every authoritative input/output and one dependency direction for
  every seam.
- Searches find no claim that Adaptation owns opportunity evaluation, application lifecycle, Durable
  Identity writes or PCI learning.
- `pnpm typecheck` and `pnpm test` pass.

## Out of scope

All twelve Adaptation use cases: context interpretation, conflict detection, relevance selection,
evidence interpretation, Adapted State composition, contextual CVs, answers, narratives,
representation editing, scoring and execution. Slice 1 is not started by this plan.
