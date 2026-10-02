# 006 — Identity Slice 4: the service boundary (UC12)

## Goal

Other Joby services consume Durable Identity through **one small stable contract**, with no route to
Identity's tables, its persistence types, or its reconstruction internals.

## The problem this slice fixes

`packages/identity/src/index.ts` currently exports ~90 names, including things no consumer should
ever see: `GitHubIngestionService`, `classifyAgainstState`, `projectPermanentIdentityView`,
`parseProposalContent`, `extractFromRepository`, `normaliseLabel`, `changesState`, and
`FakeGitHubClient` — a **test double, exported from the production surface**.

Every one of those is a way for a downstream domain to couple itself to how Identity works rather
than to what it means. The boundary is not the package; the boundary is what the package exports.

## Three audiences, three entry points

| Entry | Audience | Holds |
|---|---|---|
| `@joby/identity` | **Other domains** — Intelligence, Execution, Memory, Development | The `Identity` contract, its DTOs, the errors a caller must handle, and a factory |
| `@joby/identity/runtime` | **Joby's own runtimes** — `apps/api`, `apps/worker` | Composition: the contract plus source acquisition, job inspection and the reconstruction runner. Model adapters |
| `@joby/identity/testing` | Tests | `FakeGitHubClient` |

The split is by *who is asking*, not by convenience. A domain asking "what is true about this
person" needs nine methods. A runtime composing the system needs more, and that is a different
question with a different blast radius.

## The contract — exactly the UC12 capabilities

1. **Establish or locate** a person's Durable Identity — `getPerson`, `getDurableIdentity`.
   *No bare `createPerson`*: the Person exists from the first captured source (ADR 0010), so
   `captureSource` is the only thing that establishes one. A create-without-a-source method would
   contradict an accepted ADR to satisfy a wording.
2. **Capture a professional source** — `captureSource`.
3. **Inspect reconstruction** — `getSourceLifecycle`, `getProposal`, `listProposals`.
4. **Apply a reviewed reconstruction** — `confirmReview`.
5. **Retrieve canonical Explicit State** — `getExplicitState`.
6. **Correct Explicit State** — `correctNode`, `addNode`, `removeNode`.
7. **Retrieve Durable Identity** — `getDurableIdentity`, returning R, X and L as distinct components.
8. **Permanent Identity View** — `getPermanentIdentityView`, derived from R at read time.

Plus `getProvenance`, because "every confirmed fact is traceable" is only true for a consumer that
can ask. Nothing else. GitHub selection is **not** in the contract — no domain consumes it, and it
would be exactly the speculative API the goal rules out.

## Doctrine check

| Rule | How |
|---|---|
| No access to tables or internals | Internals stop being exported; a test pins the exact export list, and another scans app source for `identity_*` SQL |
| E and L governed separately | `getDurableIdentity` returns `explicit` and `learned` as distinct fields; `learned` is `null`, not `{}` |
| No PCI learning | Nothing added. `learned` stays `null` |
| The View is derived | Projected from R at read time; a test changes E and shows the View follow, with no table behind it |
| Concurrency preserved | Every mutating method takes an expected revision and returns the new one |
| No speculative APIs | Every contract method has a named current consumer |

## Steps

1. `src/contract.ts` — the `Identity` interface and its DTOs.
2. Re-cut `src/index.ts` to the contract; add `src/runtime.ts` and `src/testing.ts`.
3. `package.json` `exports` map with three entries, no wildcard.
4. Point `apps/api`, `apps/worker` and the tests at the right entry.
5. Boundary tests, including a downstream-consumer simulation.

## What actually happened

Done and verified 2026-08-14. `pnpm typecheck` clean; **153 tests pass** (24 new). Both runtimes
were started to confirm the subpath `exports` resolve under real Node/tsx — tests resolve through
vitest aliases, so a working test run would not have caught a broken `exports` map.

The surface went from **~90 exports to 12 values plus types**. Everything removed was a way to
couple to how Identity works: `GitHubIngestionService`, `classifyAgainstState`,
`projectPermanentIdentityView`, `parseProposalContent`, `extractFromRepository`, `normaliseLabel`,
`changesState`, `EMPTY_PROPOSAL`, the model adapters, `IdentityService` itself — and
`FakeGitHubClient`, a test double that had been exported from the production surface.

Decisions taken during implementation:

1. **No bare `createPerson` in the contract.** UC12 says "create or locate", but ADR 0010 says the
   Person exists from the first captured source. `captureSource` establishes; `getPerson` and
   `getDurableIdentity` locate. Adding a create-without-a-source method would have contradicted an
   accepted ADR to satisfy a wording.
2. **GitHub selection is not in the contract.** No domain consumes it — it is source acquisition,
   and it lives on `/runtime`. Putting it in the contract would be precisely the speculative API the
   goal excludes.
3. **`IdentityService implements Identity`.** The compiler now enforces that the class satisfies the
   contract, so the two cannot drift apart silently.
4. **An `IdentityRuntime` facade was built and then removed.** It forced `.identity.` /
   `.sources.` prefixes across every call site and added no enforcement the entry-point split does
   not already give. Deleting it was applying "avoid speculative APIs" to my own scaffolding.
5. **The export list is pinned by a test.** Types are erased at runtime and cannot be checked, so
   the assertion covers *value* exports — which is what a consumer can actually call. Widening the
   boundary now fails a test and has to be argued for in a diff.
6. **No wildcard subpath.** A `./*` entry in `exports` would have made `@joby/identity/src/repository`
   importable and undone the whole slice; a test asserts its absence.

**Not done, deliberately:** `apps/web` · HTTP-level API versioning (no external consumer yet) ·
splitting a read-only consumer interface out of the contract (speculative on today's consumers).

## Out of scope

`apps/web` · PCI · Adapted State and contextual translation (ADR 0012 — outside this boundary) ·
HTTP-level versioning · a separately deployed service (ADR 0001).
