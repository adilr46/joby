# Identity — domain semantics

What the terms in this package mean, what it owns, and the invariants that must hold. Read with root
`CLAUDE.md`, `docs/JOBY_MEMORY.md` §2, and ADRs 0005, 0008, 0009, 0010, 0011.

Terms here are load-bearing. Do not invent synonyms; do not widen one to cover a case it does not fit.

## The model

```
D = (E, X)                              Durable Identity — what is professionally true
E = (Structure, Activity, Relations)    Explicit State — reconstructed professional reality
X_t = current user-stated operating conditions      Stated Context — distinct, Durable Identity-owned

Vᵢ = Pᵢ(Eₜ)                             Identity Representation — persistent, non-canonical
Aᶜ = T(E, X, C, Pᵢ, PCI)                Adapted State — temporary, opportunity-specific
```

**PCI is not a component of Durable Identity** (ADR 0030). It is an independent learned model of
recurring person × professional-world relationships, owned by Memory / PCI, and it reaches Adaptation
as a *prior* from that authority — not as an `L` this package holds. Durable Identity answers what is
true about the person; PCI answers what Joby has learned about how this person and the world
interact. Different claims, different owners.

Three boundaries live in this package and must not be merged: **Durable Identity** (what is true),
**Identity Representation** (which reusable projection of that truth the person wants, ADR 0014) and
**Adaptation** (how it should be interpreted for one opportunity, ADRs 0012–0013).

Each activity is **aᵢ = (Contributionᵢ, Capabilityᵢ, Consequenceᵢ)**, and **any subset is valid**.

> **Notation.** In `E = (Structure, Activity, Relations)`, Relations is written in full whenever the
> triple appears. Stated Context is `X_t`, not a component of E.

### Explicit State (E)

What the person has done. Built from professional sources, through reconstruction, through user
confirmation.

- **Structure** — institutions, organisations, programmes, roles, engagements, periods. Where and within what; never what was done.
- **Activity** — contribution, capability, consequence, held independently. A sparse activity is **finished, not partial**: contribution with no consequence stays that way, and the shape must never invite completion.
- **Relations** — typed links between them. `occurred_within`, `associated_with`, `uses_capability`. Candidates, not permanent ontology. **No generic `related_to`** — a link that means nothing in particular cannot be queried or explained.

### Stated Context (X)

What the person says about where they are going and what bounds them: **CareerDirection,
Preferences, Constraints.**

Persistent current professional operating context authored by the user (ADR 0011). The initial
placement scope must be capable of carrying career direction/current intent, preferences,
constraints, work authorisation, user-stated sponsorship requirement or status, and availability.
This is not a complete taxonomy and locks no DTO, storage shape or UI.

Missing means **unknown / not stated**, never false or unrestricted. Only explicit user creation,
change or removal changes X; the latest user-maintained value remains operative.

### Learned State / PCI — not owned here

**This package holds no PCI.** Memory / PCI owns both the learning process and the learned model
(ADR 0030). There is no `L` on the Durable Identity type, no learned column, and no write path to
add one: asking Durable Identity for learned state is asking the wrong authority.

What remains binding here is the inverse guarantee — **PCI may not silently become canonical truth.**
A learned prior is not a confirmed fact, and nothing in this package may record one as `E` or `X`
without the ordinary user confirmation gate.

### Identity Representation (Vᵢ)

A **persistent, reusable, non-canonical** lens over Eₜ — "Markets", "Software Engineering" — that
the person keeps and returns to (ADR 0014), together with how they generally want that truth
positioned in that domain (ADR 0015):

```
Eₜ + Decisionsᵢ → Vᵢ
```

**It stores a lens and decisions, never a fact.** Name, purpose, ordered positioning themes, and one
decision per canonical node — `included` (UC05), `priority` (UC06), `emphasis` (UC07), `framing`
(UC08). A decision copies no label, contribution, capability, consequence or date; `node_id` is a
foreign key to `identity_explicit_node`, and the node must belong to this lens's person. Content is
derived from E at read time through the same projection the Permanent Identity View uses. There is no
content column and there must never be one: that is the only thing standing between this and a
second, staler copy of the person's history.

**The lens is a prior, not a boundary.**

```
HiddenInLens   ≠ UnavailableToAdaptation
PriorityInLens ≠ CanonicalImportance
```

Hiding writes a decision row and nothing else: the fact stays canonical, the ungoverned projection
still comes back beside the positioned view, and hidden evidence is returned **flagged, never
dropped**. A general positioning choice must never censor what a specific opportunity can reach.

**Framing presents truth; it never replaces it.** `canonicalTitle` travels beside `framing` on every
entry. Wording is general positioning — anything aimed at one employer or posting is Adapted State.

**A lens is observable and consumable** (ADR 0016). It renders as a general CV
(`CvDocument → LaTeX → PDF`, nothing stored, no user-authored LaTeX, every value escaped), and it is
offered to Adaptation as an optional prior:

```
A^C = T(E, X, L, C, Pᵢ)     Pᵢ optional
```

`Pᵢ` carries preferences keyed by canonical node id and **no professional evidence** — a consumer
holding only a prior cannot say what any node is, so it can never stand in for Durable Identity. A
hidden fact appears in it marked `suggestedInclusion: false`, never as an absence.

A rendered CV is general to the lens: `ReusableMarketsCV ≠ BarclaysSubmittedCV`.

It is **not Stated Context.** X is what the person says about where they are going — person-state.
A lens is which view of their history they want kept. Someone may hold a Markets representation with
an unstated or entirely different Career Direction, and creating one must never write X.

It is **not Adapted State.** No opportunity, JD, requirements or company. A lens bound to one posting
is Adapted State and belongs to Adaptation, temporarily.

> Never write "representation" alone in this package. **Identity Representation** is the persistent
> lens; a **contextual representation** is Adaptation's tailored CV or answer.

## Invariants

Locked by ADR 0011. A change here is a product decision, not an implementation detail.

1. **Reconstruction proposes changes only to E.**
2. **Reconstruction must never authoritatively write X.**
3. A source may contain a *historical* statement about direction, preferences or constraints. It may be surfaced as a **proposal marked historical**; it becomes current X only by an explicit user act.
4. **The user is the authoritative writer of X.** No AI path, no inference, no default value.
5. **User corrections may correct E** directly, without another reconstruction.
6. **PCI is not written here at all.** It changes only through Memory / PCI's Slower Learning Loop, from accumulated resolved Application evidence — never from reconstruction, correction or adaptation, and never into this package's state (ADR 0030).
7. **Adaptation reads E, X and context C — selectively — and mutates no canonical state.**
8. **Aᶜ = T(E, X, C, Pᵢ, PCI)** — Adapted State for context C. `Pᵢ` is the Identity Representation prior (ADR 0016): it carries preferences, never evidence, and never narrows what Adaptation may reach. PCI priors arrive from Memory / PCI, not from this package.
9. **C is temporary and external to Durable Identity.**
10. **Constraint conflicts are informational and never automatically block user action.**

Plus, carried from earlier decisions and equally binding:

11. **A source is never canonical identity.** A CV is the person's prior representation of themselves — evidence of a claim, not the claim.
12. **AI output never becomes canonical without user confirmation**, and there is no confidence threshold that skips it.
13. **Every confirmed fact carries atomic provenance** to its source or derived evidence.
14. **The Permanent Identity View is a projection**, never a store.
15. **The Person exists from the first captured source, unclaimed.** An Account Claim is authentication and never enters this ontology (ADR 0010).

## Write authority — the table to check against

Every write path answers: *which component, by whose authority?*

| Path | May write | Must never write |
|---|---|---|
| Source capture | the source, its provenance | E, X |
| Reconstruction (AI, in `apps/worker`) | draft/proposal state only | E, X |
| Review confirmation (user) | E | X |
| Direct correction (user) | E | X |
| Stated context command (explicit user act through Identity) | X | E |
| Slower Learning Loop (Memory-justified) | nothing here — PCI is Memory / PCI's own state | E, X |
| Identity Representation (user) | its own lens, themes, and decisions **about** canonical node ids | E, X, and any derived fact |
| Representation reference (user) | the reference material and its ownership | E, X — and **nothing reconstructs from it** |
| Adaptation / Translation Layer | **nothing canonical** | E, X |

If a proposed change does not fit a row, stop — it is a doctrine question, not a design one.

## Projections

Education, Experience, Projects, Skills, Achievements and Evidence are **derived from E at read
time** (ADR 0009). No canonical store sits behind any of them.

| Section | Derived from |
|---|---|
| Education | Institution and programme Structure, plus activities that `occurred_within` them |
| Experience | Organisation and role Structure, plus their activities |
| Projects | Activities, with their Structure where there is one |
| Skills | **Capability components aggregated across activities** — not a maintained list |
| Achievements | **Consequence components**, with the contribution that produced them |
| Evidence | Provenance behind confirmed facts, wherever they sit in the graph |

A materialised copy would be a second source of truth wearing a performance optimisation's clothes.
If projection cost becomes a measured problem, the answer is a rebuildable materialisation with an
explicit invalidation rule — never a durable second copy of person-state.

**An Identity Representation is projected the same way**, from the same function. What persists is
the lens; the sections are computed on every read. That is why a correction reaches every
representation of a fact at once, with no refresh path anywhere.

## Module responsibilities

Internal decomposition, names and file layout are implementation choices. These responsibilities are
not, because each is a different rule set:

| Responsibility | Owns |
|---|---|
| **Person and identity root** | Creating/locating the Person and Durable Identity root; the unclaimed/claimed distinction as a *gate*, never as ontology |
| **Professional sources** | Durable, immutable capture of source material; provenance; dedup; visibility (private sources stay private through extraction and projection); scheduling reconstruction transactionally. **User-selected GitHub repositories only** — the selection is checked before the client is called, never after |
| **Reconstruction** | The provider-neutral extraction boundary and draft production. Produces proposals, each candidate classified against current E — new, enrichment, clarification, relation, duplicate, conflict. Those labels are **behaviour, not schema**. **Touches no canonical state.** |
| **Review and confirmation** | The reviewable proposal set; edit, exclude, reject, retain; one atomic transition applying exactly the retained set to E; decision history. **Enrichment updates the matched fact; a conflict applies nothing unless the user picks a side** |
| **Explicit State** | E: reading, direct user correction, revisions/optimistic concurrency, correction history |
| **Stated Context** | X: user-authored reads and writes. Distinct from E because its meaning and authority differ |
| **Projection** | The Permanent Identity View, from current E at read time |
| **Representation References** | Persistent, user-owned expression material: writing samples, previous letters and answers. Immutable, deduplicated, user-removable. **No extraction, no proposal, no reconstruction job** — there is no path from a reference into `E` (ADR 0021) |
| **Identity Representation** | Persistent named positioning lenses over Eₜ: create, list, read, position — select/hide, order, emphasise, reword — materialize as a general CV, and offer as an optional Adaptation prior. Stores the lens, its themes and decisions keyed by canonical node; derives everything else at read time through a two-method read port. Writes no person-state and publishes no event (ADRs 0014–0016) |
| **Adaptation** | Temporary contextual state for the active application cycle: Adaptation Context, informational conflicts, Adapted State, representation state/drafts, operational user edits, stage-specific contextual interpretation. Reads E/X/L and C; writes no canonical state. It is a Translation Layer semantic authority (ADR 0029). |
| **Public boundary** | `src/contract.ts` — the `Identity` interface other domains depend on, exported from `src/index.ts` |

## Boundaries

- **Downstream domains call the exported package API in process.** Not the tables, not internal modules, not HTTP. HTTP exists for external and web clients only.
- **Three entry points, split by who is asking** (ADR-free, plan `006`):

  | Entry | Audience | Holds |
  |---|---|---|
  | `@joby/identity` | Other domains | The `Identity` contract (fifteen capabilities), DTOs, errors, `createIdentity` |
  | `@joby/identity/runtime` | `apps/api`, `apps/worker` | `IdentityService`, model adapters, GitHub source acquisition, CV rendering and its LaTeX toolchain |
  | `@joby/identity/testing` | Tests | `FakeGitHubClient` |

  Persistence, the delta classifier, the projection function and extraction validation are exported
  from **none** of them. `package.json` publishes no wildcard subpath, and a test pins the exact
  value-export list — widening the boundary should be a decision someone argues for in a diff.
- **Durable Identity is the only module that writes canonical person-state.** Application acts and must not mutate Explicit State; Opportunity proposes and confirms nothing. Memory / PCI owns its learned model outright and does not write here; where a learned pattern implies a change to canonical truth, that reaches `E` or `X` only through the ordinary user confirmation gate.
- **Return E and X as distinct governed components.** Collapsing them at the boundary merges different meanings and authorities. **No L is returned**: PCI belongs to Memory / PCI, and a consumer wanting a learned prior asks that authority, not this one (ADR 0030).
- **Include revisions or equivalent concurrency information** in every mutable workflow, so one confirmation or correction cannot silently overwrite a newer one.
- **Identity Representations live outside the Durable Identity state boundary, inside
  `src/representation/`** (ADRs 0014, 0015). Persistent, non-canonical, reusable, never
  opportunity-bound. The module reads canonical state through a two-method read port plus one
  ownership check that selects ids and never facts, and holds no canonical repository — so it cannot
  write person-state rather than being trusted not to.
- **A lens never filters what downstream can reach.** Positioning is applied *beside* the ungoverned
  canonical projection, not instead of it, and hidden evidence is returned flagged. If a change would
  make hiding remove something from a consumer's view, it is the wrong change.
- **Adaptation may read an Identity Representation as a starting lens**, and must not write one.
  A lens is not source truth: claims still ground in canonical provenance, and a lens does not narrow
  the broad canonical snapshot ADR 0013 grants — including anything it hides.
- **Adapted State and contextual translation live outside Durable Identity in the peer Adaptation
  authority, located in `packages/translation/src/adaptation/`** (ADR 0029). Adaptation must use a
  read-only Identity interface rather than repositories or tables.
- **The Adaptation read is broad where it happens, but it is demand-driven** (ADRs 0013, 0030).
  When Adaptation needs the canonical reservoir it receives a broad snapshot of E and X with
  provenance and visibility, and **Identity must not pre-select evidence for a role** — contextual
  relevance selection belongs to Adaptation, so do not add a role-aware retrieval abstraction here to
  serve it. But **authority is not eager retrieval**: Adaptation asks for a revision when a revision
  is all it needs, and reaches for the reservoir only where the selected Representation is silent
  about something the opportunity asks for. Visibility must survive any snapshot: a private source
  stays private through selection and rendering.
- **Opportunity understanding enters through a consumer-side port.** An app composition root wires an
  Opportunity adapter; Adaptation must not import Opportunity internals.
- **Application consumes Adaptation output and supplies task context.** Adaptation does not import
  Application internals, own the application lifecycle, or own or write the Application Record — the
  Application-owned durable temporal spine of the cycle.
- **Recorded factual results may flow back in as context.** `Application Record -> Adapted State`
  carries plain external facts only (a result, a progression, an occurrence), through the same
  composition-root wiring. It gives Application no authority over Adapted State, and Adaptation none
  over the record.
- **A system-generated stage insight is not an input until the user has governed it** — accept, edit,
  decline or challenge. An accepted or edited insight is operational Adapted State, never automatic
  PCI.

## Events

- **`IdentityUpdated` means a confirmed change to canonical Explicit State.** Nothing else.
- **Do not publish it** for upload, extraction, draft generation, review-in-progress, or creating an
  Identity Representation — choosing a lens is not a change to the person's history.
- Payloads carry identifiers, never reconstructed object graphs.
- Source capture must schedule reconstruction durably **in the same transaction** as the capture.
- Claiming a Person publishes nothing — it is not a change to their career reality.

## Stop conditions

Raise these rather than working around them:

- Anything that would let reconstruction write X, or write E without confirmation.
- Anything that adds a learned-state component to this package, in any disguise. PCI is Memory / PCI's; a cached learned prior here would be a second owner of it.
- An adaptation path that persists anything durable.
- A user edit to Adapted State that also writes E or X, or is forwarded as a learning signal.
- A stage insight reaching Adapted State without a user disposition, or an accepted insight being
  treated as evidence for PCI.
- **Eager full-person retrieval where a narrower demand would do.** Authority over canonical truth
  does not oblige a consumer to load the whole person; a path that projects everything to read one
  field is drift, not an optimisation question (ADR 0030).
- Adaptation writing to, versioning or reconstructing an Application Record.
- Code that resolves a deliberately deferred decision (result-vs-insight rules, Adapted State
  retention/versioning, the Adaptation → Memory handoff, persistence mechanics, refresh triggers)
  when the slice does not need it resolved — deferral is a decision, and hardening one silently is
  how it gets lost (ADR 0013 §10).
- A constraint conflict that filters, disables or blocks rather than informs.
- A canonical Education / Experience / Projects / Skills store, in any disguise, including a cache.
- A content, snapshot, section or node-list column on `identity_representation`, in any disguise —
  it makes the lens a second copy of the person's history.
- A positioning decision that carries a professional fact rather than naming one, or a lens that
  filters the canonical projection instead of annotating it.
- **Anything that reconstructs from a representation reference**, or lets one ground a professional
  claim. A previous cover letter is what the person once *said*, not what is true (ADR 0021).
- **Generated wording that supplies meaning nobody gave Joby** — a motivation, an interest, a reason
  for applying. That is elicited, never inferred, and fit is not motivation (ADR 0022).
- An Adaptation prior that omits hidden nodes, or that carries canonical evidence — either one turns
  the lens into an evidence whitelist.
- User-authored LaTeX, an unescaped value reaching the template, or a stored rendered CV.
- A path by which Adaptation, or Memory, writes a lens. A generalized improvement is a proposal to
  the user through the Slower Learning Loop (ADR 0016).
- Positioning inferred from the person's history: that is the Slower Learning Loop, it does not exist
  yet, and a prior drawn from one or two applications is a conclusion from nothing.
- An opportunity, JD, requirements or company reaching an Identity Representation: that is Adapted
  State, and it belongs to Adaptation for one cycle.
- A representation lens being written into, or inferred as, Stated Context.
- Account or verification data entering the ontology.
- A relation added to the vocabulary without a concrete query needing it.
- A sparse activity being completed, or a vague date made precise, to satisfy a shape.
