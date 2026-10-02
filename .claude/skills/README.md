# Claude Code Skills

**Recurring Joby workflows** — the small number of things Joby does over and over, each with
doctrine attached. Not chronological coding steps.

Use only the skills relevant to the task at hand.

## The seven

| Skill | Workflow | Loop |
|---|---|---|
| `vertical-slice` | The default. Building one coherent capability end to end. Other skills compose inside it. | — |
| `identity-evidence` | Professional experience → Durable Identity Explicit State → reusable EvidenceItems → truthful representation | — |
| `ai-translation` | Durable Identity + context → structured output → evidence → uncertainty → human gate → persistence → evaluation | Fast |
| `opportunity-ingestion` | External source → normalized Joby Opportunity (feeds Intelligence's evaluation) | Fast |
| `portal-integration` | Driving an external application system, and capturing what was actually submitted | Fast |
| `event-workflow` | Adding or changing a meaningful domain event | — |
| `career-memory-learning` | Meaningful Records → evidence aggregation → interpretation → justified PCI / Learned State update | **Slow** |

**Fast** skills operate in the Fast Operational Loop: they read Durable Identity, compose a **Temporary
Workspace Context**, act, and produce Records. They may change temporary state freely and must not
casually rewrite Learned State.
**Slow** is the Slower Learning Loop: it consumes Records and updates PCI only when evidence justifies
it (ADR 0006). Records are the only interface between them.

No skill exists for trajectory evaluation, and none for Workspace — Workspace is a user-facing concept
realised by whichever domain owns the task (ADR 0008), not a workflow.

Every skill must work at the **Baseline Identity State**, where the person has sparse Explicit State,
a stated direction, and almost no PCI. Claims stay proportionate to evidence.

## Composition

Skills compose. Building Evidence Inventory might use:

```
vertical-slice → identity-evidence → ai-translation → event-workflow
```

`vertical-slice` is the outer workflow for most feature work; the others carry the doctrine for the
specific kind of work inside it.

## Not skills

**ORIENT, PLAN, BUILD, VERIFY, CHALLENGE, INTEGRATE, CONSOLIDATE** are phases of the development loop
in root `CLAUDE.md`, not separate skills. Neither is memory consolidation or review — they are steps
inside `vertical-slice`. A skill exists when there is a recurring *Joby* workflow with doctrine
attached, not for each stage of doing work.

Skills are *what* workflow is being followed. Agents are *how* it gets built — see `../agents/`.
