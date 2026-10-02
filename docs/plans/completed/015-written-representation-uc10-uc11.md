# 015 - Written representation: UC10 and UC11

## Goal

Generate grounded, personalised application answers and cover letters from an existing Adapted State,
using the person's own writing as expression material and **asking them** for the meaning Joby cannot
safely infer.

```text
AdaptedState + SurfaceContext + References + ApplicationInput  ->  RepresentationDraft
```

## Domains affected

- **Identity** — owns Representation References: persistent, user-owned expression material with no
  reconstruction path (ADR 0021).
- **Identity / Adaptation** — Module 3: readiness, elicitation, generation, drafts and edits.
- **Execution** — untouched. Generation is not submission and creates no Application Record.
- **Memory** — untouched. The performance signal remains documented and unbuilt.

## Doctrine check

- **Adapted State grounds every professional claim.** A segment citing a node not in `A^C` is
  rejected before storage.
- **References shape expression, never facts.** Their own table, no extraction, no job, no path to
  `E` — enforced by absence, not by care.
- **Elicitation over fabrication.** Missing meaning is asked for and asked for again; the loop has no
  cap. `needs_input` is a designed outcome, not an error.
- **Fit is not motivation.** A cover letter will not be written until the person says why they want
  it and why now.
- **Unsupported claims are reported, not elicited.** Being told something in a chat box is not
  confirmation; a new professional fact goes through Identity.
- **Nothing canonical moves.** No `E`/`X`/`L` write, no event, no PCI, no learning from edits.
- **A draft is not a submission.** No `submitted` column exists to set.

## Steps

1. Migration `0010` — references, elicited input, drafts.
2. Identity: `representation-reference.ts`, contract (+3), public exports.
3. Adaptation: `writing.ts` (ports and both provisional policies), `deterministic-writer.ts`,
   `validate-draft.ts`, `drafts.ts`, service methods, the reader port's reference read.
4. HTTP: readiness, input, generate, drafts, edit.
5. Tests: 17 unit, 12 integration; six pinned assertions deliberately widened.

## Verification

- `pnpm typecheck` clean; `pnpm test` — **310/310** against real Postgres (was 281).
- The specified scenario runs end to end: request a cover letter → motivation and timing missing →
  answer one → still not ready → answer the other → grounded personalised draft citing the person's
  words and their confirmed facts.
- The negative case: a question about Rust, which nothing in their history records, produces a draft
  with **no Rust claim** and `unsupported: ['Rust']` — and Joby does not ask them to assert it.
- The old cover letter in the fixture claims "I led the entire trading desk". It reaches Explicit
  State nowhere, and appears in no generated output.

## Out of scope

Submission, portal execution, Application Records, Memory attribution and learning, recruiter or
interview narratives, semantic reference retrieval, and the final satisfaction algorithm.
