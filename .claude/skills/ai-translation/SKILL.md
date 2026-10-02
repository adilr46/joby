---
name: ai-translation
description: Joby's Fast Operational Loop translation workflows — evidence selection, CV adaptation, application answers, voice adaptation, opportunity interpretation, interview intelligence. Use whenever a model turns Durable Identity plus context into something a person will rely on or send.
---

# AI Translation

Translation answers: **given this person's Durable Identity and the current context, how should Joby
help represent or act on that identity now?** Selecting which evidence matters for a role. Adapting a
CV. Drafting an application answer. Matching the person's voice. Interpreting an opportunity. Making
sense of an interview.

> **The user owns intent. Joby owns translation and administration.**

Joby decides how to phrase, arrange, select and format. It does not decide what the person wants,
what they will claim about themselves, or what they are willing to disclose. When a task starts to
require deciding one of those, that is the point to ask, not to infer.

For contextual representation, Translation is implemented by the **Identity-owned Adaptation
Service** behind `packages/identity/src/adaptation/` (ADRs 0012, 0013). It is a separate fast-loop
service boundary, not part of Durable Identity state. Intelligence retains opportunity understanding
and evaluation; Execution retains action and the Application Record.

## This is a Fast Operational Loop skill

```
Durable Identityₜ + current context → Temporary Workspace → Translation / Evaluation / Action → meaningful Record
```

It reads Durable Identity and generates contextual output. It runs at operational speed, and that
speed is exactly why it is fenced (ADR 0006):

- It operates primarily inside **Temporary Workspace Contexts** and may change their state freely.
- It may read the **Permanent Workspace** but must not write person-state into it — that layer is a view over Durable Identity, not a store (ADR 0008).
- It **must not silently modify Explicit State** — that needs the human gate below.
- It **must not directly rewrite Learned State / PCI.** A live translation may produce evidence; it does not get to conclude anything about the person. Learning is the `career-memory-learning` skill, on the slow loop.

**Translation must not mutate Explicit State merely because a contextual representation changed.**

## The pipeline

Every translation workflow has the same shape. Skipping a stage is how these fail.

```
source truth → context → structured output → evidence/provenance → uncertainty
             → human gate → persistence policy → evaluation
```

### 1. Source truth

> **Aᶜ = T(R, X, L, C, Pᵢ)** — the four canonical inputs (ADR 0011), plus an optional Identity
> Representation prior (ADR 0016)

Translation reads exactly four things: **Reconstructed State** (what they did), **Stated Context**
(direction, preferences, constraints — what they said), **Learned State/PCI** as a baseline for
voice and preference, and the current opportunity/task context **C**. Anything read that is not one
of the four is out of bounds; **anything written to R, X or L is a violation.**

The Identity read is a **broad canonical snapshot**, not a role-filtered subset (ADR 0013). Deciding
what matters here is *your* job, not Identity's — but a broad read is a wider view, never wider
authority, and private-source visibility travels with the facts into every rendering.

A selected **Identity Representation prior** `Pᵢ` may tell you how the person generally positions
themselves in this domain — what they lead with, what they set aside, their own reusable wording. It
is a **prior, not a filter**: it carries preferences keyed by canonical node id and no evidence, so
you still read Durable Identity for the facts, and something the lens hides is still yours to promote
when this role makes it valuable. Doing so changes the opportunity's output, never the lens.

Never start from another generated artefact: translating a translation compounds drift, and by the
third hop nobody can trace a claim.

**Constraint conflicts inform, never block.** If C conflicts with a stated constraint, name the
conflict in the output. Do not filter the opportunity away, and do not disable the action.

Read what's actually there. Thin evidence is a real answer; work with it rather than filling gaps.

### 2. Context

What is this for: which opportunity, which audience, which question, which constraints. Context
determines **selection and emphasis**. It never licenses new facts. If the role wants leadership and
the evidence shows none, the honest output says so.

### 3. Structured output

Schema first — it is the contract. Validate every response; handle failure as a normal path. Prefer
several narrow calls with checkable outputs over one call that does everything. Refusal and
"insufficient evidence" are valid outputs and must be designed for, not treated as errors.

### 4. Evidence and provenance

**Every claim resolves to atomic canonical provenance behind a confirmed Identity fact.** Not a
general gesture at background — a specific fact and source reference. A Memory EvidenceItem may also
support a claim when one exists, but Adaptation neither requires nor creates one. A claim without
traceable support does not ship; the output is a gap.

Carry provenance forward: what produced this, from what, when, with what context. Output that
arrives without knowing where it came from can't be confirmed, and unconfirmable output is useless.

### 5. Uncertainty

Uncertainty is a **field**, not hedging prose. Hedged prose gets read as fact and pasted into an
application.

Surface it; never average it away. Where the model is unsure, the user needs to know precisely
where — not a single confidence number for a whole document. `Observed`, `Inferred` and
`Hypothesized` stay distinct through the whole pipeline, including in the rendered output.

### 6. Human gate

Where the user decides. Non-negotiable in these cases:

- Anything that would become **Explicit State**. AI output is a proposal; there is no threshold above which confirmation is skipped.
- Anything **submitted externally**. The person's name goes on it.
- Any **consequential claim** — a capability, an outcome, a level of responsibility.
- Any **sensitive disclosure** — disability, visa or work authorization, health, ethnicity. Never defaulted, never inferred, never pre-filled.
- Any **interpretation of a later application stage** — accept / edit / decline / challenge, and nothing enters Adapted State without one of the four (ADR 0013).

The gate must be reviewable: show what changed, what evidence backs it, and what the model was
unsure about. "Accept all" on a document the user hasn't read is not a gate.

### 7. Persistence policy

Decide explicitly, before writing anything, what survives:

| Output | Where it goes |
|---|---|
| A generated representation | Stored as a representation. Never Explicit State. |
| A proposal about the person | Pending, awaiting confirmation. |
| A submitted document | Frozen into the Application Record, immutable. |
| Working state, drafts, retries | Temporary Workspace / session state. **Never** Durable Identity. |
| A proposed correction to professional truth that the user separately confirms | Explicit State, through Identity's correction/stated-context path, with who and when recorded. |
| A representation or Adapted State edit the user approves | The **current Adapted State**, not just the one rendering it came from — later representations must stay consistent with it. If submitted, Execution freezes the submitted copy in the Application Record. Never an automatic Explicit State write. |
| A factual result from a later application stage | The Application Record first, by its Execution owner; from there it may enter the current Adapted State as context. |
| Your interpretation of that result | Nowhere until the user has **accepted, edited, declined or challenged** it. Accepted, it is operational Adapted State — still not PCI. |
| A pattern you think you noticed about the person | **Nowhere, from here.** It becomes a Record for the slow loop, never a direct PCI write. |

The default is **do not persist**. Most translation output is disposable and regenerating it is cheap.

### 8. Evaluation

Cases in `docs/agent-evals/` before it ships. Doctrine violations are failures, not scores:
untraceable claims, ungated writes to Explicit State, dropped epistemic status, assumed
disclosures. Record failures including fixed ones — a pipeline with no recorded failures hasn't been
evaluated.

## The workflows

- **Evidence selection** — which items matter here. Selection only; never rewrite an item to fit.
- **CV adaptation** — reorder, emphasise, trim. Never invent, upgrade, or smooth a date.
- **Application answers** — the person's answer, assembled from their evidence. If they wouldn't say it in an interview, it shouldn't be there.
- **Voice adaptation** — match how they write, from their own confirmed material. Voice is style, never content.
- **Opportunity-context interpretation for representation** — consume Intelligence's attributed
  understanding and determine what matters for representation. Intelligence still owns what the
  posting asks for and all evaluation. Mark inference as inference.
- **Interview intelligence** — preparation grounded in real evidence and the real opportunity, not generic advice.
- **Stage interpretation** — reading what a test, interview or piece of recruiter feedback suggests.
  Output is a **proposal to the user**, presented with accept / edit / decline / challenge. "The
  interviewer appeared to challenge your technical depth" is a claim about the person at the moment
  they are least able to argue with it; it enters their operational state only when they say so, and
  never becomes PCI on this path.

## Operationally

Model work is slow and external: it runs in `apps/worker` behind durable, idempotent work, never in a
request path. Use a domain event only when a meaningful state change has a real subscriber; otherwise
use a domain-owned durable job. Temporary regeneration must not manufacture a second durable Record.

Adaptation defines consumer-side ports for opportunity understanding. App composition roots wire the
Intelligence adapter and Execution caller; Identity must not import either adjacent domain.

Use the `ai-engineer` agent to implement, `adversarial-reviewer` to check what happens when the model
is confidently wrong.
