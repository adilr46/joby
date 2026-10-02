# Identity — *Represent*

**Depth: HIGH.** Not yet populated.

## Owns

**Durable Identity** — the persistent professional model of the person, and the primitive Joby
organises around (ADR 0005). Two governed state families:

### Explicit State — E = (Structure, Activity, Relations)

Reconstructed professional reality: what the person has done, built from professional sources
through reconstruction and user confirmation (ADR 0009).

- **Structure** — institutions, organisations, programmes, roles, engagements, periods. Where and within what.
- **Activity** — **aᵢ = (Contributionᵢ, Capabilityᵢ, Consequenceᵢ)**, held independently. **Any subset is valid**; a sparse activity is complete information about an incomplete source, and absence is never filled in.
- **Relations** — typed links between them. Small vocabulary: `occurred_within`, `associated_with`, `uses_capability`. Candidates, not permanent ontology. No generic `related_to`. Never abbreviated to `R`.

Plus provenance for every confirmed fact and the captured professional sources.

**Stated Context (`X_t`)** is distinct Durable Identity-owned canonical context: the person's current stated
professional intent and operating conditions. The initial placement scope includes career direction,
preferences, constraints, work authorisation, user-stated sponsorship requirement/status and
availability (ADR 0011). It locks no complete taxonomy or representation.

- **Only the user writes X.** Reconstruction never does. A historical statement in a source may be surfaced as a proposal marked historical; it becomes current X only by an explicit user act.
- **Missing is unknown.** It is never interpreted as false, unrestricted or unavailable.
- **No weights or gates.** Conditions have no hard/soft level, priority or strength; comparison never blocks an application.
- **Constraint conflicts are informational** — surfaced with the conflict named, never auto-blocking or silently filtering.

**There is no canonical Education, Experience, Project or Skills store.** Those are projections; see
below.

User-owned, inspectable, editable. AI may propose; **AI must not silently mutate it**; consequential
changes require explicit user confirmation.

### Learned State / Personal Career Intelligence

What Joby has learned about the person over time — representation and evidence preferences, voice
tendencies, recurring performance and market-response patterns, career-direction signals, inferred
strengths and constraints, developmental patterns, uncertainty, hypotheses worth testing.

**PCI is not a component of Durable Identity** (ADR 0030). It is an independent learned model of
recurring person x professional-world relationships, owned by Memory / PCI. This package holds no
learned state and exposes none: it answers what is professionally true about the person, and what
Joby has learned about how the world responds to them is a different claim with a different owner.

### The Permanent Identity View

Education, Experience, Projects, Skills, Achievements and Evidence — **projected from Explicit State
at read time**, storing nothing (ADR 0009).

| Section | Derived from |
|---|---|
| Education | Institution and programme Structure, plus activities that occurred within them |
| Experience | Organisation and role Structure, plus their activities |
| Projects | Activities, with their Structure where there is one |
| Skills | **Capability components aggregated across activities** — not a maintained list |
| Achievements | **Consequence components**, with the contribution that produced them |
| Evidence | Provenance behind confirmed facts, wherever they sit in the graph |

A materialised copy of any of this would be a second source of truth wearing a performance
optimisation's clothes.

### Identity Representations — Eₜ + Decisionsᵢ → Vᵢ

**Persistent, reusable, non-canonical positioning lenses** over Explicit State (ADRs 0014, 0015) —
"Markets", "Investment Banking", "Software Engineering". The person creates one, says what it leads
with, and positions their existing truth inside it: select/hide, order, emphasise, reword.

**It stores the lens and the decisions, never the facts.** A decision names a canonical node and says
what this lens does with it — it copies nothing out of Explicit State, and the node id is a foreign
key. Content is derived from E at read time through the same projection above, with lineage to the
canonical revision. There is no content column, so there is nothing to synchronise and nothing that
can drift: a correction shows up in every representation of that fact on the next read.

**A lens is a prior, not a boundary.** `HiddenInLens ≠ UnavailableToAdaptation`. Hiding writes a
decision row; the fact stays canonical, the ungoverned projection still comes back beside the
positioned view, and hidden evidence is flagged rather than dropped. Framing travels beside the
canonical label it presents.

A lens **materializes** as a general, reusable CV — `CvDocument → LaTeX → PDF`, one server-controlled
template, no user-authored LaTeX, nothing stored — and is **offered to Adaptation as an optional
prior**, `Aᶜ = T(E, X, L, C, Pᵢ)`. The prior carries preferences keyed by canonical node id and no
professional evidence, so it cannot stand in for Durable Identity (ADR 0016).

```
ReusableMarketsCV ≠ BarclaysSubmittedCV
```

Not Stated Context (a lens is not a claim about where the person is going) and not Adapted State (no
opportunity, JD or company ever enters one).

The peer **Adaptation module** (ADRs 0013, 0023) owns the Fast Operational Loop
service that derives temporary Adapted State and contextual representations such as a tailored CV or
application answer, for the life of an application cycle. Adaptation is not Durable Identity and has
no write path to E, X or L. It may read an Identity Representation as a starting lens:

```
Markets Identity Representation + Barclays Markets JD -> Barclays Markets Adapted State
```

| Explicit State | Representation |
|---|---|
| Durable, user-owned, singular | Contextual, derived, many |
| The source | Never the source |
| Changes only with user confirmation | Regenerated freely |

## Owns the state, not every process that changes it

The boundary that matters (ADR 0005):

- **Memory** owns the slower learning process and conservative PCI update logic. It produces *justified* Learned State updates; Identity records the result.
- **Memory** owns slower-loop interpretation of how the person is changing over time.
- **Identity is where PCI comes back out** (ADR 0027). Career Memory consumes resolved Application
  history and proposes; future Opportunity and Adaptation work reads held PCI as a **prior through this
  package's public read boundary**, never by Career Memory writing into them. Career Memory rewrites
  no Durable Identity state directly, and no Translation Layer authority writes PCI at all.
- **Opportunity** proposes; it confirms nothing.
- **Application** composes Career Workspace information into its live context and **must not directly mutate Explicit State.**

Identity is the only domain that owns writes to canonical professional state and Stated Context.

## Does not own

- Opportunity/company/role understanding and Opportunity Evaluation → **Opportunity**. Adaptation
  consumes attributed understanding; it does not own or consume an evaluation as representation truth.
- Slow EvidenceItem accumulation and PCI learning → **Memory**. Contextual claims use Identity's
  canonical fact provenance; a representation edit is not automatically a Memory signal.
- What was actually submitted → **Application** (an Application Record freezes the representation)
- Career Workspace — the product umbrella over Durable Identity and Identity Representation. It owns
  no state of its own and never keeps a second copy of person-state.

## Publishes

- `IdentityUpdated` — the current implementation's notification of a confirmed canonical Identity
  change. ADR 0011 deliberately does not lock event semantics for Stated Context.

Currently published on a confirmation that applied something, on a correction, and on the existing
Stated Context write path. **Not** on upload, extraction, draft generation, review-in-progress, or a
review that retained nothing. This describes implementation, not a Stated Context event contract
fixed by ADR 0011.

Reconstruction is scheduled through an **Identity-owned durable job**, not an event: "this source
still needs extracting" is not a fact about a person's career.

## Implemented (Releases 1–2)

| | |
|---|---|
| `model.ts` | Proposal and canonical types. Contribution / capability / consequence independently optional |
| `repository.ts` | Sources, jobs, proposals. **No update path for a captured source** |
| `explicit-state-repository.ts` | Canonical nodes, relations, provenance, review and correction history |
| `source-capture.ts` | Person-or-create, immutable source, job row — one transaction |
| `reconstruction.ts` | Claim → extract → persist proposal. Failure preserves the source |
| `review.ts` | The gate. Requires a decision for **every** proposed item; applies the retained set atomically |
| `correction.ts` | Direct user changes to E, without reconstruction and without touching PCI |
| `extraction/` | Provider-neutral port; deterministic and OpenAI adapters; output validation |
| `github/` | Metadata-only client port, deterministic fake and HTTP adapter, repository extractor, and the ingestion service that enforces repository selection |
| `delta.ts` | Classifies each candidate against current E — new, enrichment, clarification, relation, duplicate, conflict |
| `projection.ts` | The Permanent Identity View, derived from E at read time |
| `representation/` | Identity Representations: create, list, read, position, materialize and expose as a prior. Three tables of its own; canonical access is a two-method read port plus an ownership check. Pure functions for the parts that matter: `positioning.ts` (`E + Decisions → V`), `cv-document.ts`, `latex.ts` (escaping is security code), `prior.ts` |
| `contract.ts` | The `Identity` interface — the fifteen capabilities other domains depend on |
| `service.ts` | `IdentityService implements Identity` — composition, for Joby's own runtimes |

## Consuming Identity

```ts
import { createIdentity, type Identity } from '@joby/identity';   // other domains
import { IdentityService } from '@joby/identity/runtime';         // apps/api, apps/worker
import { FakeGitHubClient } from '@joby/identity/testing';        // tests
```

Persistence, the delta classifier, the projection function and extraction validation are exported
from none of them, and there is no wildcard subpath. A test pins the exact export list.

**Selection is the permission.** Ingestion checks it *before* calling GitHub, never after: fetching
everything and filtering the results would satisfy any output-based test while Joby had already read
the person's private code.

**Visibility is computed, not stored.** A fact is private unless every source behind it is public, so
a public repository's facts stay private while a private CV also stands behind them.

## Boundary notes

- Every claim in a representation traces to canonical Identity provenance. A future Memory
  EvidenceItem may additionally support a claim, but Adaptation does not require or create one.
- AI never writes Explicit State directly. A proposal becomes truth only through user confirmation.
- The user controls consequential claims and sensitive disclosures. Disclosure is a decision, never a default.
- **Application and Execution state are not Durable Identity.** A draft being edited, an in-progress application or a portal session is operational, stored by its semantic owner and disposable where appropriate.
- **Career Workspace surfaces Identity through its public API.** Caching person-state in an umbrella layer would recreate the second-source-of-truth problem Durable Identity exists to prevent.
- **Baseline Identity State (ADR 0008).** Every new person starts sparse: confirmed Explicit State, an explicitly stated Career Direction, and near-empty PCI. Stated direction is where the user *currently believes* they want to go — never an inferred permanent trait.
- **The Person exists from the first professional source, unclaimed (ADR 0010).** An Account Claim — a verified email — is authentication and **never enters this ontology**: no account, address, token or verification time is Explicit State, Learned State, Structure, Activity or Relation. Unclaimed and claimed Persons have identically shaped Durable Identity; the claim gates *operations*, at the boundary.
- **Sources are captured periodically, never crawled.** Reconstruction runs when the user adds, selects or refreshes a source — not on a schedule.
- Learned State must be able to weaken and expire. The person can see, question, and remove any interpretation Joby holds about them.

## Adaptation module

The separate module boundary is `src/adaptation/`. It is authoritative only for temporary
contextual state — Adaptation Context, informational conflicts, Adapted State, representation
state/drafts, operational user edits and stage-specific contextual interpretation — for the lifetime
of the active application cycle. Opportunity supplies attributed opportunity understanding through a
consumer-side port; Application supplies task context, owns the Application Record and freezes the
submitted result into it. The app runtimes wire those seams so Identity imports neither adjacent
domain.

Adaptation reads a **broad canonical snapshot** of E, X and L. Contextual relevance selection lives
in Adaptation, so Identity exposes truth and never pre-selects evidence for a role (ADR 0013). A user
edit updates the current Adapted State rather than one rendering, and still writes nothing durable.
Later-stage factual results may enter Adapted State automatically through the record; a
system-generated interpretation of them enters only by user accept / edit / decline / challenge, and
even then is operational state rather than PCI.

Module 1 (UC01–UC04) is implemented: context creation/read/list, attributed opportunity arrangement,
current Stated Context retrieval, and an informational `aligned | conflict | uncertain` surface.
The one `adaptation_context` table stores only authoritative references and revisions. There is no
model call, professional evidence selection, Adapted State composition, representation or gate yet.

Domain semantics, the locked invariants, the write-authority table and module responsibilities live
in [`CLAUDE.md`](CLAUDE.md).
