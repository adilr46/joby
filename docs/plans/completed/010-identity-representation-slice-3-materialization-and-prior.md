# 010 - Identity Representation, slice 3: materialization and the Adaptation prior

## Goal

Finish Identity Representation for the placement scope. A shaped lens must be **observable** (a
general CV) and **consumable** (an optional positioning prior for Adaptation), with the future
learning path recorded and unbuilt.

- **UC09** — generate a general CV: `Identity Representation → CvDocument → LaTeX → PDF`.
- **UC10** — expose the lens as `Pᵢ` in `Aᶜ = T(R, X, L, C, Pᵢ)`.
- **UC11** — the `Memory → Representation` learning seam: documented, deferred.

## Domains affected

- **Identity / Identity Representation** — rendering and the prior. No new tables.
- **Adaptation** — gains the seam it will consume, on the Identity side (it has no code, and Identity
  must not import it). No Adaptation behaviour implemented.
- **Memory** — gains the deferred learning direction and its constraints in its README. No behaviour.
- **Execution** — untouched. Submission and the Application Record stay where they are.

## Doctrine check

- **Nothing derived is stored.** No document rows, no PDF bytes: a render is derived from current
  Explicit State plus the lens, so a correction reaches the next CV with nothing to invalidate.
- **Every CV line traces to a canonical node.** Entries are built from the positioned projection and
  nothing else; there is no path that composes a claim.
- **General, never opportunity-specific.** Nothing in the rendering path takes a JD, employer or
  posting. `ReusableMarketsCV ≠ BarclaysSubmittedCV`.
- **Prior, not filter.** `Pᵢ` carries preferences keyed by node id and **no evidence**, and states
  hiding as a preference rather than an absence. `HiddenInLens ≠ UnavailableToAdaptation`.
- **No user-authored LaTeX.** One server-controlled template, single-pass escaping, shell escape
  disabled. This is security code.
- **Joby holds no name.** The CV header is caller-supplied presentation input, printed and not stored
  (ADR 0010).
- **No learning.** No scoring, no recommendation, no automatic lens mutation, and no path by which
  Adaptation writes a lens.

## Events

None.

## Steps

1. ADR 0016; ADRs 0014 and 0015 marked *extended*.
2. `cv-document.ts`, `latex.ts`, `compiler.ts` (port + `PdfLatexCompiler`), `prior.ts` — the first
   three pure, the fourth pure.
3. Service: `renderCv`, `compileCv`, `getPrior`. Contract +1 (`getRepresentationPrior`); rendering on
   `/runtime`, where its only consumer and its toolchain live.
4. Routes: `GET /representations/:id/cv?format=json|tex|pdf`, `GET /representations/:id/prior`.
5. Tests: 14 unit (document, escaping, injection, prior), 10 integration.
6. Documentation, including the Memory seam and the `Aᶜ` signature extension.

## Verification

- `pnpm typecheck` clean; `pnpm test` — 216/216 against real Postgres (was 192).
- The escaping test caught a real bug during the slice: chained replacements re-processed
  `\textbackslash{}`. Replaced with a single-pass table.
- Proven rather than asserted: every CV line resolves to a canonical node; a correction appears in
  the next render; two renders of one lens are identical; a missing toolchain is reported and the
  `.tex` still returned; the prior contains no canonical label; a hidden fact appears in the prior as
  a preference **and** remains reachable through `getNode`, `getExplicitState` and the Permanent
  Identity View.
- Run for real against `apps/api` + `apps/worker`: a shaped Markets lens rendered a LaTeX CV with its
  framing in bold, its themes line, and the hidden degree absent — while the same degree was still
  present in the Permanent Identity View and its provenance intact. `?format=pdf` returned 503 with
  no toolchain installed.

## Out of scope

PDF verification against a real LaTeX installation (none available here), skill-level positioning,
positioning history, further output formats, Adaptation behaviour, and all Memory/PCI learning.
