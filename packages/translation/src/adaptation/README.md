# Adaptation module boundary

> **ADR 0029 ownership:** Opportunity owns opportunity/person understanding and the
> relationship mapping. The former UC02–UC04 condition mapping moved there unchanged. Adaptation
> consumes that information and owns only the representation decisions made from it. Older module
> numbering below describes the preserved use-case flow, not semantic ownership.

Adaptation's fast-loop public types consume `OpportunityIntelligence`, produce `ApplicationIntent`,
and consume context-addressed semantic `FastFeedback`. They are information contracts only: no
Execution or Opportunity state can be mutated through them.

This directory is the implementation home of Joby's **Adaptation** semantic authority. Adaptation is
not part of Durable Identity and not a deployment. It sits in the **Translation Layer** alongside
Opportunity and Execution. That umbrella owns nothing of its own, and the other authorities remain
external to Adaptation. Nothing about Adaptation's behaviour, authority or public
surface changed when it moved out of `packages/identity`. See
[ADR 0029](../../../../docs/architecture/adr/0029-career-workspace-translation-application-career-memory.md)
(module topology),
[ADR 0013](../../../../docs/architecture/adr/0013-adapted-state-across-the-application-cycle.md)
(read boundary, application-cycle lifespan, stage-insight governance) and the
[Adaptation Module Product Doctrine](../../../../docs/product/adaptation-module-doctrine.md).

**Module 1, Context Interpretation (UC01–UC04), is implemented** (ADR 0018). It creates a temporary
context from authoritative references, arranges Opportunity's attributed opportunity understanding,
retrieves current Stated Context through a read-only Identity port, and surfaces the intersection. It
performs no evidence selection or professional adaptation; those start in Module 2.

## Module 1 — what the context shows

The context stores **references and revisions only** and re-derives everything on read, so an edited
condition appears next time with no refresh path and nothing to go stale.

| Outcome | When | Why it is separate |
|---|---|---|
| **aligned** | both stated, and they match | |
| **conflict** | both stated, nothing matches | Named plainly, both sides shown, note included |
| **uncertain** | the person stated a condition and the posting did not answer it | **The actionable unknown** — ask before applying |
| **neutral** | the posting states something they have no condition about | What the role says; nothing to reconcile |

The two silences are deliberately different categories. Merging them either buries the questions
worth asking, or treats a person's silence as acceptance. **A missing user condition stays unknown:**
never assumed acceptable, never assumed a problem.

Comparison is **normalised-text equality and nothing cleverer**. "Greater London" does not silently
satisfy "London" — a near-miss stays a conflict, because a wrong match is invisible to the person it
misleads. Opportunity's own uncertainty about the posting and the person's free-text constraints
travel through verbatim, unmapped onto any kind.

**Conditions only.** Whether the person suits the role is Opportunity Evaluation and belongs to
Opportunity (ADR 0007). Required capabilities are carried for later modules and compared against
nobody.

```text
ConstraintConflict ≠ ApplicationBlock
```

`blocksApplication: false` is a field on the output so a consumer reads it rather than assuming the
opposite. Nothing filters, disables, ranks or gates.

## Module 2 — Context Adaptation (UC05–UC08, ADR 0019)

```text
P_i(E_t) -> Assess -> Recover(E_t, C) [optional] -> A^C

P_i(E_t) = default adaptation surface
E_t      = authoritative fallback reservoir
```

**Representation-first.** Adaptation begins from the lens the person selected and consults Durable
Identity only where the lens does not expose something this opportunity asks for. It does not
re-solve the whole identity per posting — that would make the lens decorative, and the lens is the
thing the person actually maintains.

```text
normal      P_i(E_t) + C -> A^C                       recoveryUsed: false
fallback    P_i(E_t) + C -> Recover(E_t, C) -> A^C    recoveryUsed: true
```

**Relevance is canonical capability equality, and nothing cleverer.** An element speaks to a
requirement when the activity's own `Capability` component matches it under normalisation. No
synonyms, no substring guessing, no similarity: "your rota scheduler shows Python" must mean the
person confirmed Python on that activity. An ask nothing in their history records comes back as
`unevidenced` — thin evidence is a real answer, and inventing one is the failure this whole
architecture exists to prevent.

**Assessment is representational, not evaluative.** It judges what the lens exposes, understates or
is silent about. It produces no score, rank, fit judgement or pursue verdict — that is Opportunity
Evaluation, and it belongs to Opportunity (ADR 0029).

**Recovery is gap-driven and capped.** Evidence that speaks to nothing this opportunity asks about is
never pulled in, however impressive. Recovered material arrives exactly as Explicit State records it,
carrying `origin`, `nodeId`, `canonicalTitle` and a rationale.

**Nothing is mutated and nothing is dropped.** Recovering evidence a lens hides does not un-hide it;
an element this posting ignores stays in `A^C`, ordered behind what it asks about.

**`A^C` is composed on request, never stored.** So it cannot drift, and ADR 0013 §10's retention,
refresh and versioning questions stay deferred. The trigger to revisit is precise: **user edits
(UC12)** — an edit cannot be recomputed from inputs, and persistence becomes necessary the moment one
exists.

No CV, answer or narrative is rendered here. That is Module 3.

## UC09 — the CV representation path (seam only, policy deferred)

Whether an application should **reuse** the lens's general CV, **adapt** it for this opportunity, or
produce a **distinct** role-specific document is an **open product decision**. It is not made here.

What exists is a replaceable seam — `CvRoutingPolicy`, asked through `resolveCvPath` — so Module 3
does not decide inline and harden a policy nobody chose:

```text
CvRepresentationPath = 'reuse' | 'adapt' | 'distinct'
```

The default `ProvisionalCvRoutingPolicy` returns one constant and marks the answer
`provisional: true`. **It decides nothing:** a test asserts the answer does not change with recovery,
gaps or a missing lens, because a condition that varied the path would be the product decision,
invented rather than made.

Deliberately absent until that decision exists, and not to be added in passing: routing variables,
thresholds, weights, confidence values, scoring, calibration, or a heuristic presented as product
truth.

The path is **not** part of Adapted State. Asking the seam separately is what lets a future policy
arrive without redesigning `A^C` or the rest of Context Representation.

## Module 3 — written representation (UC10, UC11)

**UC10 and UC11 are implemented** (plan `015`). `SatisfactionGate` and `ReferenceSelectionPolicy` are
**replaceable boundaries with provisional defaults** that report `provisional: true`; the CV path
(UC09) and the Memory attribution below remain unbuilt.

> **User owns meaning and intent. Joby owns translation.**

```text
Representation = Render(
    AdaptedState,              the authority for every professional claim
    SurfaceContext,            question, limit, structure, format, opportunity
    RepresentationReferences,  how this person writes (ADR 0021) — never a fact
    ApplicationSpecificInput   what Joby cannot safely infer, and therefore asks for
)
```

**Elicitation over fabrication** (ADR 0022). Where meaningful intent, motivation, disclosure or
context is missing, Joby asks and keeps asking:

```text
Assess -> ask if necessary -> incorporate -> reassess -> gate
                                              ├── insufficient -> keep asking
                                              └── sufficient   -> generate

SatisfactionGate(...)                = PLACEHOLDER
ResolveReferenceConflict(...)        = PLACEHOLDER
RepresentationPerformanceSignal(...) = PLACEHOLDER
UpdateRepresentationLearning(...)    = PLACEHOLDER
```

**None of those four may be invented in passing.** No thresholds, no confidence values, no
completeness scores.

The **provisional gate** asks only for what is structurally underivable — a cover letter's motivation
and timing, a question that asks why, a disclosure — and reports an unsupported competency rather
than eliciting it. Its safe failure is to keep asking, and the loop has no cap. The **provisional
reference selection** orders the closest surface first and establishes no precedence.

Writer output is **untrusted input**, like extractor output: `validateDraft` refuses a segment citing
a node outside `A^C`, a motivation the person never gave, an ungrounded assertion, or a draft over a
stated limit. Nothing malformed is stored.

**Fit is not motivation.** A cover letter's *why this opportunity* and *why now* are the person's and
are asked for; only *why this person is relevant* comes from Adapted State. Converting a good match
into stated enthusiasm is fabrication in the first person, and the cost lands in an interview.

Elicited information belongs to this opportunity's context. It never becomes Explicit State or PCI on
its own. Generated material is a **draft** until submitted; on submission Application's Application
Record preserves the artifact, its framing, the evidence used, meaningful user edits, the question
and later progression — **not** every attempt or micro-edit.

Progression afterwards is **observational** evidence at the package level, never proof that a
sentence caused an outcome, and Adaptation cannot write PCI at all.

## Until Opportunity understanding exists

Adaptation **never reads a job description** — that is opportunity understanding, and it is
Opportunity's authority. The consumer port is the only way structured meaning arrives.

Until Opportunity is built, `apps/api` holds an in-memory stand-in that accepts *structured*
understanding and rejects raw posting text. It persists nothing, and it is one file that is deleted
when Opportunity's adapter is wired in its place. Nothing in this module changes when that happens.

## Signature

```text
A^c = T(E, X, L, C)
```

Adaptation reads versioned Explicit State, Stated Context, Learned State and current task
context. It writes none of them.

## Authority

Adaptation may own only temporary contextual artifacts, for the lifetime of the active application
cycle:

- Adaptation Context and its input references/revisions;
- informational conflicts;
- Adapted State;
- representation state and drafts;
- operational user edits;
- stage-specific contextual interpretation.

If continuity or asynchronous model work requires persistence, it belongs in explicitly temporary
Adaptation-owned `adaptation_*` storage. Persistence never promotes it into Durable Identity.

## Consumed inputs

| Authority | Consumed through | Adaptation may do |
|---|---|---|
| Identity | read-only interface, **broad canonical snapshot** | select and reinterpret confirmed truth while preserving provenance and visibility |
| Identity Representation | the Identity contract, read-only | start from the reusable positioning the person already keeps — never write one, never read its projection *instead of* canonical truth, never treat what it hides as unavailable |
| Opportunity | consumer-side opportunity-context port, wired in an app composition root | consume attributed role/company/opportunity understanding; never consume a fit verdict as representation truth |
| Application/caller | task/workspace reference, current surface, and recorded **factual** stage results | tailor output to the current stage without taking over the lifecycle or the record |
| User | explicit representation choices, edits, and dispositions on system insights | change temporary framing, wording or interpretation without implying a durable correction |

**The read is broad; the authority is not** (ADR 0013). Identity exposes what is true and must not
pre-select evidence for a role — `Selected(E_t | C)` happens here. A broad snapshot widens scope,
never write access, and source visibility must survive it.

**An Identity Representation is a lens, not a shortcut** (ADR 0014):

```text
Markets Identity Representation (V_i) + Barclays Markets JD (C) -> Barclays Markets Adapted State
```

A representation says how the person generally positions themselves in a domain — what they lead
with, what they set aside, how they word things. It does not say what is true, and it does not narrow
what Adaptation may read. Reading its projection *instead of* canonical `E_t` would be translating a
translation. Opportunity-specific selection, ordering, emphasis and wording stay in Adapted State for
that cycle — Adaptation never writes back into a lens.

**A lens is a strong prior, not an evidence boundary** (ADRs 0015, 0016):

```text
A^C = T(E, X, L, C, P_i)      P_i optional

HiddenInLens   ≠ UnavailableToAdaptation
PriorityInLens ≠ CanonicalImportance
```

`P_i` arrives through `getRepresentationPrior` on the Identity contract: themes, and preferences
keyed by canonical node id — suggested inclusion, suggested priority, emphasis, the person's reusable
wording. **It carries no professional evidence.** A prior alone cannot tell you what any node *is*,
which is precisely what stops `A^C = T(V_i, C)` from being written by accident. A hidden fact appears
in it marked `suggestedInclusion: false`, never as an absence.

When a specific role makes normally de-emphasised evidence locally useful, Adaptation recovers it
from the broad canonical snapshot and promotes it **for that opportunity only**. The lens does not
change: one application does not get to rewrite how someone generally presents themselves. Treating a
lens as the set of usable evidence is a doctrine violation, not a shortcut.

`P_i` is optional throughout. Applying to something outside every lens a person keeps is a normal
case, and Adaptation must work with no prior at all.

Adaptation must not import Opportunity or Application internals. The composition root imports both
sides and wires their public interfaces.

```text
Opportunity understanding ------------------adapter--> Adaptation consumer port
Durable Identity (E, X, L, provenance) ------broad read--> Adaptation
Application task context -----------------------------> Adaptation
Application <-------------- representation reference -- Adaptation
Application --submitted copy--> Application Record
Application Record --factual result-------------------> Adaptation (context input)

No internal import: Adaptation -X-> Durable Identity, Opportunity, Application, Memory internals
```

## The application cycle

Adapted State continues across the active application cycle as the current **stage-specific**
contextual state.

- **Pre-application** — primarily system-generated contextual adaptation (selected evidence,
  positioning, framing, wording) with optional user edits.
- **Submission boundary** — the working representation leaves through Application; the submitted CV,
  answers and communications become immutable historical reality in the Application Record. They do
  not change when Adapted State later changes.
- **Post-application** — each stage supplies more information, and the state shifts from
  representation towards stage preparation and interpretation.

A **user edit** — wording, emphasis, positioning, ordering, inclusion/exclusion, or how a specific
experience is interpreted here — updates the **current Adapted State**, not just one rendering, so
later representations stay consistent. It implies no change to `E_t` or `L_t`.

Two things arrive from a later stage and are governed differently:

```text
factual result -> Application Record -> may automatically become an Adapted State input
system insight -> user: accept | edit | decline | challenge -> Adapted State
```

An accepted or edited insight remains operational Adapted State. It is not PCI, and it is not
evidence for PCI.

```text
Application Record = what happened
Adapted State      = current contextual response to what has happened
Memory / PCI       = what accumulated resolved history eventually justifies learning
```

## Outputs

The current public module interface exposes only creation/read/list operations for an Adaptation Context.
The view is re-derived from Durable Identity and current Opportunity understanding on read; the
stored context contains references and revisions, not copied person or opportunity state.

Later slices may add composing/reading Adapted State, rendering representations, applying
operational user edits and recording user dispositions on stage insights. Every future contract must
carry authoritative ids, input revisions and claim provenance.

Application freezes the actual submitted representation into its Application Record. Adaptation does
not own that record and publishes no submission event.

## Hard negative boundary

Code under this directory must never:

- import Identity repositories, correction/review services or database tables;
- write `E`, `X` or `L`;
- reconstruct professional sources;
- own or score opportunities;
- decide whether the user should proceed;
- filter or gate on a constraint conflict;
- own application lifecycle, portal execution or Application Records — including writing, versioning
  or regenerating one;
- write Memory, produce PCI updates or treat edits or accepted insights as Records;
- promote a representation edit into identity, or a stage insight into PCI;
- use another generated representation as source truth;
- write, version or bind an Identity Representation to an opportunity — a generalized improvement to
  a lens is a proposal to the user through the Slower Learning Loop, never a write from here;
- treat a prior's preferences as the set of evidence it may use;
- persist a canonical CV, profile or second person model.

Representation claims must resolve to canonical Identity provenance. Thin evidence, uncertainty and
"not enough evidence" remain valid outputs.

## Deliberately deferred — do not harden

Open by decision (ADR 0013 §10). A slice that does not need one of these resolved must not resolve it
in passing:

| Deferred | What is open |
|---|---|
| Result vs insight classification | The distinction is fixed; the exact rules are not |
| Adapted State retention | Discard, snapshot or selectively preserve prior stage states; versioning |
| Adaptation → Memory handoff | Which reviewed insights, if any, travel with a resolved Application Record |
| Persistence mechanics | Tables, JSONB shapes, versioning, reconciliation, lifecycle |
| Refresh triggers | When a new application event regenerates Adapted State |
