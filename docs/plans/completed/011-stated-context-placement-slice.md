# 011 - Stated Context placement slice

## Goal

Make Stated Context a complete, executable Identity capability for the first placement slice:
persistent, explicit user-authored professional operating context that remains operative until the
person changes or removes it, and that Adaptation can retrieve and compare without gaining a write
path.

The slice completes the partially present implementation already in the repository and reconciles
repository memory with what is actually built.

## Domains affected

- **Identity / Durable Identity** — owns canonical Stated Context and its only mutation path.
- **Identity / Adaptation** — consumes a read-only current snapshot and derives informational
  `aligned | conflict | uncertain` comparisons.
- **Intelligence** — supplies attributed opportunity conditions through the existing consumer-side
  port; it gains no Identity write and no pursuit decision.
- **Execution, Memory, Development, Discovery, Network** — unchanged.

## Doctrine check

- Stated Context is user-authored current operating context, not reconstructed history (`R`), PCI
  (`L`), opportunity state (`C_opportunity`) or temporary Adapted State (`A^c`).
- Missing values remain absent and therefore unknown. No default means false, unrestricted or
  ineligible.
- The placement comparison vocabulary exists only for conditions a posting and person can both
  state. It carries no hard/soft level, weight, strength, priority, ranking or inferred constraint.
- Identity is the only canonical owner. Adaptation reads through a no-write port and re-derives on
  read, so it cannot maintain a second copy.
- A conflict is informational. `ConstraintConflict != ApplicationBlock`, always.
- A no-op is not a canonical state change and must not advance the Identity revision or emit
  `IdentityUpdated`.

## Events

No new event contract. A material user-authored Stated Context change emits the existing
`IdentityUpdated` transactionally with `changedFields: ['stated']`. An empty or idempotent request
emits nothing.

## Steps

1. Accept ADR 0017, extending ADR 0011 now that Adaptation is the real comparison consumer.
2. Harden Stated Context input and transition semantics: explicit actor, bounded normalized input,
   unique condition kinds, explicit clearing, optimistic concurrency and no-op handling.
3. Keep the Adaptation boundary read-only; preserve absent values as unknown and surface only
   aligned, conflicting or uncertain comparisons with `blocksApplication: false`.
4. Add unit and database-backed coverage for creation, partial update, removal, persistence,
   idempotence, invalid input, uncertainty, non-gating and Adaptation non-mutation.
5. Reconcile `JOBY_MEMORY.md`, domain documentation, the architecture index, roadmap and
   `CURRENT_STATE.md` with the completed capability.

## Verification

- `pnpm typecheck` clean.
- `pnpm db:migrate` against PostgreSQL: no pending migrations; all nine previously applied checksums
  accepted.
- `pnpm test` against PostgreSQL: **253/253 tests passed** across all 14 files.
- Public-surface inspection and architecture tests confirm Adaptation retains only its read-only
  `AdaptationIdentityReader`; it has no Stated Context mutation, repository or table access.
- Database-backed tests prove an idempotent command leaves both revision and outbox unchanged, and
  explicit removal returns fields to unknown/absent.
- Database-backed tests prove a later user change is visible to an existing Adaptation Context
  without refresh or copied state, while Adaptation leaves Explicit and Learned State untouched.

## Out of scope

Authentication/account-claim mechanics, inference from CVs or observed behaviour, preference or
constraint weighting, hard/soft levels, automated eligibility, filtering/ranking, application
gating, opportunity evaluation, PCI learning, Adapted State generation beyond Module 1, and UI.
