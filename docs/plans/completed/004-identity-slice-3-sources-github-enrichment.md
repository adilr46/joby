# 004 — Identity Slice 3: professional sources, GitHub, enrichment (UC08–UC11)

## Goal

A user connects GitHub, **selects** which repositories Joby may look at, and gets a reviewable
**delta** against what Joby already holds — so confirming raises the resolution of existing Explicit
State instead of duplicating it.

## The shape change

Slices 1–2 reconstructed into an empty identity, so every proposed item was new. From here every
reconstruction is a **comparison against current E**, and each candidate carries how it relates to
what is already there:

| Classification | Meaning | What confirmation does |
|---|---|---|
| `new` | Nothing in E matches | Insert a node, as before |
| `enrichment` | Matches a node, fills a component that was **absent** | Update that node; add provenance |
| `clarification` | Matches a node, refines a **present** value without contradicting | Update that node; add provenance |
| `relation` | Both endpoints already exist in E | Insert the edge only |
| `duplicate` | Matches a node and adds nothing | Add provenance only — a second source for the same fact |
| `conflict` | Matches a node and **contradicts** it | Nothing, unless the user explicitly picks a side |

**These are behaviour, not schema.** They live in the proposal JSONB and drive what confirmation
does; no column constrains them, so the vocabulary can change without a migration (roadmap: "without
requiring these labels to become permanent schema enums").

**Matching is deliberately conservative.** Normalised label equality only — lowercase, `-`/`_` to
spaces, collapse whitespace. That catches `rota-scheduler` ↔ `Rota scheduler`, which is the real
GitHub case, and refuses to guess beyond it. A near-miss surfaces as `new` and the user decides;
guessing wrong merges two roles and rewrites someone's history.

## Doctrine check

| Rule | How |
|---|---|
| Only user-selected repositories are inspected | Ingestion reads the selection table; the GitHub client is **never asked** about anything unselected — tested with a client that records every request |
| Metadata only | The client fetches repository metadata. No file contents, no commit diffs |
| No crawling | Every reconstruction traces to a user action: add, select, or refresh. Nothing polls |
| Private-source visibility survives | A source carries visibility; a node is **private unless every source behind it is public**. The Permanent Identity View marks it |
| Conflicts are never silently resolved | A conflict applies nothing unless the user picks a side, and both values are carried in the delta |
| Enrichment over near-duplicates | A matched candidate updates the existing node rather than inserting a second one |
| Idempotent under retry | Same bytes ⇒ same source, no second job; one proposal per job; re-confirming is refused |
| No competing canonical stores | The Permanent Identity View is projected from R at read time (UC11) |

## Steps

1. Migration `0005`: generalise sources (kind, visibility, external ref, version), GitHub connection
   and repository selection.
2. GitHub port + deterministic fake + HTTP adapter (metadata only).
3. Repository metadata → candidate S/A/Relations.
4. Delta classification against current E — general, so a second CV gets it too.
5. Confirmation applies enrichment, clarification, duplicates and conflict resolutions.
6. Permanent Identity View projection (UC11), carrying visibility.
7. Service, routes, tests.

## What actually happened

Done and verified 2026-08-14. `pnpm typecheck` clean; **129 tests pass** (39 new). Demonstrated
cross-process — a script ingested, the **real `apps/worker` process** reconstructed:

```
E  revision=1   project "Rota scheduler" startedAt=<absent>   structure=2 activities=2
inspected by Joby: ["octocat/rota-scheduler"]        ← the unselected repo was never fetched
delta: [enrichment] rota scheduler · [new] rota scheduler · [new] Languages used in …
E unchanged while the delta awaits review: revision=1
E' revision=2   project "Rota scheduler" startedAt=2024-01-15
                nodes named "rota scheduler": 1     ← not duplicated
                sources behind that project: 2      ← CV and repository
view: education University of Bristol [private] · projects Rota scheduler [private]
      skills TypeScript [public], SQL [public]
```

Decisions taken during implementation:

1. **The classification lives in the proposal JSONB**, never a column. `new` / `enrichment` /
   `clarification` / `relation` / `duplicate` / `conflict` drive what confirmation does, and the
   vocabulary can change without a migration.
2. **Matching is normalised-label equality only.** `rota-scheduler` ↔ `Rota scheduler` matches; a
   near-miss stays `new`. Fuzzy matching would merge two roles at one employer, and that failure is
   invisible to the person it happens to.
3. **Delta classification is general**, not GitHub-specific — a second CV gets it too, and the first
   reconstruction is simply the degenerate case where everything is `new`.
4. **Visibility is computed at read time** from the sources behind a fact, not denormalised onto the
   node. A fact is private unless *every* source behind it is public, so a public repo's facts stay
   private while the CV also stands behind them.
5. **A duplicate that the user retains records provenance only.** That is how a second source
   corroborates an existing fact without touching its content.
6. **Ingestion checks the selection before calling GitHub**, never after. The fake client records
   every request so the test asserts what was *fetched*, not what was returned.
7. **`identity_github_connection` stores no credential.** Tokens need a secrets decision nobody has
   made; credentials are passed at call time (`x-github-token`).

One bug the demo caught that the tests had not: a **capability-only activity was appearing under
Projects** in the Permanent Identity View. "Languages used in rota scheduler" is what work required,
not work that was done, and listing it as a project invents an accomplishment. Projects now include
only activities with a contribution or a consequence; capability surfaces under Skills. A test now
pins it.

**Not done, deliberately:** `apps/web` · real OAuth token storage · deeper GitHub access than
metadata.

## Out of scope

Real OAuth token storage — this slice records *which account* is connected and takes credentials at
call time, because storing tokens needs a secrets decision nobody has made · deeper GitHub access
than metadata (needs a concrete use case and privacy review) · other source types beyond CV and
GitHub · `apps/web` · Stated Context capture · PCI.
