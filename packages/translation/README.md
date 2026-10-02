# `@joby/translation` — current implementation of the Translation Layer

> **The user owns intent. Joby owns translation and administration.**

The Translation Layer is the product umbrella that turns Career Workspace truth and an opportunity
into an application carried through an external system. Its semantic authorities are:

```text
TRANSLATION LAYER
├── Opportunity    evidence, understanding and person mapping
├── Adaptation     temporary opportunity-specific interpretation (implemented)
└── Execution      carrying intent through external systems     (type-only seams — no behaviour)
```

See [ADR 0029](../../docs/architecture/adr/0029-career-workspace-translation-application-career-memory.md).

The package layout has not yet converged on that semantic shape: Opportunity capture is in
`@joby/opportunity`, while understanding is in the legacy `@joby/translation/intelligence` entry
point. Together they implement one Opportunity authority. This is a documented migration mismatch,
not permission for either partition to bypass the other's public capability.

## What Translation is not

- **Not a service.** In active architecture documentation `service` means an independently
  distributed runtime boundary. The Translation Layer is not distributed, has no transport and adds
  no network call. Nothing here may introduce one.
- **Not a facade.** This package has **no root export**. There is no `@joby/translation`; there is
  `@joby/translation/adaptation`, legacy `/intelligence` and `/execution`. A root export would let a
  consumer reach whichever module happened to be re-exported, which is the boundary dissolving
  rather than holding.
- **Not a shared interior.** The implementation partitions are as separate from each other as they are from
  Opportunity or Application. No sibling imports a sibling; each is reached through its own public
  entry point or not at all. `tests/translation-boundary.test.ts` enforces this.
- **Not an owner of state.** The Translation Layer owns no tables and publishes no events. Semantic
  owners mutate only their own state.

## Current state

**Adaptation moved here verbatim** from `packages/identity/src/adaptation`. Its behaviour, public
surface, tables and tests are unchanged — Adaptation was already a peer semantic owner
whose colocation inside `packages/identity` was layout rather than ownership, and this is that
layout catching up.

Opportunity understanding currently persists under an `intelligence_*` table and legacy entry point.
ADR 0029 classifies this as an implementation-layout mismatch; it does not authorize a destructive
rename or package move. Execution has only type-level contracts until a vertical use case needs it.

## Fast feedback information seams

```text
Opportunity Intelligence: Opportunity → Adaptation
Application Intent:        Adaptation → Execution
Fast Feedback:             Execution → Opportunity and/or Adaptation
```

These are type-only public contracts (ADR 0026). App composition roots route the information; no
sibling imports another and no receiver gains authority to mutate the producer's state. Mechanical
portal feedback remains internal to Execution.

## Where Translation state goes afterwards

The Translation Layer is the **fast** loop. Nothing here learns:

```text
Opportunity → Adaptation → Execution → Application → Career Memory → PCI
                                                                       └──→ future priors
```

- **Application resolves and preserves** the meaningful Translation state actually used — the
  Opportunity Intelligence relied upon, the Application Intent and representation state acted upon,
  and the final Execution/submission state. That snapshot is Application's; preserving it gives
  Application no authority to mutate anything inside Translation.
- **Career Memory never reads live Translation state**, and no module here publishes to it. Only
  history Application has already resolved may enter the slow loop.
- **Mechanical execution detail stays inside Execution** and is excluded from resolved history by
  default. Being logged does not make something learning input.
- **PCI comes back as a prior, read through Durable Identity's public boundary** — the same way
  Adaptation already reads `E`, `X`, `L` and a representation prior. Career Memory writes nothing
  into Opportunity or Adaptation, and neither module writes PCI.

None of that is implemented. It is recorded here so the first slice that resolves an application
does not invent a shortcut from live Translation state into learning.
