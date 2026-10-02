# ADR 0020 — The CV representation path stays behind a replaceable seam

- **Status:** Accepted
- **Date:** 2026-08-16
- **Domains affected:** Identity (Adaptation, Context Representation)
- **Related:** ADR 0019 (Module 2), ADR 0016 (the general CV), ADR 0013 (Adapted State)

## Context

An application can take its CV three ways: **reuse** the general CV the person's lens already
produces, **adapt** that CV for this opportunity, or produce a **distinct** role-specific document.

Which applies, and when, is not decided. It is a real product question — it depends on how different
placement applications actually are in practice, what students expect, and what a good default feels
like when Joby is wrong. None of that is known yet.

Module 3 will need an answer to render anything. The failure mode is obvious and quiet: a
conditional appears inline in the renderer, and a policy nobody chose becomes the product. It will
look like `if (recoveryUsed) …`, it will be plausible, and it will never be revisited because nothing
marks it as undecided.

## Decision

**The routing decision lives behind a replaceable seam, and this ADR defines no policy.**

```text
CvRepresentationPath = 'reuse' | 'adapt' | 'distinct'
CvRoutingPolicy.resolve(adapted: AdaptedState) -> CvPathDecision
```

Four things make the deferral hold:

1. **The seam takes the whole Adapted State.** A future policy may consider anything already
   composed — the assessment, whether recovery was needed, the opportunity, the person's conditions —
   without `A^C` or the rest of Context Representation being redesigned to carry routing inputs.
2. **The path is not part of Adapted State.** It is asked separately, so routing can change without
   touching the state model.
3. **`provisional` is a field on the decision, not a comment.** "Joby has not decided this yet"
   survives to whatever surface shows it, exactly as `blocksApplication: false` and
   `canonical: false` do.
4. **The default decides nothing.** `ProvisionalCvRoutingPolicy` returns one constant. A test asserts
   the answer does not vary with recovery, gaps or a missing lens — because a condition that varied
   it would be this decision, invented rather than made.

`adapt` is the constant only because it exercises the contextual material Module 2 already composes,
so downstream rendering can be built against something real. It is not a claim that adaptation is
usually right.

**Deliberately absent until the product decision exists**, and not to be added in passing: routing
variables, thresholds, weights, confidence values, scoring, calibration, or any heuristic presented
as product truth.

## Consequences

- Module 3 can be built without settling routing, and settling routing later costs one object.
- A person shown a provisional route can be told it is provisional, because the data says so.
- Cost: the constant is a behaviour, and behaviours become habits. If Module 3 ships to users before
  routing is decided, "always adapt" is what they will experience — which is acceptable only because
  it is visible in the decision, the README and this ADR.
- The seam is small enough to be deleted if the eventual answer is "there is only ever one path".

## Alternatives Considered

- **Decide the routing policy now.** Rejected: nobody knows the answer, and a guess encoded in code
  is harder to revisit than an open question.
- **Let Module 3 decide inline.** Rejected — this is the failure mode above.
- **Put the path on Adapted State.** Rejected: it couples routing to the state model, so changing the
  policy later means changing `A^C`.
- **Return "undecided" and make callers handle it.** Rejected: it pushes an unresolved product
  question onto every call site, and each one would invent its own answer.

## Revisit When

Module 3 renders real documents and the difference between the three paths becomes observable; real
placement applications show how different they actually are; or a user-facing default is needed
before launch — at which point this stops being deferrable.
