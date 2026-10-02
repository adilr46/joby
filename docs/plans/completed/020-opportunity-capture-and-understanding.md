# Plan 020 — Opportunity capture and understanding (UC01, UC02)

**Status:** completed, 2026-09-02. `pnpm typecheck` clean; **379/379 tests pass against PostgreSQL**.

## Outcome

> A placement student can hand Joby what they actually have about a job — the posting text they
> copied, the email a contact forwarded — and Joby retains it exactly as given, then produces a
> structured understanding of the role, company, requirements, conditions and **what the evidence
> did not say**, retrievable separately from the raw material it came from.

```text
Raw Opportunity → Capture Evidence → Understand → Structured Opportunity
```

Nothing here involves a person. That is the point: this is one side of the Opportunity authority,
and `mapOpportunityToPerson` — the other side — is untouched.

## Placement in the architecture

| Question | Answer |
|---|---|
| Durable Identity read | **None.** No `E`, `X`, `L`, no `personId`, no lens |
| Career Workspace | Outside it. An Opportunity is not person-state or general positioning |
| Baseline Identity State | Unaffected — works identically for a brand-new user with no history |
| Loop | **Fast Operational.** Interpretation is deferrable work, not learning |
| Record produced | None. Nothing resolves here; Application and Career Memory are not involved |
| Semantic owner | **Opportunity** owns evidence and understanding; two implementation partitions preserve separate mutation boundaries |

## Ownership

ADR 0029 establishes one Opportunity semantic authority. The current implementation remains split:

- `@joby/opportunity` owns the capture partition: records, provenance and raw evidence.
- legacy `@joby/translation/intelligence` owns the understanding partition: attributed derived
  understanding. It reads through a public capability and never mutates capture tables.

Acceptance criterion 2 — *raw evidence remains distinguishable from interpreted understanding* — is
therefore not a field convention. It is an implementation boundary within one semantic authority,
two table namespaces and two retrieval
paths, enforced by a boundary test.

## The cross-module problem, and its designed answer

Capture must not leave evidence stranded with nothing scheduled to interpret it. But one
implementation partition may not write the other's tables; each mutates only its own state.

ADR 0028 records the implemented coordination choice:

```text
POST /opportunities → capture partition writes opportunity + evidence
apps/worker polling → listRecent through the capture public interface
                    → derive missing/stale understanding revisions
                    → validate and write intelligence_opportunity_understanding
```

`OpportunityImported` remains **unpublished** because every current Joby event identifies one person
and capture does not. The worker derives outstanding work from current evidence through the public
capability; no fabricated `personId` or cross-partition write is introduced.

## An Opportunity is not a JobPosting

No required URL, deadline, salary or posting shape. A posting is *one kind of evidence* attached to
an Opportunity; an Opportunity may have several pieces of evidence or one. Evidence is a separate
many-per-opportunity table, and every posting-provided field is optional and source-attributed.

## Epistemic rules for the interpreter

The deterministic interpreter reports **only what the evidence literally states**.

- Absent is a valid, informative result: no stated salary means the posting did not state one.
- What it looked for and did not find becomes `uncertainty` — never a guess, never a default.
- Every understanding carries `attribution` naming the evidence it came from.
- Interpreter output is **untrusted input**, validated before storage exactly as extractor output is.

## Steps

1. Migration `0012`: `opportunity`, `opportunity_evidence`, `intelligence_opportunity_understanding`.
2. `@joby/opportunity` — model, repository, capture service, contract, factory, runtime.
3. Legacy understanding partition — `OpportunityInterpreter` port, deterministic interpreter,
   validation, repository and understanding service.
4. Wire: `apps/api` capture/read routes and `apps/worker` polling composition.
5. Tests: unit (interpreter, validation), integration (capture → queue → understand → retrieve),
   boundary (ownership), duplicate delivery, partial failure.
6. Docs: module READMEs, `CURRENT_STATE.md`, ADR if a consequential decision was forced.

## Out of scope — deliberately

- **Any person-specific judgement.** No fit, no trajectory, no scoring, no ranking, no
  recommendation, no eligibility. `mapOpportunityToPerson` is not called or changed.
- Model-backed interpretation. The port exists; the default is deterministic and offline.
- Company resolution to a stable entity, cross-opportunity deduplication, refresh/staleness,
  re-verification, URL fetching.
- Salary/deadline taxonomies beyond what the evidence states verbatim.
- Any Career Memory, PCI, Application or Portal path.

## What review changed

Two independent reviews and a run against the real API found defects that made the acceptance
criteria false in practice. Each is now fixed with a regression test, and each is listed because the
first implementation looked finished and was not.

**Criterion 3 — representing requirements and conditions honestly:**

| Defect | Effect |
|---|---|
| A section stayed open past an unrecognised heading | `Requirements / - Python / Benefits / - Free lunch` stored free lunch as a **hard requirement** — well-formed, correctly attributed, invisible to validation |
| Markdown headings unread, though markdown is an accepted capture type | `## Requirements` produced a *confident* "the evidence does not state any requirement" about a posting listing several |
| En- and em-dash bullets unread | Word and Google Docs autocorrect `-` into `–`, so requirements were dropped from most pasted postings |
| Conflicting evidence resolved oldest-wins, silently | A scribbled note beat the actual posting for role and company, with nothing said |
| `Flexible` / `Negotiable` discarded as non-answers | For someone whose blocking constraint is remote work, "flexible" is the answer — and two contradictory uncertainty lines were emitted about the same field |

**Criterion 2 — raw evidence distinguishable from interpreted understanding:** the in-memory
`SuppliedOpportunityUnderstanding` placeholder was a *second* answer to "what is opportunity X",
sharing a revision space with the stored one. An `adaptation_context.opportunity_revision` could
resolve to a different document than the one it was built against — a reference that does not dangle
but resolves **wrongly**. The placeholder and its route are deleted; Adaptation now reads the stored
understanding, so there is one revision space and the interpreted reading is no longer a dead end.

**Grounding was not load-bearing.** `attribution: ['inferred from what I know']` validated and
stored, so "every generated claim traces back to evidence" held only by the deterministic
interpreter's good manners — exactly the property a model-backed interpreter would break. Every
entry must now begin with `[evidenceId]` resolving to evidence this opportunity holds. The id leads
so that caller-supplied free text cannot be mistaken for a citation: a source named
`LinkedIn [saved]` previously made an opportunity **permanently** un-understandable, since evidence
is immutable and there is no delete path.

**`content` now has a key whitelist.** The migration's promise that no person appears in that table
was comment-enforced; `personId` and `rawPostingText` both validated and stored.

**Two worker defects:** a failed read counted as productive work, so the loop skipped its sleep and
one permanently-failing opportunity spun the process at full speed, starving the outbox and
reconstruction polls sharing it. And discovery read *recent* rather than *outstanding* opportunities,
so anything past one batch was never interpreted — which falsified ADR 0028's "nothing is stranded".

## Known and deliberately not addressed here

Recorded so they are not mistaken for oversights:

- **Unbounded request body.** The 2 MB evidence limit is checked after the body is buffered.
- **Evidence served with a caller-influenced content type**, including `text/html`, with no
  `nosniff` or `Content-Disposition`. A hostile careers page pasted by a user is the realistic
  vector.
- **No owner, no authorisation, no erasure path** on captured evidence, which admits forwarded
  emails and notes about third parties. This is a doctrine decision, not an implementation detail,
  and needs an ADR before a second user exists.
- **Double-submit on `POST /opportunities`** creates two opportunities; there is no idempotency key.
- Swapping the interpreter does not re-read anything already understood: the currency check is the
  evidence set alone.
