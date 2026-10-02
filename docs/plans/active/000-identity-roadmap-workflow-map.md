# 000 — Identity Roadmap: workflow mechanism map

**Not a slice plan.** This governs *how* the Identity roadmap (Foundation, Releases 1–4, UC01–UC12)
is executed with the mechanisms that already exist in this repository. Slice plans are `001+`.

The roadmap and its Tier 1–3 decision hierarchy are authoritative. Skills and agents sit **beneath**
it: they carry engineering workflow, not product semantics. Where a skill's wording contradicts the
roadmap, the roadmap wins and the skill gets amended (§3).

## 1. Mechanisms that exist

| Kind | What exists |
|---|---|
| Orchestration skill | `vertical-slice` — the outer workflow for all feature work |
| Specialist skills | `identity-evidence`, `ai-translation`, `event-workflow`, `opportunity-ingestion`, `portal-integration`, `career-memory-learning` |
| Engineering agents | `frontend-engineer`, `backend-engineer`, `data-engineer`, `ai-engineer`, `worker-engineer`, `test-engineer` |
| Review agents | `architecture-guardian` (is this right?), `adversarial-reviewer` (what breaks it?) |
| Development loop | ORIENT → EXPLORE → PLAN → BUILD → VERIFY → CHALLENGE → INTEGRATE → CONSOLIDATE → COMMIT (root `CLAUDE.md`), already encoded as the steps of `vertical-slice` |

There are **no repo-defined loops, slash commands, hooks, or settings** in `.claude/` — only `agents/`
and `skills/`. The "loop" in this repository is the development loop above, not a scheduled mechanism.
Harness-level `/loop` and `/schedule` are for recurring/polled work and have **no place** in this
roadmap; nothing here is time-driven.

## 1a. The locked model (ADR 0011)

```
D = (E, X)                                        Durable Identity (PCI is Memory / PCI's, ADR 0030)
E = (Structure, Activity, Relations)              Explicit State — reconstruction + confirmation, and user correction
X_t = current user-stated operating conditions    Stated Context — distinct, Identity-owned, user only
L                                                 Learned State / PCI — Slower Learning Loop only
Aᶜ = T(E, X, L, C)                                Adaptation — reads four, writes nothing canonical
```

In `E = (Structure, Activity, Relations)`, Relations is written in full.

**What each release may write** — the boundary every slice is checked against:

| Release | Writes | Never writes |
|---|---|---|
| R1 · UC01–03 | sources, provenance, **drafts/proposals only** | E, X, L |
| R2 · UC04–07 | **E** (confirmation, correction) | X, L |
| R3 · UC08–11 | **E** (enrichment via the same review path) | X, L |
| R4 · UC12 | nothing — boundary only | E, X, L |

**No reconstruction release in UC01–UC12 writes X.** Stated Context has separate user authority.

## 2. Mapping to the roadmap

One orchestration skill per **slice**, never per use case. Twelve use cases → roughly six slices.

| Roadmap stage | Orchestration | Specialist skills | Agents |
|---|---|---|---|
| **Foundation** (tooling, DB, outbox/queue impl, runnable apps) | `vertical-slice` — *with the deviation in §3.4 stated* | — | `data-engineer`, `backend-engineer`, `worker-engineer`, `test-engineer` |
| **R1 · UC01–UC03** source capture → async reconstruction → draft | `vertical-slice` | `identity-evidence` (primary: raw-source preservation, provenance, proposals-not-truth, no upgrading of meaning), `event-workflow` (durable scheduling of extraction in the capture transaction) | `backend-engineer`, `data-engineer`, `ai-engineer`, `worker-engineer`, `frontend-engineer`, `test-engineer` |
| **R2 · UC04–UC07** review → atomic confirmation → canonical Eₜ → correction | `vertical-slice` | `identity-evidence` (canonicalization, confirmation, traceability), `event-workflow` (`IdentityUpdated` on confirmed change only) | same set |
| **R3 · UC08–UC11** professional sources, GitHub, enrichment, Permanent Identity View | `vertical-slice` | `identity-evidence`, `event-workflow` | same set |
| **R4 · UC12** exported package boundary | `vertical-slice` | `event-workflow` (audit the six-name closed union; add nothing casually) | `backend-engineer`, `test-engineer` |
| Every stage, CHALLENGE step | — | — | `architecture-guardian` + `adversarial-reviewer` |

### Deliberately **not** used

- `opportunity-ingestion` — Discovery-side (external posting → Opportunity). Superficially "ingestion",
  wrong domain and wrong output. Release 3's professional-source abstraction reuses
  `identity-evidence` §Ingestion instead.
- `portal-integration` — Execution-side. Nothing in UC01–UC12 drives an external submission.
- `career-memory-learning` — **Slow loop.** The roadmap forbids reconstruction and correction from
  touching PCI. Invoking it here would be the violation, not the workflow.
- `ai-translation` — outward-facing (Durable Identity + context → representation the user sends).
  CV/GitHub extraction is the *inward* direction and is governed by `identity-evidence`. Its pipeline
  sections on structured output (§3), uncertainty-as-a-field (§5), and `docs/agent-evals/` (§8) are
  read as **reference** when building the extraction adapter — the skill itself is not invoked, and
  the human gate it describes is the roadmap's end-of-flow review.

## 3. Gaps, and why the existing system does not close them cleanly

Three are conflicts between existing wording and Tier 1/Tier 2. None is closed by adding a skill;
each is closed by amending the doctrine artefact that carries it.

### 3.1 Per-item confirmation vs end-of-flow review — **amend `identity-evidence`**

`identity-evidence` §User confirmation: *"Confirmation is an explicit act on a specific item. Not a
bulk accept."* Tier 2 requires one end-of-flow reviewable set, individually editable/excludable, then
one atomic transition. Both defend the same invariant (AI never silently becomes truth), and the
roadmap's version still requires the user to have seen and shaped every proposal — so this is wording,
not doctrine. It cannot be left alone: taken literally the skill forbids the mandated UX.

*Action:* amend the skill to distinguish **bulk-accept-unseen** (still forbidden) from **reviewed-set
confirmation** (required). Root `CLAUDE.md` doctrine #5 is untouched. Do this before R2 builds review UX.

### 3.2 Explicit State vocabulary — **CLOSED (2026-08-14) by ADR 0009**

`identity-evidence` and `packages/identity/README.md` enumerated Explicit State as *education,
experience, projects, achievements, skills…*. Tier 1 fixed the Structure/Activity/Relations triple
(now **E**, per ADR 0009 and rewritten ADR 0011) with sparse
aᵢ = (Contribution, Capability, Consequence), and Tier 2 forbids separate canonical Education /
Experience / Project / Skills stores — those become **Permanent Identity View sections**, projected.

*Resolved:* **ADR 0009** defines Explicit State as `E = (Structure, Activity, Relations)`; rewritten
**ADR 0011** makes **Stated Context `X_t`** distinct Identity-owned context authored only by the user.
`JOBY_MEMORY.md` (§2.1, §2.3, §2.4, §4, §7, §10, §11, §14),
`packages/identity/README.md`, `packages/identity/CLAUDE.md`, and the `identity-evidence` and
`ai-translation` skills all carry the locked model. ADRs 0005, 0008 and 0009 keep their text and
gained dated forward notes.

*Closed too:* `packages/identity/CLAUDE.md` now exists, carrying the vocabulary, the ten locked
invariants, the write-authority table and module responsibilities.

### 3.3 Provenance / EvidenceItem ownership — **roadmap's own checkpoint, ADR before R2 schema**

`identity-evidence` states EvidenceItems are *owned by Memory; Identity references them*. The roadmap
makes ownership an open decision to be made on governance grounds. Deciding it implicitly in a
migration is the failure mode the checkpoint exists to prevent.

*Action:* resolve at the R2 provenance checkpoint, ADR if the boundary moves, and amend the skill line
to match whatever is decided. Blocking for R2, not for Foundation or R1 (R1 stores source-level
provenance on the draft, which is Identity-owned either way).

### 3.4 Foundation is horizontal — **no new mechanism; state the deviation**

`vertical-slice` mandates *"Vertical, not horizontal… cut scope by removing capability, never by
removing a layer."* Foundation is by definition horizontal enablement. Adding a "foundation" skill to
sanction one stage would be a mechanism per stage — precisely what the brief rules out.

*Action:* run Foundation under `vertical-slice` with its scope tied to the R1 slice — build only the
tooling the first Identity slice executes — and record the deviation in plan `001`. Nothing durable.

### 3.5 Person lifecycle under upload-first — **CLOSED (2026-08-14) by ADR 0010**

Discovered while scoping R1, not present in the original map. Every `EventEnvelope` requires a
non-empty `personId`, so nothing could be captured or durably scheduled before a Person existed —
which upload-first onboarding appeared to require.

*Resolved:* the Person and Durable Identity root are created **with the first professional source**,
**unclaimed**. An Account Claim (verified email) is authentication, stays out of the ontology, and
gates outward action and longitudinal accumulation rather than profile building. UC01–UC03 runs
unclaimed. ADR 0010 also records that source capture is **episodic and user-initiated** — Joby never
crawls, polls or watches a source.

### 3.6 Stated Context semantics — **CLOSED by rewritten ADR 0011 (2026-08-16)**

Exposed by ADR 0011 rather than created by it. The Baseline Identity State is defined as *sparse
Durable Identity + **explicit direction** + minimal priors* (ADR 0008), and Career Direction is
explicit user input. But all twelve use cases concern professional sources and reconstruction: none
of them captures CareerDirection, Preferences or Constraints.

Consequences if left alone: **Baseline Identity is not reachable** through this roadmap; `X` is empty
for every user; and `Aᶜ = T(E, X, L, C)` runs permanently with one of its four inputs missing, which
degrades adaptation silently rather than visibly.

*Resolved semantically:* Identity owns current Stated Context; only explicit user create/change/
removal changes it; missing remains unknown; and Adaptation retrieves relevant X through a read-only
public boundary. No taxonomy, persistence representation, DTO, endpoint, history, override, learning,
UI or event contract is fixed by the decision.

*Implemented with Adaptation Module 1:* the read-only consumer retrieves current `X`, re-derives an
existing context when `X` changes, and surfaces alignment, conflict and uncertainty without writing
Identity or blocking an application.

**No new skill, agent, loop, or command is proposed.** Every genuine gap is a doctrine artefact needing
an amendment or an ADR, which is what the repository's Memory Rule already prescribes.

## 4. The workflow set being used

```
vertical-slice                        (every slice, outer)
  ├── identity-evidence               (R1–R3, the doctrine of the work)
  ├── event-workflow                  (only where an event contract is genuinely touched)
  ├── {backend,data,ai,worker,frontend,test}-engineer
  └── architecture-guardian + adversarial-reviewer   (CHALLENGE, every slice)
```

Plus, ahead of R2: ADR 0009 (§3.2), the provenance ADR if the boundary moves (§3.3), the
`identity-evidence` amendment (§3.1), and `packages/identity/CLAUDE.md`.
