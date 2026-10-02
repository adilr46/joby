---
name: opportunity-ingestion
description: Turning an external source into a normalized Joby Opportunity — URL/source capture, parsing, company resolution, requirements, salary/deadline/work-authorization extraction, normalization, duplicate detection, provenance, and refresh/staleness. Use for anything entering Discovery from outside.
---

# Opportunity Ingestion

```
external source → normalized Joby Opportunity
```

Owned by **Discovery**. Publishes `OpportunityImported`.

## An Opportunity is not a JobPosting

This is the constraint that shapes everything else. A job posting is *one kind of source* for an
opportunity — currently the most common, and the reason the shallow modelling is tempting.

An Opportunity is anything a person could pursue: an advertised role, a placement scheme, an
internship cohort, a research position, a competition, a speculative approach to an organisation, an
opening that exists because someone mentioned it. Several of these have no posting, no URL, no
deadline, and no structured description.

Practically:

- Do not name types, tables, or fields `JobPosting`, and do not make posting-shaped fields required.
- A posting is a **source** attached to an Opportunity, not the Opportunity itself. One Opportunity may have several sources; an Opportunity may have none.
- Anything a posting happens to provide — salary band, deadline, requirement list — is optional and source-specific.
- If a design only works when a URL exists, it's modelling the posting, not the opportunity.

## Capture

Preserve the raw source, unmodified, with its capture time and where it came from. Postings are
edited and deleted; the person may need to know what it said when they applied.

Capture the source-provided identifier when there is one — it is the strongest deduplication signal.

## Parsing

Extraction is AI work: `apps/worker`, behind a deferrable event, idempotent on `event.id`.

- Extract what is present. Absent is a valid, informative result — a missing salary means the posting didn't state one, not that Joby should guess.
- **Mark inference as inference.** "Requires a degree" stated in the posting is `Observed`. "Probably needs Python" read between the lines is `Inferred`, and must stay labelled that way when it reaches a matching decision or the user.
- Job descriptions are marketing. Distinguish requirements from aspiration and from boilerplate.

## Company resolution

Resolve the hiring organisation to a stable entity, so a person can see everything they've pursued
there and Intelligence can accumulate research.

Recruiters, agencies, umbrella brands and subsidiaries make this genuinely hard. Where confident,
link; where not, keep the raw name and leave it unresolved rather than merging two organisations
that aren't one. Wrong merges are much harder to notice and undo than unresolved names.

## Fields worth extracting carefully

- **Requirements** — separate hard requirements from preferences. Keep the source wording; a paraphrase loses the distinction the person needs.
- **Salary** — currency, period, band, and whether stated or estimated. Never present an estimate as stated.
- **Deadline** — with timezone. Rolling, "until filled", and absent are distinct from a date, and a wrong deadline costs someone a real opportunity.
- **Work authorization** — whether sponsorship is offered, and what is required. Decisive for many placement students, frequently ambiguous, and easy to get dangerously wrong. When the posting is unclear, say unclear. Never infer eligibility about the person here; that's their Explicit State and their disclosure decision.

## Normalization

Normalise shape — titles, locations, dates, currency. Do not normalise meaning: keep the source
wording alongside the normalised form, because the person will read the original and expect it to
match.

Structure for the questions Joby actually asks. Don't build a taxonomy before there is a query
needing it.

## Duplicates

The same opportunity arrives repeatedly, from several sources, in different forms.

- Match on source identifier first, then organisation plus role plus timing.
- Near-matches are often genuinely different — two openings on one team, or the same role reposted after a failed search.
- Prefer linking sources to one Opportunity over merging Opportunities. Splitting a wrong merge is far harder than merging two later.
- `OpportunityImported` carries `isDuplicate`. Deduplication is Discovery's own responsibility; subscribers should not re-derive it.

## Provenance

Every field records which source it came from, when, and via which extraction. When two sources
disagree, keep both with their provenance rather than silently picking one.

## Refresh and staleness

Postings change and disappear. Opportunities go stale quietly, which is worse than failing loudly.

- Track last-verified time. Show age when it matters to a decision.
- On refresh, **do not overwrite silently** — a changed deadline or requirement is something the person needs to see, especially if they've already applied.
- A vanished posting does not delete the Opportunity. The person may have applied; their Application Record and everything learned from it must survive.
- Refresh runs in the worker, idempotent on `event.id`.

## Boundaries

Discovery owns opportunity records and their provenance — nothing else. Applying belongs to
**Execution**.

Normalised opportunities feed the **Permanent Workspace** — where the person's active opportunities
live — and the Temporary Workspace Contexts built from them.

Normalised output **feeds Intelligence**, which evaluates it against the person's Durable Identity —
current fit *and* trajectory alignment, development value, constraint relevance, uncertainty
(ADR 0007). Researching the organisation, interpreting what a posting really wants, and every
evaluation dimension belong there.

**Ingestion that starts scoring opportunities has crossed a boundary.** Extract and normalise what
the source says; judging what it is worth to this person is not Discovery's call.
