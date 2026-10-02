# ADR 0008 — Workspace Context Layers and the Baseline Identity State

- **Status:** Accepted invariants; Workspace topology refined by ADR 0029 — extended by [ADR 0009](0009-explicit-state-as-structure-activity-relations.md), [0010](0010-person-creation-at-first-capture-and-the-account-claim.md) and [0011](0011-explicit-state-as-reconstructed-state-and-stated-context.md)
- **Date:** 2026-08-12
- **Domains affected:** Cross-cutting (Identity, Execution, Intelligence, Discovery, Network)
- **Extends:** [ADR 0005](0005-durable-identity-as-the-person-centric-primitive.md) (Workspace definition), [ADR 0006](0006-two-timescale-career-intelligence.md) (loops), [ADR 0007](0007-trajectory-evaluation-in-intelligence.md) (evaluation at low evidence)

> **Extended (2026-08-14).** Both context layers, the ownership boundary, the Baseline Identity State,
> evidence-proportionate claims and progressive resolution all stand. Two refinements: where this ADR
> enumerates Explicit State content — in the Permanent Workspace Context and in "Explicit State at
> State 0" — read those nouns as projections of **Explicit State** under ADR 0009, not as stored
> models. The Person a State 0 identity belongs to is created with the first
> professional source and starts **unclaimed**; account verification gates operations without entering
> the ontology (ADR 0010). **Career Direction at State 0 is Stated Context `X_t`**, distinct from
> Explicit State, which only the user writes and reconstruction never does (rewritten ADR 0011);
> everything this ADR says about it otherwise stands.

## Context

ADR 0005 removed Workspace as the owner of durable person-state — correctly. Durable Identity became
the primitive, and Workspace was recast as a **temporary contextual projection**.

That correction overshot. Defining Workspace as purely temporary underrepresents what Joby actually
is to a user. A placement student does not experience Joby as a series of disposable task contexts;
they experience it as a place they return to — where their experience, projects, evidence, documents,
active opportunities and history live, visible and maintainable. That persistent environment is real,
it is user-facing, and the architecture had no name for it. Left unnamed, it would have been rebuilt
ad hoc per screen, or worse, rebuilt as a second store of person-state — the exact failure ADR 0005
exists to prevent.

There is a second gap. ADRs 0005–0007 describe a system with a rich Learned State and trajectory
reasoning, and say nothing about the state every user is actually in on day one: **Joby knows almost
nothing about them.** Without an explicit starting condition, the pressure at that moment is to fake
it — to present generic priors as personal insight, or to let a single application produce
confident-sounding pattern language. That would damage trust precisely when the person is deciding
whether Joby is worth using, and it is the kind of harm that is invisible in code review because
every individual sentence sounds helpful.

## Decision

### Workspace has two context layers

> **Workspace is the user-facing environment through which Durable Identity is maintained, viewed,
> and activated.**

**Permanent Workspace Context** — the persistent professional environment the user returns to across
their career. It exposes and organises the durable material relevant to the person: education,
experiences, projects, EvidenceItems, achievements, skills, Living Documents, preferences,
constraints, stated career direction, active opportunities, relevant career history, and user-visible
PCI insights where appropriate.

It should feel like **"My Joby" — the persistent professional environment around me.**

**Temporary Workspace Context** — created when the user enters a specific professional task, and
composed from Durable Identity plus current external and contextual information:

| Temporary Workspace | Composed from |
|---|---|
| Application Workspace | Durable Identity + Opportunity + Company + relevant PCI + current application/session state |
| Interview Workspace | Durable Identity + Application Record + company/role intelligence + relevant PCI |
| Opportunity Evaluation Workspace | Durable Identity + PCI + Career Direction + Opportunity |
| Network Workspace | Durable Identity + Young Professional Graph context |

Temporary state may change rapidly and may be discarded when no longer operationally useful.
Meaningful outcomes become **Records**; operational noise becomes nothing.

### The ownership boundary is unchanged and now explicit

> **Durable Identity owns state. Workspace organizes and activates state.**

**The Permanent Workspace does not own a second copy of the person's state.** It is a persistent
working and view layer over Durable Identity, which remains the sole owner of persistent person-state
— Explicit State and Learned State/PCI. Workspace may read, surface, compose, and temporarily
transform. It must never become a competing durable source of truth.

**No Workspace domain or package is created.** Workspace is a user-facing concept realised by
whichever domain owns the task; the persistent layer is a composition over Identity's public API.

### Baseline Identity State

> **A minimally sufficient, user-verified representation of who the person is now and where they
> currently intend to go, before Joby has accumulated enough evidence to meaningfully learn them.**

```
State 0 = Sparse Durable Identity + Explicit Direction + Minimal Priors
```

**Explicit State at State 0** may contain verified education, experience, projects, achievements,
EvidenceItems, preferences, work constraints, work authorization where relevant, interests, documents,
and stated career direction.

> Joby may know little, but what it claims to know should be grounded.

**Career Direction at State 0** is explicit user input — placement type, role families, industries,
functions, geography, company preferences, longer-term ambitions, known constraints. It represents
**where the user currently believes they want to go**, and it may change as they do. It is **not** an
inferred permanent trait and must never be treated as one.

**PCI at State 0** is intentionally sparse: very limited learned preferences, low-confidence
hypotheses, and generic system priors where required. **Joby must not pretend to have learned patterns
that do not yet exist.** Early evaluation and recommendation rely on Explicit State, stated direction,
observable evidence, and generic priors — with uncertainty explicit internally and surfaced to the
user when consequential.

### Evidence-proportionate claims

At State 0, claims must be proportionate to the evidence behind them:

| Justified at State 0 | Not justified until evidence accumulates |
|---|---|
| "This placement appears technically aligned with your existing projects." | "You consistently thrive in this kind of environment." |

The second requires accumulated career evidence. Generating it early is a doctrine violation, not a
tone problem.

### Progressive resolution

Joby's understanding gains resolution over time: explicit identity and weak priors → early learned
patterns → higher-resolution PCI with an emerging constraint model → rich longitudinal Durable
Identity.

> **Joby begins mostly knowing what the user tells and proves to it, then earns the right to infer
> more over time.**

This is conceptual. **No numeric state machine, no thresholds, no confidence formulas, and no
statistical machinery** are introduced — those would need their own ADR.

## Consequences

- **The Permanent Workspace is not a duplicate identity model in the database.** It reads through Identity's public API and stores no person-state of its own. This is the single most important thing to hold; it is also the easiest to erode, because caching person-state in the persistent layer will look like a performance win.
- Temporary Workspace state stays operational and disposable. The boundary between "operational state this task needs" and "a meaningful Record" remains a per-feature design decision (ADR 0005).
- The UI can naturally centre on "My Joby" rather than on a list of applications — which is the person-centric thesis made visible.
- **Early recommendations must be evidence-proportionate.** This constrains AI output at exactly the moment there is most pressure to sound impressive. Expect this to feel underwhelming compared to what a competitor willing to fabricate could show, and accept it.
- Uncertainty becomes a first-class output at State 0, not an edge case. "Not enough evidence yet" must be a designed, presentable state rather than an empty screen.
- Personalisation compounds with longitudinal use, so the product gets better without redesign — the same architecture, higher resolution.
- **Cost:** two named context layers is more concept than one. Every feature now has to say which layer it belongs to. That is the intended discipline, and the alternative is the persistent layer accreting silently.
- Existing event contracts are unaffected. Workspace layers and State 0 produce no new events.

## Alternatives Considered

- **Keep Workspace purely temporary and treat the persistent environment as "just UI".** Rejected: unnamed things get rebuilt inconsistently, and the most likely accidental shape is a second person-state store.
- **Make the Permanent Workspace a durable store that syncs with Durable Identity.** Rejected outright — two stores of person-state with a sync between them is the failure ADR 0005 was written to prevent, reintroduced as an optimisation.
- **A Workspace domain/package.** Rejected: it would need to read from nearly every domain and own nothing, which is a coordination boundary rather than a domain (ADR 0001).
- **No formal Baseline Identity State; just build for the general case.** Rejected: the general case assumes evidence that a new user does not have, and the default behaviour under that assumption is to fabricate.
- **Numeric confidence thresholds or a state machine (State 0 → 1 → 2).** Rejected at this stage: it would encode precision the evidence model cannot support. The progression is a principle, not a schema.

## Revisit When

The Permanent Workspace needs durable state of its own that is genuinely not person-state (layout,
pinned items) — that is a legitimate small store and needs its own ownership decision; evidence-
proportionality needs a formal mechanism rather than review judgement; or progressive resolution
needs real thresholds, which would be a separate ADR introducing statistical machinery deliberately.
