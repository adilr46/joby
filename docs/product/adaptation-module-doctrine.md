# Adaptation Module Product Doctrine

**Placement slice - canonical product definition**

This is the repository-owned form of the supplied Adaptation product-doctrine source document,
carrying the locked decisions of the subsequent current-decision pass (2026-08-15).
It fixes product meaning and deliberately does not prescribe persistence, DTOs, endpoints or model
architecture. Semantic ownership and dependency direction are governed by ADR 0029; the
Identity read boundary, the life of Adapted State across an application cycle and the governance of
stage insights by ADR 0013.

## Position in the model

```text
D_t = (E_t, L_t)
X_t = current user-stated operating conditions
A^c = T(E_t, X_t, L_t, C)
```

- `E_t` is Explicit State: persistent, context-independent professional reality.
- `X_t` is Stated Context: persistent current user-stated operating conditions, owned by Identity
  and distinct from Explicit State.
- `L_t` is Learned State / PCI: slowly accumulated understanding from repeated resolved interaction.
- `C` is the current professional context.
- `A^c` is temporary Adapted State for that context.

Adapted State is not a third durable identity component. The governing distinction is:

- **Explicit State:** what is professionally true.
- **Learned State:** what repeated resolved interaction has taught Joby.
- **Adapted State:** how that truth should be understood and represented here.

The Adaptation module re-engineers a truthful temporary representation from persistent professional identity.
It does not edit the person into a role. Joby's inversion is:

```text
Explicit State -> Adapted State -> Contextual Representation
```

A CV is one materialisation of Adapted State, not the canonical working object.

## Context and agency

The governing question is:

> How should this person's existing professional truth be interpreted and represented in this
> context?

Opportunity context may include role, company, job description, required/preferred capabilities,
location, duration, salary, work arrangement, start date, sponsorship/work-authorisation requirements
and application questions. Relevant user context may include current intent, career direction, stated
constraints, work authorisation, availability and preferences.

For UC03, Adaptation retrieves relevant current user context from Identity and never writes it:

```text
C_user = RetrieveRelevant(X_t)
Adaptation -> Read(X_t)
Adaptation -X-> Write(X_t)
```

Context is applied to Durable Identity; it does not become Explicit State merely because it matters
now.

For the placement slice, constraint handling is deliberately lightweight:

```text
ConflictSet = DetectConflicts(K, C)
ConstraintConflict != ApplicationBlock
Pursue(Opportunity) = UserDecision
```

Joby may surface duration, location, sponsorship, work-authorisation, availability or working-
arrangement conflicts and uncertainty. It never converts them into a forced stop.

## Adaptation sequence

```text
Selection -> Interpretation -> Composition
```

### Selection

Select the parts of Explicit State relevant to the current context. Omission from one Adapted State
does not remove anything from Explicit State.

**Selection happens inside Adaptation** (ADR 0013). Adaptation reads a broad canonical Identity
snapshot rather than a role-filtered subset, because the two questions belong to different owners:

```text
Identity:   what is true?
Adaptation: what matters here?  ->  Selected(E_t | C)
```

Identity must not pre-select evidence for a particular role. A broad read is a widening of *scope*,
never of *authority*: Adaptation still writes nothing durable, and source visibility and provenance
survive selection into every rendering.

### Interpretation

Determine what selected evidence means in this context. The same confirmed Activity may support
different truthful readings for software engineering, solutions engineering or product roles. The
reading changes; the underlying truth does not.

### Composition

Assemble selected and interpreted professional material into one coherent temporary Adapted State
before rendering any CV, answer or narrative.

Adapted State is a context-dependent query/projection over Durable Identity:

```text
A^c = Q_C(E_t, L_t)
```

It is plural, context-bounded, generally regenerable and never a competing canonical profile.
Contextual interpretation remains traceable to existing professional truth.

## Representation and user edits

```text
Representation = Render(A^c)
CV_C = RenderCV(A^c)
Answer_C = RenderAnswer(A^c, Q)
Narrative_C = RenderNarrative(A^c)
```

One Adapted State may support multiple consistent application surfaces. The user retains authority
over current representation.

**A user edit changes the current Adapted State, not merely one rendered document.** This covers
edits to wording, contextual emphasis, positioning, ordering, inclusion or exclusion of a particular
experience, and how a specific experience is interpreted in this context.

```text
Joby: "Led technical development of Twyst."
User: "Built the core technical workflow for Twyst."
User: "De-emphasise Twyst and make PoseTrack the primary technical project."

A^c --user edit--> A^c'
```

Editing the state rather than the document is what keeps every subsequent representation consistent
with what the user actually decided.

An operational representation edit does not automatically imply either:

```text
E_t -> E_t+1
L_t -> L_t+1
```

Changing professional truth requires a separate Identity action. Long-term learning requires the
Slower Learning Loop.

## The application cycle

### The Application Record is the durable temporal spine

The Application Record is the durable temporal spine of the application cycle, and it is
**Application-owned**. It accumulates what actually happened:

```text
AR_t+1 = AR_t + ΔReality_t

created -> applied -> assessment/test -> interview -> further rounds -> offer/rejection/withdrawal
```

Submitted CVs, submitted answers, communications and other externally completed actions become
**immutable historical reality** there at the moment of submission. A submitted CV does not change
because Adapted State later changes.

```text
Adaptation working representation -> Application Intent -> Execution -> Application Record
```

Application owns the live interaction throughout this path. Execution carries the intent and reports
semantic observations through public capabilities; it never writes the Application Record directly.

### Adapted State continues across the cycle

Adapted State continues across the active application cycle as the current **stage-specific**
contextual state. Its role changes as the cycle moves.

**Pre-application** it is primarily system-generated contextual adaptation, with optional user edits:

```text
ADAPTED STATE
├── current context
├── contextual interpretation
└── representation state
    ├── selected evidence
    ├── positioning
    ├── contextual framing
    ├── wording
    └── optional user edits
```

**Post-application** later stages enrich it, and it shifts from representation towards stage
preparation and interpretation:

```text
ADAPTED STATE
├── current stage context
├── contextual interpretation
└── representation / preparation state
    ├── factual stage results
    └── system-generated insights
```

### Factual results enter automatically; interpretations do not

```text
Result -> Application Record -> Adapted State
```

Externally observed factual results — test score, progression to interview, interview occurred,
recruiter feedback received, final-round invitation, rejection, offer — are historical facts in the
Application Record first, and relevant ones may then automatically become inputs to the current
Adapted State.

Joby's *interpretation* of those results is not a fact and requires user agency. Every
system-generated stage insight is reviewable through exactly four dispositions:

```text
system insight -> accept | edit | decline | challenge
```

Only a reviewed insight becomes part of the user's current operational Adapted State. An accepted or
edited insight remains operational Adapted State and **does not automatically become PCI**.

### Fast adaptation, continuous record, slow memory

```text
Application Record = accumulated reality
Adapted State      = current contextual response to reality
Learned State/PCI  = slow interpretation across resolved reality
```

> Joby acts quickly, records continuously, and learns slowly.

## Separation from Opportunity Evaluation

```text
Adaptation: A^c = T(E, L, C)  -> How should I represent myself here?
Evaluation: O^c = G(E, L, C)  -> What does this opportunity mean relative to me?
```

Adaptation includes only the light conflict surface needed to make relevant conditions visible. It
does not introduce fit scoring, trajectory scoring, development-value scoring, ranking or gating.

## Modules and use cases

### Module 1 - Context Interpretation

Responsibility: turn placement/application context into a structured temporary context.

1. **UC01 - Create Adaptation Context:** create the temporary context for the selected
   placement/application from opportunity and relevant user context.
2. **UC02 - Interpret Opportunity Context:** interpret the job description and surrounding
   opportunity information without scoring the opportunity.
3. **UC03 - Resolve Relevant User Context:** retrieve current intent, conditions, constraints,
   authorisation, user-stated sponsorship requirement/status, availability and preferences relevant
   here from Identity's canonical Stated Context. Preserve absent values as unknown and write
   nothing back.
4. **UC04 - Surface Constraint Conflicts:** surface alignment, conflict and uncertainty without
   blocking progression.

### Module 2 - Context Adaptation

Responsibility: transform Durable Identity into the best truthful temporary state for this context.

5. **UC05 - Retrieve Relevant Identity:** read the broad canonical Identity snapshot — Explicit State
   and Learned State with provenance and visibility — that this context will be selected from.
   Identity does not narrow it for the role; UC06 does.
6. **UC06 - Select Relevant Activity:** select useful Structure and Activity without changing the
   underlying identity.
7. **UC07 - Interpret Evidence in Context:** determine what selected evidence means relative to the
   role, company, requirements and current user context.
8. **UC08 - Compose Adapted State:** combine selected and interpreted evidence into one coherent
   temporary contextual professional state.

### Module 3 - Context Representation

Responsibility: materialise Adapted State into application-facing representations.

9. **UC09 - Generate Contextual CV:** render a CV from Adapted State rather than editing an old CV as
   canonical truth.
10. **UC10 - Generate Application Answer:** render an answer to a specific application question from
    the same Adapted State.
11. **UC11 - Generate Contextual Narrative:** render reusable summaries, cover-letter content,
    recruiter messages, interview introductions or project narratives.
12. **UC12 - Apply User Representation Edit:** apply a user edit — wording, emphasis, positioning,
    ordering, inclusion/exclusion, or the interpretation of a specific experience — to the **current
    Adapted State**, without automatically updating Explicit or Learned State.

The twelve use cases describe the pre-application cycle. The post-application behaviour ADR 0013
locks — recorded results entering as context, and stage insights governed by accept / edit / decline
/ challenge — is **not yet decomposed into use cases.** Doing that is a decomposition task, not an
implementation licence: nothing below is built until it has been decomposed and sliced.

## Written representation (UC10, UC11)

> **User owns meaning and intent. Joby owns translation.**

UC10 generates an answer to a supplied application question; UC11 generates a contextual narrative,
initially scoped to cover letters. Both render from four input classes:

```text
Representation = Render(
    AdaptedState,              what is relevant and truthful here
    SurfaceContext,            the question, the limit, the format, the opportunity
    RepresentationReferences,  how this person has chosen to express themselves
    ApplicationSpecificInput   what Joby cannot safely infer and must ask for
)
```

**Adapted State remains the authority for contextual professional claims.** References influence
expression — tone, directness, vocabulary, structure, narrative style — and never establish a fact.

### Representation References

Persistent, user-owned material a person explicitly provides: writing samples, previous cover
letters, previous application answers, similar professional writing. They answer *how has this user
chosen to express themselves?*

They are **Identity Representation-owned** and durable, alongside professional sources — and, like a professional
source, they are **never canonical identity** (ADR 0021). A previous cover letter claiming something
does not make it true, and nothing may promote a reference into Explicit State.

```text
ResolveReferenceConflict(...) = PLACEHOLDER
```

Deliberately unresolved. No implementation may silently resolve a conflict in a way that overrides
factual grounding or current user agency.

### Elicitation, not fabrication

Before generating, Joby establishes whether it has enough. Where meaningful intent, motivation,
disclosure or context is missing, **it asks**.

```text
Assess -> ask if necessary -> incorporate -> reassess -> gate
                                              ├── insufficient -> keep asking
                                              └── sufficient   -> generate

SatisfactionGate(...) = PLACEHOLDER
```

The gate's algorithm is unresolved; the invariant is not:

> Joby continues eliciting until it can generate the representation **without fabricating meaningful
> user intent or claims.**

Elicited information belongs to the current opportunity/adaptation context. It does not
automatically modify canonical Explicit State or PCI.

### UC10 — application answer

```text
understand question -> identify relevant Adapted State -> identify meaningful gaps
  -> elicit where required -> satisfy the gate -> generate grounded answer
```

The question may carry semantic intent, a requested competency, a required example, a word or
character limit, a required structure or a format constraint. UC10 may not reconstruct the person's
identity independently, and may not invent an experience, a motivation or a claim.

### UC11 — cover letter

```text
Why this opportunity + Why this person is relevant + Why it makes sense now
```

Only what Adapted State, opportunity context, explicit references or current user input genuinely
supports. **Fit must never be transformed into invented motivation** — that a role suits someone is
not evidence that they want it, and saying so in their voice is a lie in the first person.

### Draft, edit, submit

Generated material is a **draft**. The user may change wording, emphasis, evidence selection,
positioning, ordering, inclusion/exclusion and tone; those edits change the current
representation/adaptation state and never Explicit State or PCI.

Generation and submission are distinct. Before submission the material is temporary
Adaptation-owned working state; on submission the submitted artifact enters Application's **Application
Record** with enough to understand what actually went out — the artifact, its framing, the evidence
used, meaningful user edits, the associated opportunity/question, and later progression.
**Not** every generation attempt or micro-edit.

### The learning contract, deliberately thin

Submitting something is not evidence that it worked.

```text
Submitted representation + subsequent progression -> representation-performance signal

RepresentationPerformanceSignal(...)  = PLACEHOLDER
UpdateRepresentationLearning(...)     = PLACEHOLDER
```

Memory treats this as **observational** evidence, interpreted at the application/representation-
package level — never as proof that one sentence caused an outcome.

```text
Progression ≠ proof the representation caused success
Rejection   ≠ proof the representation caused failure
```

One edit, one application or one outcome must never establish a permanent learned preference
(ADR 0022).

## Hard product invariants

- The person remains the primitive.
- Explicit and Learned State remain the two durable components of Durable Identity.
- Adapted State is temporary and context-dependent. It lives for the active application cycle, as the
  current stage-specific contextual state, and never becomes a durable identity component.
- Contextual relevance selection belongs to Adaptation. Identity exposes truth and does not pre-select
  it for a role.
- Context never silently rewrites Explicit State.
- Adaptation may reinterpret existing truth but may not invent professional reality.
- Selection may omit irrelevant identity without deleting it.
- Different contexts may produce different legitimate Adapted States from the same identity.
- Adapted State is not a CV or another canonical profile.
- Representations are rendered from Adapted State.
- Constraint conflicts inform and never automatically gate an application.
- User intent remains authoritative.
- Opportunity Evaluation and Adaptation remain distinct.
- Representation edits are operational by default, not automatic identity corrections or PCI signals.
  A user edit updates the current Adapted State, not one isolated document.
- The Application Record is Application-owned and immutable; what was submitted stays what was
  submitted, whatever Adapted State later becomes.
- Factual stage results may enter Adapted State automatically. A system interpretation of them may
  not — it enters only through accept / edit / decline / challenge.
- An accepted or edited stage insight is operational Adapted State, never automatic PCI.
- Application Record = what happened. Adapted State = current contextual response to what has
  happened. Memory / PCI = what accumulated resolved history eventually justifies learning.
- Adaptation belongs to the Fast Operational Loop; PCI learning belongs to the Slower Learning Loop.
- Only meaningful real-world outcomes later become Records from which slow learning may occur.

## Explicit exclusions

The placement doctrine does not grant Adaptation ownership of opportunity scoring/ranking, trajectory
or development-value evaluation, Opportunity Evaluation, autonomous pursuit decisions, constraint
hierarchies, application gating, opportunity authority, Opportunity, portal execution, application
lifecycle, Application Records or their authority, permanent CV/profile state, canonical identity
mutation, PCI mutation, slow PCI learning, a universal mathematical implementation of `T`, or any
particular schema/API/queue/runtime design.

Two promotions are forbidden by name, because the application cycle creates the paths that tempt
them: **no automatic promotion of a representation edit into identity**, and **no automatic promotion
of a stage insight into PCI**.

## Deliberately deferred

Open, and deliberately so. An implementation slice that does not need one of these resolved must not
harden it (ADR 0013 §10).

| Deferred | What is open |
|---|---|
| Result vs insight classification | The distinction is fixed; the exact classification rules are not |
| Adapted State historical retention | Whether prior stage-specific Adapted States are discarded, lightly snapshotted or selectively preserved; versioning |
| Adaptation → Memory handoff | Which reviewed insights, if any, accompany a resolved Application Record into Memory |
| Persistence mechanics | Tables, JSONB shapes, versioning, reconciliation, lifecycle |
| Refresh triggers | When a new application event regenerates Adapted State |

None of these blocks decomposition or the first slices.
