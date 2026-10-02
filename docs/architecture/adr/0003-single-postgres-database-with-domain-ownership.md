# ADR 0003 — Single PostgreSQL Database with Domain Ownership

- **Status:** Accepted — terminology extended by [ADR 0023](0023-one-modular-core-with-strongly-owned-modules.md)
- **Date:** 2026-08-12
- **Domains affected:** Cross-cutting

> **Terminology extension (2026-08-16).** ADR 0023 replaces the old domain topology with Joby Core
> modules. Read this ADR's ownership rules as module ownership; its one-database decision is unchanged.

## Context

Joby is person-centric: nearly every meaningful query spans domains around a single person. Canonical
identity, evidence, application records, and outcomes must stay consistent with each other — a
representation that cites evidence which no longer exists is a doctrine violation, not a stale cache.

A database per domain would make cross-domain consistency a distributed problem and cross-domain
reads a join across services, in exchange for isolation nobody currently needs.

But a shared database with no ownership rules decays fast: one domain reads another's tables, then
writes them, and the boundaries from ADR 0001 become decorative.

## Decision

**One PostgreSQL database.** Ownership is explicit and enforced:

- Every table has exactly one owning domain, declared where it is defined.
- A domain may write **only** its own tables. No exceptions, including "just this one field".
- A domain may not read another domain's tables directly; it goes through the owning package's public API, or reacts to an event.
- Migrations live in `packages/database`, but each migration names the domain that owns the tables it touches.
- Foreign keys across domain boundaries are allowed pointing at another domain's **identifiers**, which are part of its public contract. They must not create a write dependency.
- Durable career memory and temporary session state are stored separately. Session state must never be written into memory-owned tables.

Transactions may span domains within one runtime. This is a deliberate benefit of the single database
and one of the main reasons for it.

## Consequences

- Consistency is free where the product needs it most, and person-scoped queries stay simple.
- One migration history, one backup, one connection pool.
- Ownership is a review-enforced convention. Schema-level enforcement (a PostgreSQL schema and role per domain) is available later if discipline slips, without changing the application.
- Extracting a domain later requires separating its tables — the ownership rule is what keeps that possible.

## Alternatives Considered

- **Database per domain.** Rejected: explicitly out of scope, and it converts every person-scoped read into a distributed query for isolation with no current value.
- **Separate PostgreSQL schema per domain from day one.** Deferred, not rejected. It is the natural first hardening step if the ownership convention proves insufficient.
- **Shared database, no ownership rules.** Rejected: guarantees boundary erosion.

## Revisit When

Ownership is violated in review more than occasionally (→ move to schema-per-domain with roles), or a
domain is extracted into its own runtime (→ that domain's tables move with it).
