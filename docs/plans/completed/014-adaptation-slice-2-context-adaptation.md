# 014 - Adaptation Slice 2: context adaptation (UC05–UC08)

## Goal

Adapt the person's professional material to one opportunity, **starting from the lens they maintain**
rather than re-solving their whole identity per posting.

```text
P_i(E_t) -> Assess -> Recover(E_t, C) [optional] -> A^C
```

## Domains affected

- **Identity / Adaptation** — Module 2, behind `src/adaptation/`.
- **Identity / Identity Representation** — read through the public boundary as the default surface;
  never written.
- **Identity / Durable Identity** — the fallback reservoir, read-only.
- Intelligence, Execution, Memory, Discovery, Development — untouched.

## Doctrine check

- **Representation-first.** `recoveryUsed` is reported so "the lens covered it" is observable.
- **Recovery is gap-driven, capped and canonical.** Irrelevant evidence is never pulled in.
- **Relevance is canonical capability equality.** No synonyms, no similarity, no inference. An
  unevidenced ask is reported as unevidenced.
- **Assessment is representational, not evaluative.** No score, rank, fit or pursue verdict.
- **Nothing mutated:** not Durable Identity, not the lens, not Learned State; no event. Recovering
  what a lens hides does not un-hide it.
- **Nothing dropped:** an element this posting ignores stays in `A^C`, ordered behind what it asks
  about.
- **Conditions inform, never gate.** A location conflict does not stop composition.
- **Nothing rendered.** No CV, answer or narrative — that is Module 3.

## Events

None.

## Steps

1. ADR 0019.
2. Surface each activity's canonical `Capability` components through the read-time projection and the
   positioned entry — canonical data, surfaced rather than derived.
3. `adapted-state.ts` — the `A^C` model, assessment and element types.
4. `adaptation.ts` — UC06 assess, UC07 recover, UC08 compose, all pure.
5. `getRepresentation` on the reader port; `composeAdaptedState` on the service; the
   `/adaptation/contexts/:id/adapted-state` route.
6. Tests: 16 unit over the pure functions, 8 new integration.

## Verification

- `pnpm typecheck` clean; `pnpm test` — 278/278 against real Postgres (was 254).
- Both paths proven end to end: a Python role composed from the lens alone (`recoveryUsed: false`),
  and a derivatives role recovering the confirmed options pricer the Markets lens hides.
- Also proven: recovered evidence is canonical and traceable to a confirmed node; the degree and the
  hidden pricer are not scooped up by an unrelated posting; an unevidenced ask is named rather than
  filled; the lens's revision, decisions and hidden entry are unchanged afterwards; Explicit State,
  Learned State and the outbox are untouched; `adaptation_context` remains the only table.

## Out of scope

Module 3 (CV, answers, narratives), user edits to `A^C` and therefore its persistence, opportunity
scoring or evaluation, and the ADR 0013 §10 deferrals.
