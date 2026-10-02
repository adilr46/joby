# Architecture

Decisions and their reasoning live in [`adr/`](adr/). The authoritative current model is
[ADR 0031](adr/0031-identity-router-translation-application-pci.md); implementation rules live in the
root [`CLAUDE.md`](../../CLAUDE.md).

## Canonical architecture

```text
IDENTITY SERVICE
├── Canonical Profile Units
├── Persistent Representations
└── Stated Context

OPPORTUNITY  →  ROUTER  →  TRANSLATION SERVICE  →  APPLICATION  →  resolved evidence  →  PCI
                           ├── Adaptation
                           ├── Execution
                           └── Interview Intelligence
```

| Authority | Owns |
|---|---|
| **Identity** | Persistent person-side state: Canonical Profile Units, Persistent Representations, Stated Context |
| **Opportunity** | The current external professional situation: evidence, records, understanding |
| **Router** | Selecting the best existing Representation as the starting prior for an Opportunity |
| **Adaptation** | The opportunity-specific delta from the selected Representation |
| **Execution** | Realizing that delta externally: submission, portal interaction, mechanical feedback |
| **Interview Intelligence** | Understand → Prepare → Rehearse for interview stages |
| **Application** | The live lifecycle and durable record of what actually happened |
| **PCI** | The learned person × world model, and the priors it returns |

A **Profile Unit** is one coherent professional unit — Context, Contribution, Capabilities,
Consequence — and is canonical truth. A **Representation** positions over that truth: include,
prioritize, emphasize, order, frame — units or their pieces, without changing what is true.
**Stated Context** is current user-authored preferences, constraints and intentions.

Semantic groupings are not packages, database owners or deployment boundaries. **Service** means an
independently distributed runtime; "Identity Service" and "Translation Service" are semantic
groupings, not deployment claims. Information may cross a boundary; only the semantic owner mutates
its state, and modules never access one another's tables.

## Fast and slow loops

```text
FAST — adapts the current Application
Opportunity → Router → Adaptation / Execution / Interview Intelligence → current Application

SLOW — adapts Joby's future expectations
resolved Application evidence → PCI → priors for Router, Opportunity reasoning and Adaptation
```

Application preserves the Opportunity understanding relied upon, the Representation and Adaptation
decisions acted on, final submission state and later factual outcomes. Mechanical retries, selectors,
captcha checkpoints and transient portal failures stay inside Execution and are not learning input by
default.

**Information may flow recursively; semantic ownership must not silently flow backwards.** PCI
returns priors, never truth, and rewrites nothing upstream — not Identity, not Opportunity, not
Adaptation, not historical Applications.

## Identity doctrine

Identity owns canonical professional truth and Stated Context. **PCI is not part of Identity**
(ADRs 0030, 0031): it is an independent learned person × world authority, and its two signal
families stay distinct — `user preference ≠ external effectiveness`.

**Retrieval is demand-driven.** Representation is the normal person-side prior; canonical evidence is
queried selectively when contextual reasoning identifies a requirement.
`Identity authority ≠ mandatory full-state retrieval`, and
`HiddenInRepresentation ≠ UnavailableToAdaptation`.

Every user begins in the Baseline Identity State: sparse confirmed truth, explicit direction and
minimal priors. Claims remain proportionate to evidence. See [`docs/JOBY_MEMORY.md`](../JOBY_MEMORY.md).

## Implementation alignment

Brought to this shape by [ADR 0032](adr/0032-aligning-the-codebase-to-the-canonical-topology.md).

| Authority | Package | State |
|---|---|---|
| Identity | `@joby/identity` | Implemented. Profile Units are **composed** from `E` at read time, not stored |
| Opportunity | `@joby/opportunity` | Implemented — capture and understanding |
| Router | `@joby/router` | Implemented, wired at `GET /routing` |
| Adaptation | `@joby/translation/adaptation` | Implemented, including person × opportunity mapping |
| Execution | `@joby/translation/execution` | Application Session (ADR 0034), page surface interpretation (ADR 0035), surface resolution and deterministic action execution (ADR 0036), and the recursive execution loop (ADR 0037) implemented; submission orchestration, a real `JobyQueryPort` adapter and a browser-driving loop not yet built |
| Interview Intelligence | `@joby/translation/interview` | Seam — stages and ports, no behaviour |
| Application | `@joby/application` | Implemented — `Oₙ = (Pₙ, Wₙ, Rₙ, Aₙ, Xₙ, Iₙ, Yₙ)` (ADR 0033) |
| PCI | `@joby/pci` | Contract and progression seam; Application now produces its input, **no learning yet and nothing wired to call it** |

`packages/portal` is infrastructure used by Execution, not a semantic authority. `packages/shared`
holds cross-cutting primitives.

## Event delivery

Typed domain events may be handled inline or persisted transactionally through the outbox and a
Postgres-backed durable queue. Event contracts do not name their delivery transport. Deferrable
handlers are at-least-once and must be idempotent.

Application follows the state-first publication rule from
[ADR 0039](adr/0039-application-state-first-event-publication.md): Application services write
authoritative Application rows first, record the outbox event in the same transaction, and publish
only facts derived from that committed state. Handlers may react downstream, but they do not decide
or mutate Application truth.

This mechanism does not grant cross-owner mutation authority. The event owner namespace in
`packages/events` predates ADR 0031 and is not a list of canonical semantic authorities.

Decided in [ADR 0002](adr/0002-in-process-typed-event-dispatcher.md) and
[ADR 0004](adr/0004-transactional-outbox-and-postgres-durable-queue.md), with Application publication
clarified by [ADR 0039](adr/0039-application-state-first-event-publication.md). See
[`docs/CURRENT_STATE.md`](../CURRENT_STATE.md) for verified implementation status.
