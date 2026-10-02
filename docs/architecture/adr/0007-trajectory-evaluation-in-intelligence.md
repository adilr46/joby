# ADR 0007 — Trajectory Evaluation in Intelligence

- **Status:** Accepted doctrine; semantic owner moved to Opportunity by ADR 0029
- **Date:** 2026-08-12
- **Domains affected:** Intelligence (primary), Discovery, Development
- **Builds on:** [ADR 0005](0005-durable-identity-as-the-person-centric-primitive.md), [ADR 0006](0006-two-timescale-career-intelligence.md)

## Context

Intelligence has so far answered one question: *what is this opportunity?* Understanding the posting,
the organisation, the role.

That leaves the question a placement student actually has unanswered. They are not short of postings;
they are short of judgement about which ones are worth their limited applications. And the judgement
they need has two parts that pull in different directions:

> **Can I plausibly enter this role?**
>
> **Is entering this role likely to move me toward a valuable next professional state?**

These come apart constantly. The reachable role that leads nowhere. The harder role that opens a
path. A student optimising only the first ends up somewhere they can get to; a student optimising
only the second wastes a year applying to things they cannot yet reach.

Now that Durable Identity exists (ADR 0005) — including career direction, constraints, and a Learned
State that sharpens over time (ADR 0006) — evaluating an opportunity against the person's trajectory
becomes possible rather than aspirational.

## Decision

**Intelligence evaluates both current fit and trajectory value.** It stays inside Intelligence and
does not become a new top-level domain.

### Opportunities are potential state transitions

Not just things to match against. An opportunity is evaluated as a possible move from the person's
current professional state to a next one — which means the evaluation depends on where they are and
where they are trying to go, not on the posting alone.

### Evaluation dimensions

| Dimension | Question |
|---|---|
| **Current Fit** | Can they plausibly enter this role now? |
| **Evidence Fit** | Does their evidence actually support the claims this application requires? |
| **Orientation Alignment** | Does this match their stated career direction? |
| **Development Value** | What would doing this build? |
| **Constraint Relevance** | Does it respect their real constraints — work authorization, location, timing? |
| **Trajectory Alignment** | Does it move them toward a valuable next state? |
| **Opportunity Cost** | What does pursuing this displace, given finite applications and time? |
| **Uncertainty** | How confident is any of the above, and where is it thin? |

Not a fixed schema. The set is expected to change as PCI gets richer.

### No universal numeric fit score

**These dimensions are not collapsed into a single number at this stage.**

A single score hides exactly the tension the person needs to see. "72% match" cannot express *you
could get this, and it leads nowhere* — which is the most useful thing Joby could tell a placement
student. It also implies a precision the underlying evidence does not support, and it makes the
system's reasoning unauditable at the point where the person most needs to disagree with it.

Introducing a composite score later requires a separate accepted ADR.

### Governance

- Evaluation is **derived, not durable**. It is a judgement about an opportunity given a person's current state — it recomputes as either changes, and it is not stored as a fact about the person.
- Evaluation **must not write Explicit State or PCI.** It reads Durable Identity; it never rewrites it. Evaluating an opportunity is not evidence about the person.
- Uncertainty is surfaced, never averaged away. Thin evidence yields a stated gap, not a confident dimension.
- Inference is labelled: an inferred requirement in a posting stays `Inferred` when it reaches the person.
- Trajectory claims are **advisory**. The user owns intent — Joby informs the choice and does not make it.

### Boundaries

- **Discovery** surfaces opportunities; its long-term goal is finding ones both realistically reachable from the current state and potentially valuable for the next. It does not evaluate — an ingestion path that starts scoring has crossed into Intelligence.
- **Development** owns interpretation of how the person is changing over time. Intelligence consumes development signals as input; it does not produce them.
- Intelligence proposes. Nothing here confirms anything about the person.

**No new skill is created for trajectory evaluation yet**, and no new events. It is Intelligence's
work under the existing model.

## Consequences

- Joby can answer the question a placement student actually has, rather than the one that is easy to compute.
- Evaluation quality improves as PCI does — the same architecture gets better without redesign (ADR 0006).
- Multi-dimensional output is harder to present than a score. That work lands on the UI, which must show tension between dimensions rather than resolving it. This is real cost, accepted deliberately.
- Trajectory reasoning on a person with little history will be thin. Correct: the honest output is "not enough evidence yet", and the dimensions must be able to say so.
- No ranked list or automatic filtering follows from this. Ordering opportunities by an implicit composite would reintroduce the score through the back door.

## Alternatives Considered

- **A single fit score.** Rejected above: hides the tension that matters, overstates precision, unauditable.
- **A separate Trajectory domain.** Rejected: it needs the same opportunity, company and role understanding Intelligence already owns, and splitting them would mean two domains reading the same data with a coordination boundary in between (ADR 0001).
- **Put trajectory in Development.** Rejected: Development interprets how the *person* is changing. This evaluates an *opportunity* against that interpretation. Development is an input, not the owner.
- **Wait for richer PCI first.** Rejected: current fit alone is already useful, the dimensions are stated now so features do not accrete an implicit score in the meantime, and the model is designed to sharpen rather than be replaced.
- **Statistical trajectory modelling now.** Out of scope, as in ADR 0006.

## Revisit When

There is evidence a composite score genuinely helps users decide (that is a new ADR); the dimension
set proves wrong in practice; or trajectory evaluation needs its own durable representation rather
than being recomputed — which would mean it has become a fact about the person and needs the
governance in ADR 0005.
