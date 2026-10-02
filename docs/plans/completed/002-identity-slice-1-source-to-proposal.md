# 002 — Identity Slice 1: Source → durable reconstruction → Proposal (UC01–UC03)

## Goal

A placement student uploads a CV and can inspect a grounded reconstruction of it — **without a single
AI-generated fact having become canonical Explicit State.**

## Domains affected

**Identity** owns everything new here. No other domain is touched. No cross-domain write.

## Doctrine check

| Rule | How this slice respects it |
|---|---|
| Reconstruction writes only R (ADR 0011 inv. 1) | R has no canonical tables yet — R2 builds them. This slice writes sources, jobs and **proposals**, nothing canonical |
| Reconstruction never writes X (inv. 2, 4) | No X table exists and no code path writes one |
| AI never becomes truth without confirmation | The proposal table is the only extraction output; confirmation is R2 |
| A source is never canonical identity | Sources are stored immutably, separately, and are never read as truth |
| Sparse Activity is valid | Contribution / capability / consequence independently nullable; ≥1 required; **no completion of absent parts** |
| Atomic provenance | Every proposed item carries source id, character offsets into the source, and epistemic status |
| Lifecycle facts stay distinct | `captured` (source), `reconstruction generated` (job + proposal) and `confirmed` (R2) are separate rows, never one status column |
| Person at first capture, unclaimed (ADR 0010) | Capture creates Person + Durable Identity root when no person id is supplied |
| Sources are episodic | Capture is user-initiated. Nothing polls, crawls or schedules itself |

## Scheduling decision

**An Identity-owned durable job table**, written in the same transaction as the source — not a new
event name. Rationale, recorded because plan `001` left this open: "extraction of this source is
outstanding" is not a meaningful fact about a person's career, and the closed `EventName` union
should only carry facts that are. `IdentityUpdated` stays reserved for confirmed Explicit State
changes and is **not published by this slice**.

Cost, accepted: the claim/reclaim SQL is a second implementation of the pattern in
`PostgresDurableQueue`. Not abstracted into `packages/database` — the table is Identity-owned, and a
generic queue-over-any-table helper would be speculative on one caller. Revisit at the second job type.

## Steps

1. Migration `0003`: Identity tables; **drop `foundation_probe`** and its API/worker scaffolding.
   Move the ADR 0004 tests onto a table they create themselves.
2. `packages/identity` package, public boundary in `src/index.ts`.
3. Source capture: person-or-create, immutable source, job row — all in one transaction.
4. Provider-neutral extraction port; deterministic adapter (tests/dev) and OpenAI adapter (v1 default).
5. Proposal model: Structure / Activity / Relations, uncertainty, conflicts, source references.
6. Worker runner: claim → extract → persist proposal → complete; failure preserves the source and
   leaves the job retryable.
7. API routes for capture and inspection.
8. Tests: unit + integration, including failure and duplicate delivery.

## Verification

`pnpm typecheck`, `pnpm test`, and a real end-to-end run: capture a CV through the API, watch the
worker produce a proposal, and show the proposal plus an empty canonical state.

## What actually happened

Done and verified 2026-08-14. `pnpm typecheck` clean; **60 tests pass** (14 events, 19 extraction,
12 durable delivery, 15 identity integration). End to end through real processes: a CV posted to
`POST /identity/sources` created an unclaimed Person, stored the source, scheduled the job in the
same transaction, and the worker produced a proposal — 3 structure nodes, 4 activities, 4 relations,
every item quoting the source with character offsets, **every consequence and capability absent**
because the CV stated none.

`event_outbox` was empty of anything this slice produced: **Slice 1 publishes no events**, as
intended.

Decisions taken during implementation:

1. **Text sources only** (`text/plain`, `text/markdown`). PDF needs a parser and a dependency
   decision; it is the first thing R2 or R3 should add, because real CVs are PDFs. Capture rejects
   unsupported types with 415 rather than storing something nothing can read.
2. **Raw request body, not multipart.** No parser dependency, and this release accepts text.
   Multipart arrives with the file types that need it.
3. **Deduplication by (person, sha256)** — re-uploading the same CV returns the original source and
   job rather than queueing a second reconstruction.
4. **The deterministic extractor is the fallback when `OPENAI_API_KEY` is unset**, announced with a
   warning. It keeps the whole flow runnable and testable offline. The OpenAI adapter is written and
   type-checks but **has not been run against the live API** — no key was available.
5. **Validation rejects rather than repairs.** A proposal with an uncitable item, an activity
   asserting none of the three components, an unknown relation kind, or an edge to a phantom node
   fails the job. The source survives and it is retryable; persisting a malformed proposal would ask
   a reviewer to confirm something nobody can trace.

One bug found and fixed by its own test: the deterministic extractor matched section headings by
prefix, so `Placement at Acme Ltd, 2024` was swallowed as a heading and the employer silently
disappeared. Headings are now matched against the whole line.

Plan 001's scaffolding is gone — `foundation_probe`, `apps/api/src/foundation-probe.ts` and the
probe handler are deleted, and the ADR 0004 tests now create their own scratch table.

**Not done, deliberately:** `apps/web` (R1's acceptance is inspectable through the API; the review
UI belongs with R2's review flow, which is what a screen is actually for), and the git repository is
still uninitialised.

## Out of scope

Confirmation and canonical R tables (R2) · corrections · GitHub and other sources (R3) · the exported
consumption boundary as a finished contract (R4) · `apps/web` · PDF/DOCX parsing — **text/plain and
text/markdown only** in this slice · Stated Context capture (plan `000` §3.6) · auth and the Account
Claim gate.
