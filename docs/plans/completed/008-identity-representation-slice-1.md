# 008 - Identity Representation, slice 1

## Goal

A user can create a named, reusable Identity Representation — "Markets" — give it a purpose, and
retrieve it grounded in their current Durable Identity, with the module boundary, seams and
architectural protections later slices need.

```text
V_i = P_i(E_t)                       persistent, reusable, non-canonical
A^C = T(E_t, L_t, C)                 temporary, opportunity-specific
```

## Domains affected

- **Identity** owns it. A third boundary inside the package — `src/representation/` — alongside
  Durable Identity and Adaptation. Not a domain, not a runtime, not part of Durable Identity.
- **Adaptation** gains a documented read seam: a representation is a starting *lens*, never source
  truth, never written back to, and never a narrowing of the broad canonical snapshot (ADR 0013).
- No other domain is touched. Nothing here is opportunity-, application- or Memory-facing.

## Doctrine check

- **Durable Identity stays canonical.** The representation stores a lens; content is projected from R
  at read time by the same function the Permanent Identity View uses.
- **Persistent but non-canonical.** Creating or reading one writes no R/X/L, moves no revision,
  records no correction or provenance, and publishes no event.
- **Cannot invent professional facts.** Content is a function of R, so an entry with no canonical node
  behind it is not something this code can produce.
- **Not Stated Context.** A lens is a view preference, not a claim about direction. X stays
  user-authored and untouched (ADR 0011).
- **Not Adapted State.** No opportunity, JD, requirements or company (ADRs 0012, 0013).
- **Projections are not stores** (ADR 0009) — upheld, because what persists is not the projection.

## Events

None. `IdentityUpdated` means a confirmed change to canonical Explicit State; choosing a lens is not
one. No event contract changed.

## Steps

1. ADR 0014: the third boundary, what persists, the two seams, the vocabulary split.
2. Migration `0006_identity_representation` — a lens table, with the absent columns documented.
3. `src/representation/`: model, repository (one table), service (read port, no canonical writes).
4. Contract, service composition and public entry point; three capabilities, deliberately widened.
5. HTTP routes for create / list / read.
6. Tests: module-boundary protections, behaviour, and the non-canonical guarantees.
7. Documentation: identity `CLAUDE.md`/README, adaptation seam, `JOBY_MEMORY.md`, root `CLAUDE.md`.
8. Verify: typecheck, full suite, and the real API runtime end to end.

## Verification

- `pnpm typecheck` clean; `pnpm test` — 170/170 against real Postgres, 15 of them new.
- Proven, not asserted: a representation follows a correction with no write of its own; empties when
  the facts are removed; two lenses over one identity show one corrected fact; every entry resolves
  to a canonical node id; an identity with nothing confirmed projects nothing.
- Pinned: the exact column list of `identity_representation`, the contract method list, the export
  surface, and the module's imports and table references.
- Run for real against `apps/api` + `apps/worker`: a representation created **before** any facts were
  confirmed showed the person's education and projects after confirmation — derivation at read time,
  through the real HTTP surface.

## Out of scope

Selection and hiding, ordering and emphasis, persistent wording edits, rendering, synchronisation,
application submission, opportunity-specific adaptation, and any AI application of the lens.
