# ADR 0028 — Opportunity Capture Is Not a Person Event

- **Status:** Accepted implementation decision; module terminology amended by ADR 0029
- **Date:** 2026-09-01
- **Modules affected:** Opportunity, Intelligence
- **Related:** ADR 0002 (event contract), ADR 0004 (durable delivery), ADR 0025 (semantic ownership
  inside Translation), ADR 0027 (resolved Application history)

## Context

Implementing UC01/UC02 — capture opportunity evidence, then read it into a structured understanding —
required a way to get from "evidence was captured" (Opportunity's work) to "this opportunity has been
understood" (Intelligence's work) **without a cross-module write**. Opportunity may not write an
`intelligence_*` table, and Intelligence may not write an `opportunity*` one.

The architecture's designed answer is a domain event: write the outbox row in the capture
transaction, let a deferrable handler in `apps/worker` react. `OpportunityImported` already exists in
the closed event set, already owned by `opportunity`, with a payload that already fits.

It does not work, for a reason that is not a technicality. `packages/events/src/envelope.ts` states:

> Joby is person-centric: every event is about exactly one person.

`personId` is required on the envelope and on `createEvent`. **Capturing an opportunity is not a fact
about a person.** An opportunity is a thing in the world; several people may pursue the same one, and
in this slice no person is involved at all — that is precisely what "no person-specific judgement
happens yet" means.

Publishing the event would therefore require inventing a person. The available inventions were all
bad: a synthetic system person id (a lie in a field whose entire purpose is to say who this is
about), the capturing user (making a canonical opportunity record person-scoped, which contradicts
Opportunity owning *canonical* records and would break deduplication across people), or relaxing the
envelope so `personId` becomes optional (weakening the person-centric guarantee across all eight
events to serve one).

## Decision

**Opportunity does not publish `OpportunityImported` for a bare capture, and the envelope is not
weakened. Intelligence discovers outstanding work by polling Opportunity's public interface.**

```text
POST /opportunities → Opportunity: opportunity + opportunity_evidence   [one transaction]

apps/worker loop → Intelligence.understandOutstanding()
    → opportunities.listRecent()        Opportunity's public interface
    → compare against its own latest evidence set
    → interpret, validate, store a new revision
```

Three properties make this safe rather than merely convenient:

- **No cross-module write.** Opportunity writes only its own tables; Intelligence writes only its
  own. Evidence reaches Intelligence through a narrow, read-only consumer port
  (`OpportunityEvidenceReader`), wired in an app composition root — so `@joby/translation` does not
  depend on `@joby/opportunity`.
- **Idempotent by evidence set, not by delivery.** An opportunity whose current understanding was
  made from exactly this evidence is skipped. Re-running the poll cannot manufacture revisions, which
  is the same correctness property `oncePerEvent` provides for deferrable handlers — obtained from
  the data rather than from a delivery id.
- **Nothing is stranded.** There is no job row to be missed, because outstanding work is *derived*:
  an opportunity whose evidence set differs from its latest reading is by definition outstanding.
  A capture that commits is discoverable on a later pass, and a worker that dies mid-interpretation
  leaves the opportunity outstanding rather than half-done.

  > **Correction (2026-09-02).** This claim was false as first implemented. The poll read a fixed
  > window of the *most recently captured* opportunities, so anything falling out of that window
  > could never return to it — its evidence never changes, so it never becomes recent again — and was
  > permanently un-understood. Discovery now pages a stable total order (`listSummaries`), which is
  > what makes the claim actually hold. Recorded rather than quietly fixed, because the ADR asserted
  > a property the code did not have.

`OpportunityImported` stays in the closed set, unpublished. It becomes publishable when an
opportunity enters a *person's* world — when someone starts tracking or pursuing it — because that
is a fact about a person and has a real `personId`. That is a later use case, and it is the right
place for the event.

## Consequences

- Interpretation latency is one worker poll interval rather than one queue delivery. For work whose
  input is a job posting somebody just pasted, this is not a product-relevant difference.
- Joby has two mechanisms for durable background work: the outbox/queue for person events, and
  derived-outstanding polling for module-owned work with no person. Identity's reconstruction job
  table is a third shape of the same idea, so this is not a new category so much as an unnamed one
  being named.
- The person-centric event guarantee survives intact. No event carries a fabricated `personId`, and
  `MODULE_NAMES`, `EVENT_NAMES` and every payload are unchanged.
- **Cost:** polling scans a bounded recent window each pass. At current scale this is one indexed
  aggregate query per loop. If the window ever stops being sufficient, the fix is a
  watermark or an Opportunity-owned outstanding-work view, not a fabricated person.

## Alternatives Considered

- **Publish `OpportunityImported` with a synthetic system `personId`.** Rejected. The field means
  "this is about that person"; filling it with a sentinel makes every consumer's `personId` check
  meaningless and the lie is invisible at the point it is read.
- **Attribute the capture to the capturing user.** Rejected. It makes the canonical opportunity
  record person-scoped, which contradicts Opportunity owning canonical records and cross-person
  deduplication. It also smuggles a person into a slice whose acceptance criteria exclude one.
- **Make `personId` optional on the envelope.** Rejected as disproportionate: weakening a guarantee
  that holds across all eight events, to avoid polling in one, and every existing handler would need
  to start handling absence.
- **An Opportunity-owned "needs interpretation" job table.** Rejected: Opportunity would be asserting
  that Intelligence owes work, which is Opportunity taking a position on Intelligence's
  responsibilities. Deriving outstanding work from the evidence set says the same thing without
  either module claiming authority over the other.

## Revisit When

An opportunity starts entering a person's world — tracking, saving, pursuing — at which point
`OpportunityImported` becomes publishable with a real `personId` and the pull can become a push.
Also revisit if polling latency or cost becomes a measured problem rather than an anticipated one.
