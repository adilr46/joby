# Joby

A **Unified Career Intelligence Platform**. Person-centric, evidence-backed.

Initial user: **university placement students.**

## The model

**Identity** is the persistent person-side state Joby organises around: **Canonical Profile Units**
(one coherent professional unit — Context, Contribution, Capabilities, Consequence), **Persistent
Representations** (how the person generally wants that truth positioned) and **Stated Context**
(current preferences, constraints and intentions).

**Opportunity** owns the current external situation. **Router** picks the Representation to start
from. **Translation** — Adaptation, Execution and Interview Intelligence — computes the
opportunity-specific delta, carries it through external systems and handles interview stages.

**Application** owns the live interaction from intent through resolution and preserves its meaningful
history. **PCI** is an independent learned person × world authority: it learns only from resolved
Application evidence and returns priors to Router, Opportunity reasoning and Adaptation. Groupings
own no state; each authority mutates only its own, and ownership never flows backwards.

Every user starts in the **Baseline Identity State**: sparse Durable Identity, explicit direction,
minimal priors. Joby begins mostly knowing what the user tells and proves to it, then earns the right
to infer more over time.

Two timescales: the fast loop adapts the current Application; the slow loop adapts Joby's future
expectations. Mechanical execution noise is not learning input by default.

## Start here

| File | What it holds |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Engineering constitution — rules, boundaries, development loop |
| [`docs/JOBY_MEMORY.md`](docs/JOBY_MEMORY.md) | Durable product model, terminology, principles |
| [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) | What is happening right now |
| [`docs/architecture/adr/`](docs/architecture/adr/) | Consequential technical decisions and why |

## Shape

One modular core, four product umbrellas, several operational runtimes, one database.

```
CAREER WORKSPACE
├── Durable Identity
└── Identity Representation
        ↓
TRANSLATION LAYER
├── Opportunity
├── Adaptation
└── Execution
        ↓
APPLICATION
└── Application
        ↓
CAREER MEMORY
├── Memory
└── PCI

Operational composition: apps/web · apps/api · apps/worker
Data: one PostgreSQL database with per-module ownership
```

Modules expose public interfaces and never access one another's internals or tables. Runtime
boundaries may differ for operational reasons. Network-distributed services are introduced only
after a module demonstrates a concrete need and a new ADR records the evidence.

## Running it locally

Requires Node 22+, pnpm 10+, and Docker.

```bash
pnpm install
pnpm dev                                                # database + migrations + API + worker
```

`pnpm dev` needs Docker Desktop running. It starts PostgreSQL on localhost:5433, applies pending
migrations, then serves the API at http://localhost:3001 and starts the reconstruction worker. Stop
all local Joby processes with `Ctrl+C`. Use `pnpm typecheck` and `pnpm test` separately when needed.

PDF CV imports use Poppler's `pdftotext -layout` to read the PDF's existing text layer. Install
Poppler before running Joby (`scoop install poppler` on Windows, `brew install poppler` on macOS, or
`apt install poppler-utils` on Debian/Ubuntu). Scanned or image-only PDFs are rejected: export a
text-layer PDF instead.

Upload a CV and watch it reconstruct:

```bash
curl -X POST http://localhost:3001/identity/sources \
     -H 'content-type: text/plain' --data-binary @cv.txt      # → personId, sourceId, jobId
curl http://localhost:3001/identity/sources/$SOURCE_ID        # → the three lifecycle facts
curl http://localhost:3001/identity/proposals/$PROPOSAL_ID    # → the reviewable proposal
```

Set `OPENAI_API_KEY` for real extraction; without it, an offline deterministic extractor runs so the
whole flow still works.

## Status

**M1 — Identity, Releases 1–2 (UC01–UC07): done.** A CV is captured as an immutable professional
source, reconstructed asynchronously into a reviewable proposal, reviewed item by item, and confirmed
atomically into canonical Explicit State — which can then be read back and corrected directly. Every
confirmed fact traces to the passage of the source behind it.

**Release 3 (UC08–UC11) is done too**: the user connects GitHub and selects which repositories Joby
may look at, and further sources arrive as a **delta** against what is already held — so confirming
raises the resolution of existing facts instead of duplicating them. Education, Experience, Projects
and Skills are projected from that graph at read time, carrying the visibility of the sources behind
them.

**Release 4 (UC12) completes the milestone**: Durable Identity has a stable public module interface.
Other modules depend on a small contract from `@joby/identity` — nine capabilities, plus the three added for
Identity Representations; composition lives in `@joby/identity/runtime`; test doubles in
`@joby/identity/testing`. Persistence and internals are exported from none of them, and a test pins
the surface so widening it has to be deliberate.

**Identity Representations (ADRs 0014, 0015)** are the first thing built on top of that boundary:
persistent, reusable, non-canonical **positioning lenses** over Explicit State — "Markets", "Software
Engineering". Each lens holds what the person decided about their canonical facts — what to lead
with, what to set aside, how to word it — and projects the content from the canonical graph at read
time, so correcting a fact updates every lens over it and nothing can drift.

A lens renders as a **general, reusable CV** — one server-controlled LaTeX template, derived per
request and never stored — and is offered to Adaptation as an **optional positioning prior**.

It is a **prior, not a boundary**: hiding something in one removes nothing from the person's identity,
and makes nothing unavailable to a later opportunity that needs it. The prior carries preferences and
no evidence, so it cannot stand in for canonical truth.

The only route from model output into canonical state requires an explicit decision for **every**
proposed item. There is no "accept all", and two sources that disagree apply nothing until the user
picks a side.

M0 — Foundations is done: typed events on both delivery paths, transactional outbox, Postgres durable
queue, migrations, explicit transaction propagation.

Adaptation context, state composition and written-representation slices are implemented. Opportunity
capture and deterministic understanding are also implemented across the current capture and legacy
`translation/intelligence` partitions. Execution remains type-contract-only; Application and Career
Memory remain documentation-first seams. See [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) for the
verified slice-level status.
