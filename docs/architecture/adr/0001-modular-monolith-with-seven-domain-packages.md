# ADR 0001 — Modular Monolith with Seven Domain Packages

- **Status:** Superseded by [ADR 0023](0023-one-modular-core-with-strongly-owned-modules.md)
- **Date:** 2026-08-12
- **Domains affected:** Cross-cutting

> **Superseded (2026-08-16).** ADR 0023 retains the modularity, public-interface and
> delayed-distribution rules, but replaces this ADR's seven-domain package topology with Joby Core's
> seven strongly owned modules.

> **Extended, not superseded (2026-08-12).** The seven packages, three runtimes, and the boundary
> rules below are unchanged. What changed is what some of those domains *own*: ADR 0005 introduces
> Durable Identity and sharpens the split between Identity (person-state), Memory (the learning
> process), and Development (interpretation of change); ADR 0007 places opportunity and trajectory
> evaluation inside Intelligence rather than in a new domain. The "Owns" column in the table below
> reflects the original framing — `docs/JOBY_MEMORY.md` §12 is current.

## Context

Joby has seven conceptual domains: Discovery, Intelligence, Identity, Network, Execution,
Development, Memory. They differ sharply in depth — Execution and Memory are very deep, Network and
Development are shallow — and that distribution will keep shifting as the product is built out.

Conceptual separation is genuinely required: the domains own different data, have different rules,
and must not casually write into each other. Operational separation is not required. There is one
initial user segment (university placement students), no independent scaling pressure on any single
domain, and no team-boundary reason to split deployments.

Deploying seven services now would buy nothing and cost distributed transactions, network failure
modes, seven deployment pipelines, and cross-service refactors every time a boundary is found to be
slightly wrong — which, this early, it will be.

## Decision

Seven domain **packages** under `packages/`, one per domain. Three runtimes under `apps/`:

- `apps/web` — the web application
- `apps/api` — the main backend, which may depend on several domain packages directly
- `apps/worker` — background processing for longer-running AI and extraction work

Boundaries are enforced in code and review, not by the network:

- Each domain owns its behaviour and its data.
- Cross-domain access goes through the owning package's public entry point (`src/index.ts`). Internals are off limits.
- No direct cross-domain writes.
- No HTTP or RPC calls between domains inside the same runtime. Imitating microservices without their benefits is strictly worse than a monolith.
- Each domain package gets a local `CLAUDE.md` carrying its rules, added as the domain is built out.

A browser/portal worker is **not** created yet.

## Consequences

- Refactoring a boundary is a code change, not a migration. This is the main benefit early, when boundaries are least certain.
- One deployment, one test run, one place to debug a request end to end.
- Boundary discipline depends on review. A domain *can* import another's internals; nothing physically stops it. This is the accepted cost, and lint rules on import paths should be added once tooling exists.
- Extracting a domain into its own runtime later requires replacing direct calls with a transport — mitigated by the public-API rule and by ADR 0002's event contracts.

## Alternatives Considered

- **Seven services from day one.** Rejected: distributed complexity with no operational driver, and it hardens boundaries before they are understood.
- **A single flat application, no domain packages.** Rejected: the conceptual boundaries are real and load-bearing; without package structure they erode immediately.
- **Two runtimes (no worker).** Rejected: CV extraction, evidence generation, and company research are inherently long-running and must not sit in a request path.

## Revisit When

A domain has a genuinely different scaling, availability, or isolation requirement — or a team
boundary forms around one. Then, and only then, extract that single domain and record it in a new ADR.
