# 007 - Adaptation current-decision alignment

## Goal

Bring repository truth into line with the locked Adaptation decisions of 2026-08-15 — Identity read
boundary, Adapted State across the application cycle, and the governance of later-stage results and
insights — without implementing any Adaptation behaviour.

## Domains affected

- **Identity / Adaptation** — unchanged ownership. Its authoritative state now explicitly includes
  representation state and **stage-specific contextual interpretation**, and lasts for the active
  application cycle rather than one task. It reads a **broad canonical snapshot**; contextual
  relevance selection stays inside Adaptation.
- **Intelligence** — unchanged and outside Identity. Supplies structured, attributed opportunity
  understanding through the existing consumer seam, and must not choose which of the person's
  evidence is best.
- **Execution** — owns the **Application Record as the durable temporal spine** of the cycle.
  Submitted CVs, answers and communications become immutable historical reality there. A new
  fact-only return seam lets recorded results become Adapted State inputs.
- **Memory** — unchanged. An accepted stage insight is still not evidence, and the Adaptation →
  Memory handoff stays undefined.
- **Discovery, Development, Network** — untouched.

## Doctrine check

- `A^c = T(R, X, L, C)` still reads and mutates nothing durable. A broad read widens scope, not
  authority.
- User edits to wording, emphasis, positioning, ordering, inclusion/exclusion or interpretation update
  the current Adapted State and imply no `E_t -> E_t+1` or `L_t -> L_t+1`.
- Constraint conflicts still inform and never gate.
- Nothing in Adaptation scores, evaluates, gates, executes a portal, owns a lifecycle or writes PCI.
- The separation the whole pass exists to protect: Application Record = what happened; Adapted State =
  current contextual response; Memory / PCI = what accumulated resolved history justifies learning.

## Events

No event contract changed. Creating, editing or enriching Adapted State remains a non-event.
Historically this plan left `ApplicationSubmitted` with Execution.

> Current architecture note: ADR 0039 later moved `ApplicationSubmitted` publication to Application,
> after Application records submitted reality.

## Steps

1. Write ADR 0013 for the genuinely new architecture: read boundary, cycle-long Adapted State, the
   `Application Record -> Adapted State` fact seam, and stage-insight governance.
2. Mark ADR 0012 *extended* with a dated forward note; leave its decision text untouched.
3. Extend the product doctrine with the application-cycle model, user-edit semantics, results vs
   insights, and a deliberately-deferred list.
4. Align `JOBY_MEMORY.md`, root `CLAUDE.md`, `packages/identity/CLAUDE.md`, the Adaptation module
   README and the Identity/Execution/Intelligence/Memory domain docs.
5. Extend `ai-translation` with the broad read, edit-the-state semantics and the stage-insight gate.
6. Tighten the Adaptation architecture test's forbidden-import list to cover composition entry points.
7. Update repository memory and current state.

## Verification

- `pnpm typecheck` clean; `pnpm test` — 153/153 against real Postgres.
- No migration, route, worker handler, event, model call or use-case method was added.
- Every deferred decision is named as deferred in the ADR, the doctrine, the module README and the
  Identity stop conditions — and none is resolved in code.

## Out of scope

UC01–UC12 behaviour, post-application use-case decomposition, persistence, refresh triggers, the
Memory handoff, and any Adapted State retention scheme.
