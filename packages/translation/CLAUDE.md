# Translation Layer — semantic boundary

Read with the root `CLAUDE.md` and [ADR 0029](../../docs/architecture/adr/0029-career-workspace-translation-application-career-memory.md).

The Translation Layer is a product umbrella, not a semantic owner or deployable service. It owns no
behaviour, tables or events. State belongs to Opportunity, Adaptation or Execution.

| Module | Owns | State |
|---|---|---|
| `intelligence/` | Legacy implementation partition of **Opportunity**: understand and evaluate person × opportunity | Understanding persistence + information seams |
| `adaptation/` | Decide how existing professional truth is represented for the opportunity | Implemented + type-only information seams |
| `execution/` | Carry intended applications through external systems and react to mechanical feedback | Type-only information seams; no behaviour |

Each implementation partition has its own public entry point. **A sibling is not an internal.** `adaptation/` may not import `intelligence/` or
`execution/`, and the reverse holds. Cross-module collaboration goes through public entry points and
a composition root, exactly as it does across the rest of Joby Core.

## Ownership rule

Information may cross module boundaries; only the semantic owner mutates its own state. Adaptation
consumes Opportunity Intelligence through its own port and never recomputes the
relationship. Application will supply intent to Execution and record confirmed facts through public
capabilities; Execution will not write Application records directly.

The fast loop uses three named information seams (retained by ADR 0029): Opportunity Intelligence,
Application Intent and Fast Feedback. Each producer and consumer owns its local shape; siblings do
not import one another. Purely mechanical feedback is private to Execution.

## Downstream rule (ADR 0027)

The Translation Layer participates in the fast loop and learns nothing. Application resolves and preserves the meaningful
Translation state actually used; **Career Memory consumes only that resolved history**, never live
Translation state, and never by reading a Translation table. Mechanical execution detail is excluded
by default — being logged is not what makes something meaningful.

PCI returns as a **prior read through Durable Identity's public boundary**, never as a Career Memory
write into Opportunity or Adaptation, and no module here writes PCI. Do not add a publish path, a
learning hook or an outcome-attribution algorithm to any of the three modules; that is Career
Memory's process, and it does not exist yet.
