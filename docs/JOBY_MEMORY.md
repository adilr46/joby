# Joby Memory — Durable Product Understanding

> Long-lived. Changes slowly and deliberately. This is the product model, not the development log
> (that is `CURRENT_STATE.md`) and not technical decisions (those are ADRs).
>
> Architectural decisions behind this model: [ADR 0005](architecture/adr/0005-durable-identity-as-the-person-centric-primitive.md)
> (Durable Identity), [ADR 0006](architecture/adr/0006-two-timescale-career-intelligence.md) (two
> timescales), [ADR 0007](architecture/adr/0007-trajectory-evaluation-in-intelligence.md) (trajectory
> evaluation), [ADR 0008](architecture/adr/0008-workspace-context-and-baseline-identity-state.md)
> (Workspace context layers, Baseline Identity State).

## 1. What Joby Is

Joby is a **Unified Career Intelligence Platform**: a person-centric system that builds a durable,
evidence-backed model of a person's professional reality and uses it to find, understand, represent,
and act on opportunities — getting better at all four as the person accumulates experience.

The person, not the application, is the unit of the system.

## 2. Durable Identity — the person-centric primitive

**Durable Identity is the persistent professional model of the person.** Everything in Joby organises
around it. It is not a profile, not a CV, and not a workspace: it is what Joby durably knows and has
learned about this person, and it outlives every application, document, and session.

It holds two governed state families.

### 2.1 Explicit State — reconstructed professional reality

> **D = (E, X)**  ·  **E = (Structure, Activity, Relations)**

Explicit State is what the person has done, built from professional sources through reconstruction
and user confirmation, and by direct user correction. Stated Context is distinct Durable Identity-owned
context (§2.3), not a component of E (ADR 0011).

**Structure** — the durable professional contexts a life is organised into: an institution, an
organisation, a programme, a course, a role, an engagement, a team, a period. Where and within what,
never what was done.

**Activity** — what the person actually did:

> **aᵢ = (Contributionᵢ, Capabilityᵢ, Consequenceᵢ)**

what they did, what it required or demonstrated, and what resulted. The three are held
independently, and **any subset is valid**: an activity with a contribution and nothing else is
complete information about an incomplete source. Absence is never filled in.

**Relations** — typed links between Structure and Activity. The vocabulary is deliberately small
(`occurred_within`, `associated_with`, `uses_capability`) and grows only when a concrete query needs
a link that does not exist.

Explicit State also carries **provenance** for every confirmed fact and the **documents and
artifacts** captured as professional sources.

**Education, Experience, Projects, Skills and Achievements are how this is presented, not how it is
stored** — see §2.4.

Governance:

- **User-owned.** It is the person's record of themselves.
- **Inspectable and editable.** Nothing about them is hidden from them.
- **AI may propose changes.** AI **must not silently mutate Explicit State.**
- **Consequential changes require explicit user confirmation.** There is no confidence threshold above which confirmation is skipped.

### 2.2 Learned State — Personal Career Intelligence

**What Joby has learned about the person over time.** Representation preferences. Evidence
preferences. Voice tendencies. Recurring performance patterns. Market-response patterns.
Career-direction signals. Inferred strengths. Inferred constraints. Developmental patterns.
Uncertainty and confidence. Hypotheses worth testing.

Governance:

- **Evidence-backed.** A learned belief with no evidence behind it is not held.
- **`Observed` / `Inferred` / `Hypothesized` stay distinct**, always, everywhere.
- **A single outcome is never permanent truth.** One rejection is one rejection.
- **Learned State changes more slowly than operational state**, by design — see §5.

**Personal Career Intelligence is an independent learned model of recurring person × professional-world
relationships** (ADR 0030). It is *not* a component of Durable Identity: Durable Identity owns what is
professionally true about the person, and Memory / PCI owns what Joby has learned about how the world
responds to them. Those are different claims, and collapsing them would let a learned pattern harden
into canonical truth.

PCI returns to future reasoning as **person-side** and **context-side priors**. It never automatically
rewrites Durable Identity, Identity Representation, Opportunity or historical Applications.

### 2.3 Stated Context — current user-stated operating conditions

> **X_t = current user-stated operating conditions**

Persistent, explicit professional operating context that remains valid until the user changes it.
The initial placement scope includes career direction/current intent, preferences, constraints, work
authorisation, user-stated sponsorship requirement or status, and availability (ADR 0011).

Fields may be absent. Absence means **unknown / not stated**, never false or unrestricted. The latest
user-maintained value is operative. This minimum scope is not a complete taxonomy and locks no
storage, DTO, endpoint, history, override, learning or UI decision.

**The user is the authoritative writer of Stated Context. Reconstruction never writes it.** A CV that
mentions an ambition is evidence that the person once wrote an ambition down — not a statement of
where they currently intend to go. Such a statement may be surfaced as a **proposal, marked
historical**; it becomes current Stated Context only by an explicit act of theirs.

**Constraint conflicts are informational.** When an opportunity conflicts with a stated constraint,
Joby names the conflict. It never silently filters the opportunity away and never disables the
action. The person should never be surprised by a conflict — and deciding what to do about it is
theirs. Auto-blocking narrows someone's options on the strength of something they typed once, and the
harm is invisible because the blocked thing never appears.

### 2.4 How Explicit State is presented

**Education, Experience, Projects, Skills, Achievements and Evidence are projections**, derived from
**Explicit State** at read time. They are what the person sees. They are not what Joby stores, and there
is no canonical Education, Experience, Project or Skills model behind them (ADR 0009).

| Section | Derived from |
|---|---|
| Education | Institution and programme Structure, plus the activities that occurred within them |
| Experience | Organisation and role Structure, plus their activities |
| Projects | Activities, with the Structure they occurred within where there is one |
| Skills | **Capability components aggregated across activities** — not a maintained list |
| Achievements | **Consequence components**, with the contribution that produced them |
| Evidence | The provenance behind confirmed facts, wherever they sit in the graph |

A skill is a claim, and every claim traces to something the person did. Deriving capability from
activity is what keeps that true where it usually breaks.

#### Identity Representations — Vᵢ = Pᵢ(Eₜ)

A person may keep several **named, reusable lenses** over their Explicit State — "Markets",
"Investment Banking", "Software Engineering" — and return to them across applications (ADR 0014).
They are **persistent and non-canonical**, and they sit between the two things Joby already had: the
single unlensed Permanent Identity View, and Adaptation's temporary opportunity-specific state.

```
Markets Identity Representation + Barclays Markets JD → Barclays Markets Adapted State
Vᵢ = Pᵢ(Eₜ)                        Aᶜ = T(Eₜ, Lₜ, C)
```

A lens answers: **how do I generally want my existing professional truth organized and represented in
this professional domain?** So it also holds the person's positioning decisions (ADR 0015):

```
Eₜ + Decisionsᵢ → Vᵢ
```

select or hide a fact, rank what leads, emphasise or de-emphasise, and give a fact
context-independent wording. Plus the themes the lens generally leads with — "quantitative
reasoning", "decision-making under uncertainty". That is **general** positioning, reusable across
every application in the domain; tailoring for one employer or posting is Adapted State.

**An Identity Representation stores a lens and decisions, never a fact.** Name, purpose, themes, and
one decision per canonical node — the decision *names* the fact and copies nothing from it. The
content is projected from Explicit State at read time, with lineage to the canonical revision
and the node behind every entry. So a correction reaches every representation of that fact at once,
and there is nothing to synchronise, invalidate or let drift.

**A lens is a prior, not a boundary.**

```
HiddenInLens   ≠ UnavailableToAdaptation
PriorityInLens ≠ CanonicalImportance
```

Hiding something in a lens removes nothing from Durable Identity and makes nothing unavailable
downstream: the canonical projection is returned beside the positioned one, and hidden evidence comes
back flagged rather than dropped. A general positioning choice made months ago must never censor the
evidence a specific opportunity needs. Framing likewise presents truth without replacing it — the
canonical label travels with it.

A lens is **observable and consumable** (ADR 0016). It materializes as a general, reusable CV —
`Identity Representation → CvDocument → LaTeX → PDF`, derived on request and never stored — and it is
offered to Adaptation as an **optional positioning prior**:

```
Aᶜ = T(E, X, L, C, Pᵢ)     Pᵢ optional
```

`Pᵢ` carries the lens's themes and its preferences keyed by canonical node id, and **no professional
evidence at all**: a consumer holding only a prior cannot say what any of those facts are, so it must
read Durable Identity. That is what keeps `Aᶜ = T(Vᵢ, C)` from being written by accident. A hidden
fact appears in the prior marked as a preference, never as an absence.

```
ReusableMarketsCV     ≠ BarclaysSubmittedCV
MarketsRepresentation ≠ BarclaysMarketsAdaptedState
```

A general CV is not an application: what is tailored to a posting is Adapted State, and what was
actually sent is Application's immutable Application Record.

**The future learning path, deferred:**

```
Application history → Memory → personal learning → representation improvement → better prior
```

Nothing of this is built. When it is: Memory decides what accumulated resolved history justifies
learning; a generalized improvement is a **proposal to the user** about their own positioning through
the Slower Learning Loop; and **Adaptation may never write a lens** — one opportunity rewriting how
someone generally presents themselves is the fast loop concluding.

It is **not Stated Context** — a lens is a view the person wants kept, not a claim about where they
are going, and creating one never writes X. It is **not Adapted State** — no opportunity, JD or
company ever enters one.

> **Identity Representation** is the persistent lens. A **contextual representation** — a tailored CV
> or an application answer — is Adaptation's, and temporary. The full term is always used.

### 2.5 The Person, and claiming it

The Person exists from the **first professional source captured** — the Person and the Durable
Identity root are created with it (ADR 0010). That Person begins **unclaimed**: it has a professional
profile, but nobody has yet proven they are its subject.

**Claiming** is an authentication act — an email address, verified. It is supporting infrastructure
and **never enters the Durable Identity ontology**: no account, address, token or verification time
is Explicit State, Learned State, Structure, Activity or Relation. An unclaimed and a claimed Person
have identically shaped Durable Identity.

> **An unclaimed Person may build and inspect their own profile. Acting on the world, and
> accumulating over time, need the claim.**

Reconstruction, review, correction and the Permanent Identity View run unclaimed. Application,
opportunity evaluation, Records and PCI learning do not — Joby does not yet know that the operator is
the subject, and everything on that side either has consequences outside Joby or compounds durably
inside it.

### 2.6 Professional sources are captured periodically

Professional reality changes **episodically**, so source capture is user-initiated and episodic: a
CV, a recorded achievement, project or experience, selected GitHub repository metadata, a portfolio
link the person wants Joby to know about.

**Joby does not crawl, poll, or watch any source.** Refresh is something the person does. A system
that polls as though experience accumulated continuously reconstructs unchanged material and then
looks for movement to show — which is noise presented as change.

## 3. Identity

> **Identity is what the person maintains about themselves and how they are generally represented.**

> **Governed by [ADR 0031](architecture/adr/0031-identity-router-translation-application-pci.md).**
> Identity groups **Canonical Profile Units**, **Persistent Representations** and **Stated Context**.
> Where this section says "Career Workspace" below, read *Identity*; where it names Durable Identity
> and Identity Representation as its authorities, those remain correct — a **Profile Unit** is the
> coherent unit of canonical truth they are built from.

The grouping owns no tables or state of its own.

> **Durable Identity owns professional truth. Identity Representation owns general positioning.**

### 3.1 Persistent career workspace experience

The persistent professional environment the user returns to across their career. It exposes and
organises the durable material relevant to the person — the Education, Experience, Projects, Skills,
Achievements and Evidence sections projected from Explicit State (§2.4), alongside Living Documents,
preferences, constraints, stated career direction, active opportunities, relevant career history, and
user-visible PCI insights where appropriate.

```
Durable Identity
      ↓
Career Workspace
```

It should feel like **"My Joby" — the persistent professional environment around me.**

**The Career Workspace experience does not own a second copy of the person's state.** It is the persistent
working and view layer *over* Durable Identity, which remains the owner. A cached copy of person-state
here would be a second source of truth, which is precisely what Durable Identity exists to prevent.

### 3.2 Live task context is not Career Workspace state

When a person enters a specific professional task, the responsible semantic owner composes the
needed Career Workspace information with current external context. That composition does not create
a second Workspace-owned state model.

| Live context | Semantic owner |
|---|---|
| Current application and interview context | Application, with Adaptation and Execution owning their portions |
| Opportunity evaluation context | Opportunity |
| General identity maintenance and positioning | Durable Identity and Identity Representation |

Operational state may change rapidly and may be discarded when no longer useful.
Meaningful outcomes become **Records**. Operational noise — portal retries, dropdown errors, captcha
events, transient failures — becomes neither a Record, nor Durable Identity, nor PCI.

The Career Workspace may surface and compose information. **It must never become a competing durable
source of truth.** There is no Career Workspace state owner or required package.

## 4. Translation

> **Governed by [ADR 0031](architecture/adr/0031-identity-router-translation-application-pci.md).**
> **Opportunity now sits upstream of Translation**, with **Router** between them selecting the
> starting Representation. Translation contains **Adaptation**, **Execution** and **Interview
> Intelligence**. Where this section describes Opportunity as a Translation authority, ADR 0031
> governs; its ownership statements about Opportunity, Adaptation and Execution remain accurate.

Translation owns immediate contextual action: it computes the opportunity-specific delta from the
selected Representation, carries the intended application through the external system, and handles
interview stages.

> **Aᶜ = T(E, X, L, C, Pᵢ)**  ·  `Pᵢ` optional

Adaptation's translation function `T` reads the four canonical inputs — Explicit State, Stated Context, Learned State,
and the current opportunity/task context `C` (ADR 0011) — and produces **Adapted State Aᶜ** for that
context. It may also take `Pᵢ`, an **optional** Identity Representation prior describing how the
person generally positions themselves in this domain (ADR 0016). `Pᵢ` never substitutes for the
canonical inputs and never narrows them: it carries preferences, not evidence.

- **`C` is temporary and external to Durable Identity.** Its semantic owner retains it.
- **Adapted State is temporary, derived and plural.** It is discarded rather than promoted, and never
  becomes a durable identity component. Regenerating it from inputs alone loses nothing *until* a user
  edit or a governed stage insight enters it — those are the user's decisions, and are not regenerable.
- **Adaptation mutates no canonical state.** Not E, not X, not L. Anything written to those inputs is a violation.

If a contextual interaction produces something that should last, it becomes a **Record** for the
slower loop, or a **user-authored** change to E or X. Never a write on the adaptation path.

It may select evidence, adapt CVs, draft answers, adapt voice, prepare interviews, provide contextual
recommendations, and support portal execution.

> **The user owns intent. Joby owns translation and administration.**

Joby decides how to phrase, arrange, select and format. It does not decide what the person wants,
what they will claim about themselves, or what they are willing to disclose.

**The Translation Layer must not mutate Explicit State merely because contextual representation changed.**
Editing a tailored CV changes the current Adapted State behind it — wording, emphasis, positioning,
ordering, inclusion, or how one experience is interpreted here — so later representations stay
consistent. Changing what is true about the person is a separate, explicit act.

### 4.1 Semantic ownership inside the Translation Layer

Opportunity owns evidence, understanding, person mapping and relationship evaluation. Adaptation
owns contextual representation. Execution owns submission attempts, external-system interaction and
mechanical feedback. The Translation Layer itself owns nothing and is not a deployment boundary.

Adaptation is a semantic authority for contextual representation. It is separate from Durable
Identity and Identity Representation.

Its authority is limited to temporary contextual state for the active application cycle: the
assembled Adaptation Context, informational conflicts, Adapted State, representation state and
drafts, the user's operational edits, and stage-specific contextual interpretation. These may be
retained for continuity, but they remain temporary and never become `E`, `X` or `L` by persistence
alone.

#### Written representation — UC10, UC11 (ADRs 0021, 0022)

> **The user owns meaning and intent. Joby owns translation.**

An application answer or a cover letter renders from four inputs:

```
Representation = Render(
    Adapted State,             the authority for every professional claim
    Surface Context,           the question, the limit, the format, the opportunity
    Representation References, how this person writes — never a fact
    Application-Specific Input what Joby cannot safely infer, and therefore asks for
)
```

**Representation References** are persistent user-owned expression material — writing samples,
previous letters and answers — Identity Representation-owned and, like a professional source, **never canonical
identity** (ADR 0021). Nothing reconstructs from one, and no claim may cite one as its grounding.

**Elicitation over fabrication** (ADR 0022). Where meaningful intent, motivation, disclosure or
context is missing, Joby **asks**, and keeps asking until it can generate without inventing. The
satisfaction gate's algorithm is deliberately unresolved; the invariant is not.

**Fit is not motivation.** That a role suits someone is not evidence that they want it, and writing
enthusiasm they never expressed is a lie in the first person — the cost of which lands on them, in an
interview.

Generated material is a **draft**; the person may change wording, emphasis, evidence, positioning,
ordering, inclusion and tone, and none of that touches Explicit State or PCI. On submission it
becomes immutable history in the Application Record — the artifact, its framing, the evidence used,
meaningful edits, the question, later progression — and **not** every attempt or micro-edit.

Afterwards, progression is **observational**:

```
Progression ≠ proof the representation caused success
Rejection   ≠ proof the representation caused failure
```

Read at the application-package level, never as proof a sentence caused an outcome. One edit, one
application or one outcome never establishes a permanent learned preference.

#### Module 1 — making one opportunity legible (ADR 0018)

Before any professional adaptation happens, Adaptation turns an opportunity and what the person has
said about their situation into something they can read:

```
Pᵢ(Eₜ) + C_opportunity + C_user → Adaptation Context
```

The context holds **references and revisions only**, and re-derives everything on read — so an edited
condition simply shows up next time, with nothing to refresh and nothing to go stale.

The comparison has **four** outcomes, because the two silences are different questions:

| | |
|---|---|
| **aligned** | both stated, and they match |
| **conflict** | both stated, and nothing matches — both sides shown, with the person's own note |
| **uncertain** | the person stated a condition and the posting did not answer it — **the thing to ask about** |
| **neutral** | the posting states something they have no view on — information about the role |

**A missing user condition stays unknown.** Never assumed acceptable, never assumed a problem.
`C_user = Retrieve(Xₜ)`, never `Infer(CurrentMoment)`. Comparison is normalised text and nothing
cleverer: a near-miss stays a conflict, because a wrong match is invisible to the person it misleads.

**Conditions only** — whether the person suits the role is Opportunity Evaluation, and it belongs to
Opportunity. And throughout: `ConstraintConflict ≠ ApplicationBlock`.

The authority around it remains unchanged:

- **Durable Identity** supplies a broad canonical snapshot of `E`, `X`, `L`, provenance and
  visibility, read-only. It does not pre-select evidence for a role — **contextual relevance
  selection lives inside Adaptation** (ADR 0013).
- **Opportunity** supplies structured, attributed opportunity/company/role understanding and retains
  all Opportunity Evaluation authority. It does not decide which of the person's evidence is best.
- **Application** supplies the current task/workspace context, owns application lifecycle and the
  Application Record, and freezes the actual submitted representation into it.
- **Memory** receives no draft, conflict, representation edit or stage insight as a learning signal.
  Only later meaningful real-world Records enter the slower loop.

The app runtimes compose these seams. Adaptation does not import Opportunity or Application internals, which
avoids a module dependency cycle and prevents a composition root from becoming an undocumented owner.

### 4.2 The application cycle: record, adapt, learn

The **Application Record** is the durable temporal spine of an application cycle and is
Application-owned. It accumulates what actually happened — created, applied, assessment, interview,
further rounds, offer/rejection/withdrawal. Submitted CVs, submitted answers, communications and
other externally completed actions become **immutable historical reality** in it.

**Adapted State continues across the active cycle** as the current stage-specific contextual state.
Before submission it is primarily system-generated contextual adaptation with optional user edits.
After submission each stage enriches it, and its role shifts from representation to preparation and
interpretation.

Two different things arrive from a later stage, and they are governed differently (ADR 0013):

```
Factual result -> Application Record -> may automatically become Adapted State input
System insight -> user: accept | edit | decline | challenge -> Adapted State
```

An accepted or edited stage insight remains **operational Adapted State**. It does not automatically
become PCI; only the Slower Learning Loop concludes anything about the person.

```
Application Record = what happened
Adapted State      = current contextual response to what has happened
Memory / PCI       = what accumulated resolved history eventually justifies learning
```

> **Joby acts quickly, records continuously, and learns slowly.**

Deliberately deferred, and not to be hardened by an early slice: exact result-vs-insight
classification rules, retention/versioning of prior Adapted States, the Adaptation → Memory handoff,
persistence mechanics, and refresh triggers.

## 5. Two Timescales

Joby runs two loops at different speeds. Keeping them separate is what stops live professional
pressure from rewriting who Joby thinks the person is.

### 5.1 Fast Operational Loop — adapt the current Application

React to live professional contexts using the **current** Durable Identity, including held Personal
Career Intelligence, as a baseline.

```
Career Workspace + Opportunity → Adaptation → Execution → current Application
```

Used during opportunity evaluation, applications, portal execution, interview preparation, recruiter
communication, networking, development activity, and other live professional contexts.

It may adapt current Application state and state owned by Translation Layer authorities rapidly. It **must not casually rewrite long-term Learned
State** — a live interaction produces evidence; it does not get to conclude.

Inside the Translation Layer, the fast loop preserves three information seams (ADR 0029):

```text
Opportunity Intelligence → Application Intent → external action → Fast Feedback
       Opportunity           Adaptation          Execution       ↘ Opportunity / Adaptation
```

Only semantic external observations cross back as Fast Feedback. Portal retries, captchas, selector
failures and other mechanical facts remain inside Execution. Information crossing a seam grants no
write authority: Opportunity, Adaptation and Execution each mutate only their own state.

### 5.2 Slower Learning Loop — adapt Joby's future expectations

Aggregate meaningful evidence across many professional experiences, and update Personal Career
Memory **only when the evidence justifies changing the learned model**.

```
Records₁…ₙ → evidence aggregation → pattern evaluation
  → Observed / Inferred / Hypothesized → PCIₜ₊₁ → Durable Identityₜ₊₁
```

It may consume applications, interviews, recruiter feedback, user edits, projects, work experiences,
professional interactions, outcomes, development experiences, and explicit corrections.

It must aggregate across evidence, distinguish signal from noise, preserve
`Observed`/`Inferred`/`Hypothesized`, avoid overlearning from single outcomes, and update PCI only
when the evidence justifies it.

**It does not learn from operational noise** — portal retries, dropdown mismatches, captcha events,
transient UI failures. Those are mechanics, and they say nothing about the person.

**Resolved Application history is the application interface between the loops.** Application
preserves it; Career Memory consumes it. Live Translation state does not cross.

### 5.3 The application slow path

For applications, that Record is **resolved Application history**, and the path is one-directional
(ADR 0027):

```text
Opportunity → Adaptation → Execution         (Translation Layer, fast loop)
                    ↓
        resolved Application history          Application — immutable, meaningful
                    ↓
             Career Memory                    interpretation across many histories
                    ↓
                   PCI                        justified slow output, held by Durable Identity
                   └──────────→ future Opportunity + Adaptation priors
```

**Application is the temporal handoff.** It preserves the meaningful Translation state actually
used — the Opportunity Intelligence relied upon, the Application Intent and representation state
acted upon, and the final Execution/submission state that crossed the external boundary — plus later
factual outcomes. Preserving is not authority: Application snapshots what happened and mutates no
Translation state.

**Career Memory never consumes live Translation state.** An application in progress is a fast-loop
concern. Only history Application has already resolved may enter the slow loop, which is what stops
learning from inheriting operational speed.

**Mechanical execution detail is excluded by default.** Retries, selectors, dropdown failures,
captchas and transient portal errors describe a portal, not a person. One enters resolved history
only where a use case explicitly establishes it became meaningful — never because it was logged.

**Nothing flows back up.** Career Memory does not rewrite past Applications, Translation state,
Durable Identity or Identity Representation. Its output is a justified *proposal*; Durable Identity
records the resulting person-state through its own governed boundary, and a generalized lens
improvement stays a proposal to the user.

**PCI returns as a prior, not as a write.** Future Opportunity and Adaptation work reads held PCI through
Durable Identity's public read boundary. Career Memory writes neither module.

## 6. Opportunity and Trajectory Evaluation

Opportunity answers two different person × opportunity questions, and collapsing them loses the
more valuable one:

> **Can I plausibly enter this role?** — current fit.
>
> **Is entering this role likely to move me toward a valuable next professional state?** — trajectory.

An opportunity is a **potential state transition**, not just a thing to be matched against.

Evaluation dimensions: Current Fit · Evidence Fit · Orientation Alignment · Development Value ·
Constraint Relevance · Trajectory Alignment · Opportunity Cost · Uncertainty.

**These are not collapsed into one universal numeric fit score.** A single number hides exactly the
tension a placement student needs to see — the reachable role that leads nowhere versus the harder
role that opens a path. Collapsing them would need its own accepted decision.

## 7. Baseline Identity State

> **A minimally sufficient, user-verified representation of who the person is now and where they
> currently intend to go, before Joby has accumulated enough evidence to meaningfully learn them.**

Every new user starts here.

```
State 0 = Sparse Durable Identity + Explicit Direction + Minimal Priors
```

```
Durable Identity₀
├── Explicit State
│   ├── Structure — institutions, organisations, programmes, roles, periods
│   ├── Activity — sparse (contribution, capability, consequence)
│   ├── Relations — a small typed vocabulary between them
│   └── provenance for every confirmed fact, and the captured sources
└── PCI₀
    ├── very limited learned preferences
    ├── low-confidence hypotheses
    └── generic/default priors where required

Durable Identity-owned Stated Context₀
└── current user-stated operating conditions; fields may be absent
```

### The governing rule

> **Joby may know little, but what it claims to know should be grounded.**

### Career Direction at State 0

Explicit user input — placement type, role families, industries, functions, geography, company
preferences, longer-term ambitions, known constraints.

It represents **where the user currently believes they want to go.** It is not an inferred permanent
trait, and it may change as the user changes. Treating a stated direction as a fixed characteristic
is a doctrine violation.

### PCI at State 0

Intentionally sparse. **Joby must not pretend to have learned patterns that do not yet exist.**

Early evaluation and recommendation rely primarily on Explicit State, stated direction, observable
evidence, and generic system priors where necessary. Uncertainty stays explicit internally and is
surfaced to the user when consequential.

### Evidence-proportionate claims

| Justified at State 0 | Not justified until evidence accumulates |
|---|---|
| "This placement appears technically aligned with your existing projects." | "You consistently thrive in this kind of environment." |

The second requires accumulated career evidence. Producing it early is a doctrine violation, not a
matter of tone.

## 8. The First User Loop

A new user begins in the Baseline Identity State. An Opportunity enters Joby.

```
Opportunity
      +
Durable Identity₀
      ↓
Career Workspace
      ↓
Opportunity understanding and evaluation
      ↓
Adaptation → Execution
      ↓
current Application
```

Evaluation covers all eight dimensions (§6) — and at State 0 several of them will honestly be
"not enough evidence yet". That is a designed, presentable outcome, not a failure.

## 9. Progressive Resolution

Joby's understanding gains resolution as evidence accumulates:

```
State 0   explicit identity + stated direction + weak priors
   ↓ experience
State 1   explicit identity + early learned patterns
   ↓ repeated evidence
State 2   higher-resolution PCI + stronger trajectory understanding + emerging constraint model
   ↓ career experience
State n   rich longitudinal Durable Identity
```

> **Joby begins mostly knowing what the user tells and proves to it, then earns the right to infer
> more over time.**

Conceptual, not a numeric state machine. No thresholds, no confidence formulas, no statistical
machinery — those would need their own decision.

### What the user should feel

| When | Experience |
|---|---|
| At first | *Joby understands what I have told it and what I can prove.* |
| After several applications and interactions | *Joby remembers how I represent myself and what seems to work.* |
| After repeated career experiences | *Joby understands patterns in how I perform, develop, and move through the market.* |
| Over the long term | *Joby increasingly understands where I am, what is constraining me, and which opportunities may move me toward a stronger next state.* |

**The system must never fake later-stage intelligence during early use.**

## 10. The Whole Model

```
Person
  ↓
Durable Identity                    D = (E, X)   truth about the PERSON
  ├── Explicit State                E = (Structure, Activity, Relations)
  └── Stated Context                X_t = current user-stated operating conditions

Memory / PCI                        learned model of PERSON × WORLD  (ADR 0030)
  └── PCI                           independent; not a Durable Identity component
  ↓
Career Workspace ── Durable Identity + Identity Representation
  ↓
Translation Layer ── Opportunity + Adaptation + Execution
  ↓
Application ── live interaction + resolved history
  ↓
Career Memory ── slow interpretation
  ↓
Higher-resolution PCI
  ↓
Higher-resolution Durable Identity
```

## 11. Terminology

Terms are load-bearing. Do not use them loosely; do not invent synonyms.

- **Person** — the subject of Joby. The unit of the system. Created with the first professional source captured.
- **Unclaimed Person** — a Person nobody has yet proven they are the subject of. May build and inspect their profile; may not act outward or accumulate.
- **Account Claim** — verifying an email address against a Person. Authentication, never Durable Identity. Distinct from **Claim** below, which is about evidence.
- **Durable Identity** — the persistent professional model of the person. Explicit State + Learned State.
- **Explicit State (E)** — reconstructed professional reality: **E = (Structure, Activity, Relations)**, plus provenance and captured sources. User-owned, inspectable and confirmed.
- **Stated Context (Xₜ)** — persistent current user-stated professional operating context. Durable Identity owns it canonically; only explicit user create/change/removal changes it. Missing remains unknown. It is distinct from E, L, Aᶜ and Opportunity Context.
- **Identity Representation (Vᵢ)** — **Eₜ + Decisionsᵢ → Vᵢ**. A persistent, reusable, **non-canonical** named positioning lens over Explicit State ("Markets"). Stores the lens and decisions about canonical facts — include/hide, order, emphasis, wording — and projects the content at read time. General positioning, never opportunity-specific, and not a claim about the person.
- **Positioning decision** — one choice about one canonical fact in one lens. Names the fact; copies nothing from it. Hiding is a prior, not a boundary.
- **General CV** — a lens materialized: `CvDocument → LaTeX → PDF`, derived on request, reusable across every opportunity in that domain. Not an application, and not an Application Record artifact.
- **Adaptation prior (Pᵢ)** — a lens offered to Adaptation: themes plus preferences keyed by canonical node id, carrying **no professional evidence**. Optional, and never a substitute for the canonical snapshot.
- **Adapted State (Aᶜ)** — the contextual product of **Aᶜ = T(E, X, L, C)**. Temporary, derived, outside Durable Identity. Continues across the active application cycle as the current **stage-specific** contextual state, and is discarded rather than promoted.
- **Application Record** — the durable temporal spine of one application cycle, Application-owned. What actually happened, in order, with everything externally completed frozen immutably.
- **Stage insight** — a system-generated interpretation of a later application stage. Reaches Adapted State only through user **accept / edit / decline / challenge**, and never becomes PCI automatically.
- **Structure** — the durable professional contexts a life is organised into: institution, organisation, programme, role, engagement, period.
- **Activity** — what the person did: **aᵢ = (Contributionᵢ, Capabilityᵢ, Consequenceᵢ)**. Any subset is valid.
- **Relations** — typed links between Structure and Activity. A small vocabulary that grows only when a query needs it. Written in full in prose; `R` is used only in the mathematical tuple `E = (S, A, R)`.
- **Professional Source** — material a person gives Joby to reconstruct from: a CV, a described project, selected GitHub repository metadata, a portfolio link. Bootstrap or enrichment material, **never canonical identity**.
- **Permanent Identity View** — Education, Experience, Projects, Skills, Achievements and Evidence, projected from Explicit State at read time. Stores nothing.
- **Reconstruction** — turning a professional source into *proposed* Explicit State. Eₜ₊₁ = Reconstruct(Eₜ, Uₜ, Sₜ). Increases resolution; never replaces the ontology, never becomes canonical without confirmation.
- **Learned State / Personal Career Intelligence (PCI)** — what Joby has learned about the person over time. Evidence-backed, status-tagged, slow-moving.
- **Career Workspace** — the product umbrella over Durable Identity and Identity Representation: what the person maintains about themselves and how they are generally represented. It owns no state itself.
- **Baseline Identity State** — the starting condition of every new user: sparse Durable Identity + explicit direction + minimal priors.
- **Career Direction** — where the user currently believes they want to go. Explicit input at State 0, not an inferred trait.
- **Living Document** — a maintained artifact surfaced in Career Workspace.
- **Translation Layer** — the product umbrella over Opportunity, Adaptation and Execution. It owns no state and implies no deployment boundary.
- **Opportunity Intelligence** — what Opportunity currently understands and believes about this person × opportunity; information, not a separate semantic module.
- **Contextual representation** — a rendering for a specific audience (a tailored CV, an answer), produced from Adapted State. Derived, temporary, never authoritative. Say the full term: an **Identity Representation** is the persistent lens above, and the two are different objects.
- **EvidenceItem** — a discrete, traceable fact with provenance.
- **Claim** — an assertion made on the person's behalf. Every claim traces to evidence. Not an Account Claim.
- **Epistemic Status** — `Observed` | `Inferred` | `Hypothesized`. Never collapsed.
- **Record** — a durable, meaningful account of something that happened (e.g. an Application Record). The interface between the two loops.
- **Application Record** — an immutable record of what was actually submitted, when, and in what form.
- **Session State** — temporary working context. Never confused with Durable Identity.
- **Opportunity** — something a person could pursue. A job posting is one kind of source for one, not the thing itself.
- **Young Professional Graph** — a product concept whose module ownership must be decided before implementation; there is no Network module in Joby Core.

## 12. Joby Core Module Responsibilities

| Module | Owns |
|---|---|
| **Durable Identity** | Explicit State, user-authored Stated Context, source provenance and held Learned State/PCI. It is the only module that writes canonical person-state. |
| **Identity Representation** | Persistent non-canonical positioning lenses, their decisions, user-owned expression references and general reusable materializations. It never writes person-state. |
| **Translation Layer** | **Nothing of its own.** A product umbrella over Opportunity, Adaptation and Execution; not a state owner or deployment. |
| — **Opportunity** | Opportunity evidence, understanding, mapping to the person and evaluation. Capture and understanding are currently split across two implementation partitions. |
| — **Adaptation** | Opportunity-specific representation decisions: Adapted State, evidence selection, contextual drafts, elicited input, operational user edits and stage-specific representation. |
| — **Execution** | Carrying intended applications through external systems and reacting to mechanical feedback. Only type-level Application Intent and Fast Feedback seams are implemented. |
| **Application** | The live and historical career interaction: intent, lifecycle state and the immutable **Application Record**, including resolved history preserving meaningful Translation state. |
| **Memory** | Meaningful Records, evidence accumulation, `Observed`/`Inferred`/`Hypothesized` handling, longer-term pattern interpretation and conservative slower-loop learning. It consumes **resolved** Application history, never live Translation state, and proposes justified learned changes through Durable Identity's public interface. It rewrites nothing upstream. |

Every module exposes a public interface and owns its tables. No module imports another module's
internals or reads or writes another module's tables. These are semantic boundaries inside one Joby
Core, not deployments. **Enclosure inside the Translation Layer grants no extra access.**

ADR 0029 settles the former Intelligence/Opportunity and Execution/Application/Portal conflicts.
Information crosses public capabilities; only the semantic owner mutates its state. It retains the
Opportunity Intelligence, Application Intent and Fast Feedback without adding behavior. **ADR 0029**
fixes the downstream direction: Application resolves and preserves meaningful Translation history,
Career Memory consumes only that, and PCI returns to Opportunity and Adaptation as a prior read
through Durable Identity. Development remains a product
concern expressed through Opportunity and Memory behavior, not a separate architectural module.
Network-oriented product behavior has no implemented owner; it must be assigned to a canonical
semantic authority by an ADR before implementation rather than recreating an additional module implicitly.

## 13. Current Strategic Wedge

**University placement students.**

_Why this wedge, what it demands, and what it excludes — to expand._

## 14. Product Principles

1. Person-centric, not application-centric.
2. Career Workspace owns no state. Durable Identity owns truth; Identity Representation owns general positioning.
3. Explicit State is separate from contextual representation.
4. Generated claims trace back to evidence.
5. AI proposes; it never silently modifies Explicit State.
6. Observed / Inferred / Hypothesized stay distinct.
7. Application, Adaptation, Execution and session state are separate from Durable Identity.
8. The user controls consequential claims and sensitive disclosures. **They alone author Stated Context**, and **constraint conflicts inform rather than block.**
9. Application Records preserve what was actually submitted.
10. Operational speed and longitudinal learning run at different timescales, and the fast one does not rewrite the slow one.
11. Claims are proportionate to evidence. Joby never fakes later-stage intelligence during early use.

## 15. Major Assumptions

Assumptions that, if wrong, change the product. Each should eventually carry a way to be tested.

_To expand._

## 16. Current Breadth and Depth

Breadth spans the canonical semantic authorities. Depth is deliberately uneven.

| Module | Depth |
|---|---|
| Application | VERY HIGH |
| Memory | VERY HIGH (underneath — infrastructural, not surfaced) |
| Durable Identity | HIGH |
| Identity Representation | HIGH |
| Adaptation | HIGH |
| Opportunity | MEDIUM |
| Execution | TYPE CONTRACTS ONLY |

This distribution is a strategy, not an accident: Joby is deep where the placement student's pain is
acute and shallow where it is not yet earned.
