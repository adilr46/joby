# 013 - Adaptation Slice 1: context interpretation (UC01–UC04)

## Goal

The first Adaptation behaviour. A caller supplies an opportunity and receives a structured, readable
Adaptation Context: what the role asks, what the person has said about their situation, and how the
two intersect — before any professional adaptation happens.

```text
P_i(E_t) + C_opportunity + C_user  ->  Adaptation Context
```

## Domains affected

- **Identity / Adaptation** — Module 1, behind `src/adaptation/`, exported from
  `@joby/identity/adaptation`.
- **Identity / Durable Identity** — read-only, through the public contract. Stated Context supplies
  `C_user`; the representation prior is optional.
- **Intelligence** — the consumer-side port it will implement. No code, no import, no cycle.
- **Discovery** — the opportunity, by reference only.
- **Execution, Memory, Development** — untouched.

## Doctrine check

- **References and revisions, never copies.** `adaptation_context` has no role, company, requirement
  or condition column, and everything is re-derived on read.
- **Adaptation never reads a job description.** Understanding arrives through the port or the context
  does not exist. The composition-root stand-in rejects raw posting text.
- **`C_user = Retrieve(X_t)`, never `Infer(CurrentMoment)`.** The reader port has no write method, so
  Adaptation cannot maintain conditions even by accident.
- **Missing conditions stay unknown.** Neither acceptance nor a problem is assumed.
- **`ConstraintConflict ≠ ApplicationBlock`.** Nothing filters, disables, ranks or gates.
- **No scoring, ranking or fit judgement.** Conditions only; capabilities are carried, not compared.
- **No Adapted State, no evidence selection.** That is Module 2, and none of it exists.

## Events

None. Assembling a context is not a durable fact about the person.

## Steps

1. ADR 0018.
2. Migration `0009_adaptation_context` — four references and two revisions.
3. `ports.ts` — the consumer-side opportunity port and the read-only Identity reader.
4. `interpretation.ts` — UC02, UC03 and UC04 as pure functions.
5. `service.ts` + `factory.ts` — UC01, and the reader adapted from the Identity contract.
6. `@joby/identity/adaptation` entry point; `FakeOpportunityUnderstandingPort` in `/testing`.
7. `apps/api`: the composition root, the Intelligence stand-in, and the routes.
8. Tests: 18 unit over the pure comparison, 18 integration, 4 architecture.

## Verification

- `pnpm typecheck` clean; `pnpm test` — 254/254 against real Postgres.
- Proven, not asserted: the context writes nothing canonical and publishes no event; it cannot write
  the lens it was given; a lens belonging to another person is refused; an un-understood opportunity
  is refused rather than parsed; one scope per opportunity; and an edited condition changes the same
  context's reading with no refresh.
- Architecture tests pin that the module queries only `adaptation_context`, imports no adjacent
  domain or Identity write surface, and contains no scoring or gating vocabulary.
- Run for real through `apps/api` + `apps/worker`: raw JD text refused (422), structured
  understanding accepted, and a context created **before** the person stated anything, then re-read
  after — same context id, three aligned, one conflict with the person's note, one uncertain plus the
  posting's own uncertainty, one neutral, free-text constraint carried, `blocksApplication: false`,
  and no professional evidence anywhere in the payload.

## Out of scope

Module 2 (evidence selection, interpretation, Adapted State composition), Module 3 (rendering),
Intelligence itself, opportunity scoring or evaluation of any kind, and the ADR 0013 §10 deferrals —
retention, versioning, refresh triggers, the Memory handoff.
