# Opportunity module

**Status: capture implemented (UC01).** Sourcing, import, canonical records and provenance.

```text
Raw Opportunity → Capture Evidence → Understand → Structured Opportunity
                  ^^^^^^^^^^^^^^^^   ^^^^^^^^^^
                  this package       legacy translation/intelligence path
```

## An Opportunity is not a JobPosting

This is the constraint that shapes the whole model. A posting is **one kind of evidence** attached to
an opportunity — the most common kind, which is exactly why the shallow modelling is tempting.

An Opportunity is anything a person could pursue: an advertised role, a placement scheme, an
internship cohort, a research position, a competition, a speculative approach, an opening that exists
because someone mentioned it. Several of those have no posting, no URL and no deadline.

So the `opportunity` table has **no url, deadline, salary or posting_status column, and must not grow
one.** Evidence is a separate many-per-opportunity table, and everything a posting happens to provide
is optional and source-attributed. A design that only works when a URL exists is modelling the
posting.

`title` and `organisation` are the caller's own labels for their record. They are deliberately **not**
the interpreted role and company — those are Opportunity understanding output.

## Owns

- the Opportunity semantic authority: evidence, understanding, mapping and evaluation;
- in this package, opportunity records and the evidence captured about them, with provenance;
- the raw bytes, retained exactly as received.

Evidence is **immutable**: the repository exposes no update path. Postings are edited and deleted, a
person may need to know what it said when they applied, and interpretation improves after the fact —
you cannot re-read what you overwrote. Re-capturing the same bytes is one piece of evidence, not two.

## Does not own — and this is the load-bearing boundary

**This package partition does not interpret.** Turning captured material into role, company,
requirements, conditions and uncertainty is implemented in the legacy
`@joby/translation/intelligence` partition. Both partitions belong to the one Opportunity semantic
authority defined by ADR 0029. There is no parser in this package, no field
extraction, and no path from captured text to an interpreted value.

That separation is what makes *raw evidence distinguishable from interpreted understanding* a
structural fact rather than a naming convention: raw material lives in `opportunity*`, interpretation
lives in `intelligence_*`, neither implementation partition writes the other's tables, and they are served on separate
URLs so no response mixes them.

Also not owned: person-state and representation; Adapted State; application lifecycle, submission or
portal execution; slower-loop learning.

## Public interface

`@joby/opportunity` — `createOpportunity({ db })`.

| Method | Purpose |
|---|---|
| `captureEvidence` | UC01. Creates the opportunity when `opportunityId` is omitted; attaches evidence when given |
| `getOpportunity` | The record and its captured evidence |
| `listEvidence` | Evidence metadata, without loading every posting |
| `getEvidenceContent` | The bytes exactly as captured, one item at a time |
| `readEvidenceText` | Evidence decoded as text, with provenance. Decoding is not interpretation — nothing is parsed, stripped or normalised |
| `listSummaries` | Opportunities and their current evidence sets, in a stable total order, pageable by cursor |

`listRecent` exists so a consumer can tell whether its own derived work is out of date, without
the capture partition knowing anything about interpretation. It is how the understanding partition finds outstanding work
(ADR 0028).

## Deliberately not built

Company resolution to a stable entity, cross-opportunity deduplication, refresh and staleness
tracking, URL fetching, salary and deadline taxonomies. Each needs a use case that asks a question of
it; building a taxonomy before there is a query needing it is how the posting model creeps back in.

**No event is published.** `OpportunityImported` exists in the closed set and stays unpublished:
every Joby event is about exactly one person, and capturing an opportunity is not
([ADR 0028](../../docs/architecture/adr/0028-opportunity-capture-is-not-a-person-event.md)). It
becomes publishable when an opportunity enters a *person's* world.
