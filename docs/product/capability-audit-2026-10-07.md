# Product capability audit — 7 October 2026

This audit follows the user's 33-capability list. It traces implementation, composition in
`apps/api` and `apps/worker`, browser code, and existing test assertions. It is a source audit,
not proof that a deployed instance works.

## Status definitions

- **Full:** the scoped capability has implemented behavior and an existing browser path. This
  does not mean production validation has passed.
- **Partial:** meaningful implementation exists, but the user journey, runtime wiring, or part of
  the stated behavior is missing.
- **Not implemented:** no substantive behavior for the whole capability was found.
- **API:** connected to the running HTTP composition root; **library:** implemented code that
  is not exposed through that runtime.

Under this product-facing definition: **5 full, 28 partial, 0 wholly unimplemented**. This is not
a completion percentage: a missing screen and a missing learning pipeline have different costs.
Many partial capabilities already have substantial database-backed services and API endpoints.

## Block 1 — Import and professional profile (1–5)

| # | Capability | Status | What exists | What remains |
|---|---|---|---|---|
| 1 | Import text/Markdown CV | Partial | API accepts professional source content; capture stores source bytes and schedules reconstruction; first capture creates a person. | The browser import hardcodes `application/pdf`; add text/Markdown selection or paste. Carry the existing person ID when adding another source. |
| 2 | Structured, reviewable proposal | Full | API + worker extraction/reconstruction + persisted proposal + browser proposal display with quotes and uncertainty. OpenAI extractor is selected when configured; deterministic fallback exists. | Real-document and live-model validation still needed. |
| 3 | Review each fact before confirmation | Partial | Backend requires item decisions, supports edits/exclusions/supplements, validates relations, and confirms atomically with revision guards. | Proposal page is display-only: no item decision controls or confirmation call. |
| 4 | Correct/remove facts while retaining evidence | Partial | PATCH/DELETE fact APIs, provenance reads, correction history, retained source evidence; worker reconciles lens decisions after removal. | Profile editor and provenance/history UI. Fix the review-history route shadowing described below. |
| 5 | Familiar profile sections | Partial | Permanent Identity projection and `/identity/persons/:id/view` return education, experience, projects, achievements and skills. | A confirmed-profile screen. The proposal preview's sections are not the confirmed profile. |

Evidence: `apps/api/src/routes/identity.ts`, `apps/web/public/identity-import.js`,
`apps/web/public/identity-proposal.js`, `packages/identity/src/reconstruction.ts`,
`packages/identity/src/review.ts`, `packages/identity/src/correction.ts`,
`packages/identity/src/projection.ts`; integration assertions in
`tests/identity-reconstruction.test.ts` and `tests/identity-explicit-state.test.ts`.

## Block 2 — Enrichment, preferences and lenses (6–10)

| # | Capability | Status | What exists | What remains |
|---|---|---|---|---|
| 6 | GitHub account + selected repositories | Partial | API connect/list/select/ingest/refresh; real HTTP GitHub metadata client; repository selection checked before ingestion; snapshots enter source/proposal pipeline. | Browser account/repository flow. Current credentials arrive in request headers; no OAuth sign-in/token-storage flow. Validate live GitHub access. |
| 7 | Duplicate/complementary/conflicting sources | Partial | Proposal delta classification handles duplicate, enrichment, clarification, conflict and new relations; duplicate sources are deduplicated. | Matching is conservative normalized label equality, not broad semantic matching. Proposal UI does not render delta annotations or comparison decisions. |
| 8 | Current goals/preferences/constraints | Partial | Stated Context API and storage support direction, free-text preferences/constraints and typed conditions for location, arrangement, availability, sponsorship and related conditions. | Preferences form and authenticated profile ownership connection. Free-text considerations are retained, but not comprehensively interpreted by ranking. |
| 9 | Multiple reusable lenses | Partial | Persistent named representations, independent decisions, list/create/read APIs; grounded in current confirmed identity. | Lens list/create/choose UI. |
| 10 | Lens prominence/order/phrasing | Partial | Decision and positioning APIs support include/hide, rank, emphasis, framing and themes; revision checks. | Lens editor and preview, connected to CV output and routing selection. |

Evidence: `packages/identity/src/github/`, `packages/identity/src/delta.ts`,
`packages/identity/src/stated-context.ts`, `packages/identity/src/representation/`,
`apps/api/src/routes/identity.ts`; tests in `tests/identity-enrichment.test.ts`,
`packages/identity/src/delta.test.ts`, `tests/identity-representation.test.ts`.

## Block 3 — General CV and opportunity capture (11–14)

| # | Capability | Status | What exists | What remains |
|---|---|---|---|---|
| 11 | General lens CV as LaTeX | Partial | CV document builder, LaTeX renderer and HTTP JSON/TeX/PDF route. The TeX path is implemented; compilation has an explicit port and unavailable-toolchain error. | CV browser preview/download. API composition supplies no compiler, so the PDF route currently returns compiler-unavailable; configure it and validate real compilation. No LaTeX compiler was found on this audit's shell PATH. |
| 12 | Posting/email/contact-note capture | Partial | Opportunity capture API accepts raw text with provenance and evidence kinds; multiple pieces can attach to one opportunity. | Paste/capture UI and navigation into understanding/ranking. |
| 13 | Structured opportunity reading | Partial | Persisted revisioned understanding, worker polling and HTTP reads; company/role/requirements/conditions/questions/unknowns supported. | Runtime uses only a shallow deterministic interpreter: recognized labels, headings and bullets. General free-form posting/email interpretation is incomplete. |
| 14 | Preserve stated/unstated boundaries | Partial | Original bytes retained; interpretation separated from evidence; uncertainty and attribution recorded; missing values aren't defaulted. | The parser can miss facts present in prose and then describe them as unstated. Distinguish 'not extracted' from 'not stated', and verify facts against source spans. |

Evidence: `packages/identity/src/representation/cv-document.ts`,
`packages/identity/src/representation/compiler.ts`, `apps/api/src/routes/opportunity.ts`,
`packages/opportunity/src/understanding/factory.ts`,
`packages/opportunity/src/understanding/deterministic-interpreter.ts`,
`tests/opportunity-understanding.test.ts`, `tests/identity-representation.test.ts`.

## Block 4 — Decisions, tailoring and writing (15–19)

| # | Capability | Status | What exists | What remains |
|---|---|---|---|---|
| 15 | Ranked/tiered opportunity comparisons | Partial | `/routing/opportunities` invokes evaluation/ranking/tiering/policy with explanations, confidence, evidence references and uncertainty. | Comparison UI. Trajectory and market quality are neutral placeholders; matching is exact normalized capability equality. Outcome calibration and learned evaluation priors are not wired in API composition. |
| 16 | Best lens, coverage and gaps | Partial | `/routing` reads lens capabilities and opportunity requirements; recommends and explains coverage/missing requirements; bounded PCI tie-break weights are connected for reads. | Lens comparison/selection UI. Matching remains coarse; PCI reads have no observed production evidence until its write path is wired. |
| 17 | Opportunity conditions vs preferences | Partial | Router and Adaptation compare typed conditions and expose aligned/conflicting/unknown states without forbidding pursuit. | User-facing comparisons and unanswered-question flow. Rich interpretation of free-text considerations is absent. |
| 18 | Tailor confirmed evidence; show gaps | Partial | Adapted State combines chosen lens, confirmed profile, opportunity and preferences; recovers relevant confirmed evidence and reports unsupported requirements; API exposes it. CV route/render-plan adapters also exist in the library. | Tailoring UI and exposure of adapted CV rendering. Existing adaptation routes do not expose the CV path/rendering helpers. |
| 19 | Grounded answers/cover letters | Partial | Readiness/input/generate/edit/list-draft APIs, persistent drafts, grounding validation. | Writing workspace. Runtime writer is deterministic composition of up to three evidence entries and personal input, not a rich question-aware writer. Connect final materials to Application records. |

Evidence: `apps/api/src/main.ts`, `packages/router/src/router.ts`,
`packages/router/src/opportunity-evaluation.ts`, `packages/router/src/opportunity-ranking.ts`,
`packages/translation/src/adaptation/service.ts`,
`packages/translation/src/adaptation/deterministic-writer.ts`,
`packages/translation/src/adaptation/cv-render-plan.ts`,
`packages/translation/src/adaptation/cv-render-adapters.ts`,
`apps/api/src/routes/adaptation.ts`; Router unit tests and `tests/adaptation-writing.test.ts`.

## Block 5 — Personal input and application history (20–24)

| # | Capability | Status | What exists | What remains |
|---|---|---|---|---|
| 20 | Ask for personal motivation/timing | Partial | Readiness gate returns `needs_input`; explicit input endpoint stores answers; generation checks readiness before writing. | Browser questions/answer/resume-generation loop. |
| 21 | Writing references for style | Partial | Persistent reference add/list/remove library methods; no reconstruction into professional facts; Adaptation selects and passes references to its writer. | Reference HTTP routes and UI. Current deterministic writer never reads reference contents, so actual style adaptation is absent despite returned `references.used` IDs. |
| 22 | Record external applications | Full | Authenticated manual-entry API and page; company/role/date/stage; retry-safe request IDs; private default. | Supplied date is the stage occurrence date. A separately retained original application date for entries starting at later stages would require additional modeling. |
| 23 | Stages/interviews/outcomes/feedback | Partial | Stage updates via API/UI; interview observations and reflection via authenticated API; library supports outcomes and verbatim feedback. | Outcomes/feedback HTTP routes; interview/debrief UI. Selecting offer/rejected/withdrawn on manual page appends timeline only, not an outcome record. |
| 24 | Historical submissions and progress | Partial | Application library records state/revision lineage, immutable submitted materials, append-only progress and superseding corrections. | No running route calls `createApplication` for a captured opportunity or `recordSubmission`; no full historical-record HTTP read/view. Execution/drafts are not connected to these records. |

Evidence: `packages/identity/src/representation/reference.ts`,
`packages/translation/src/adaptation/service.ts`,
`packages/translation/src/adaptation/deterministic-writer.ts`,
`packages/application/src/contract.ts`, `packages/application/src/service.ts`,
`apps/api/src/routes/application.ts`, `apps/web/public/manual.js`, `tests/application.test.ts`,
`tests/adaptation-writing.test.ts`, `apps/api/src/routes/application.test.ts`.

## Block 6 — Interviews and cohorts (25–29)

| # | Capability | Status | What exists | What remains |
|---|---|---|---|---|
| 25 | Preparation packet | Partial | Interview library maps confirmed Profile Units to requirements, produces observed/inferred questions, story prompts, gaps and context checks. | Instantiate with real Opportunity/Application/Identity ports; HTTP endpoint and packet UI. Manual external records have synthetic opportunity IDs and no understanding revision: add an explicit opportunity-link/enrichment path before preparation. |
| 26 | Temporary rehearsal/coaching | Partial | Library produces audience-filtered rehearsal turns and heuristic coaching with no permanent score or writes. | Runtime API and rehearsal UI; richer answer analysis is not implemented. |
| 27 | Invite facts without stage inference | Partial | Pure parser identifies supported platforms, requisition and limited company facts; explicitly avoids stage changes and guessing HireVue modality. | Invite intake, application matching, HTTP exposure and fact review UI. Parsing is limited regex behavior. |
| 28 | Actual interview vs reflection | Partial | Separate observation/round records and reflection attachment; owner-checked HTTP APIs; pure debrief draft helper. | Browser debrief controls and connection from approved debrief drafts to those APIs. |
| 29 | Relevant peer cohorts | Full | Normalized cohort identity with university/degree/track/cycle/country/audience; membership storage and authenticated join/leave/list APIs; manual page has join form. | Leaving/managing membership through the browser is missing; fields are self-declared, not automatic profile-derived enrollment. |

Evidence: `packages/translation/src/interview/service.ts`,
`packages/translation/src/interview/ports.ts`, `packages/translation/src/interview/invite.ts`,
`packages/translation/src/interview/service.test.ts`, `apps/api/src/routes/application.ts`,
`packages/social/src/model.ts`, `packages/social/src/service.ts`, `apps/web/public/manual.html`.

## Block 7 — Peer sharing and existing page (30–33)

| # | Capability | Status | What exists | What remains |
|---|---|---|---|---|
| 30 | Explicit signal/audience sharing | Full | Owner-checked share/hide routes, explicit selected signal and cohort, manual-page controls; private notes/materials/reflection excluded. | No substantive backend gap found for this scope. |
| 31 | Locality-aware peer feed | Partial | Feed API selects closest sufficiently populated relevant audience; default five other participating peers; explicit sparse fallback; shared milestones only. | Browser feed and locality/filter controls. Sparse relevant fallback is implemented when no audience reaches threshold, so sufficient density is not guaranteed. |
| 32 | Link/unlink and profile totals | Partial | Authenticated link/unlink endpoints, visibility checks, own-signal prohibition, duplicate-click prevention, profile Link totals. Existing manual page displays received total. | Feed cards with Link/unlink controls and peer-profile navigation. |
| 33 | Lightweight manual web page | Full | `/applications/manual` serves HTML/JS/CSS and performs entry, stage updates, cohort joining and explicit sharing/hiding against same-origin authenticated APIs. | This page is scoped to those actions; it is not a complete interface for all 33 capabilities. |

Evidence: `apps/api/src/routes/social.ts`, `packages/social/src/service.ts`,
`packages/social/src/repository.ts`, `apps/web/public/manual.js`,
`packages/social/src/service.test.ts`, `tests/social.test.ts`.

## Connections to finish, in dependency order

1. **One user identity across flows.** CV import saves a generated person ID in session storage;
   manual/social API resolves actors from bootstrap bearer tokens (`JOBY_SOCIAL_ACTORS`). No
   browser account/onboarding path connects the imported person to that authenticated actor.
   Identity, Opportunity, routing and Adaptation handlers also do not use the social actor resolver.
   Establish ownership checks and one session before exposing those profile operations as a product.
2. **Import → item review → confirmed profile.** Add text/Markdown intake, existing-person source
   uploads, decision controls, atomic confirmation, confirmed-profile projection and correction UI.
3. **Profile → preferences → lenses → general CV.** Implement editor/selection screens and browser
   export. Wire GitHub selection and ingestion into the same reviewed-source flow.
4. **Opportunity → reading → comparison → selected lens → adapted evidence → writing.** Connect
   existing HTTP services in a navigable flow; improve extraction and distinguish extraction
   uncertainty from assertions that supplied material was silent. Expose adapted CV helpers.
5. **Writing references → effective style.** Expose reference management and make a writer use
   selected reference contents while maintaining the separate professional-grounding boundary.
6. **Pursuit/submission → Application record.** Expose captured-opportunity application creation,
   retain revisions and exact submitted content, and connect execution confirmation or explicit
   manual submission recording. Add owner-checked full historical reads and outcome/feedback writes.
   An execution session or generated draft is not proof that an application was submitted.
7. **Application + understood opportunity + profile → interview workspace.** Instantiate Interview
   Intelligence with actual ports, expose prepare/parse/rehearse/coach, and let users approve debriefs
   into the existing observation/reflection endpoints. Link external applications to opportunities.
8. **Shared progress → feed → Links.** Add feed cards, audience-density explanation, filters,
   peer profiles and Link/unlink actions to the existing social API.
9. **Resolved outcomes → PCI → useful learned priors.** Register an OutcomeObserved consumer that
   reads `getResolvedEvidence` and observes it; make updates transactional and durably idempotent
   across process restarts/retries. Enable personal user-response counts and richer opportunity
   features under an explicit learning design. Router prior reads are already wired; writes are not.
   Manual timeline terminal stages currently do not create the resolved outcome records this needs.

## Concrete defects/limitations found during tracing

- **Review-history route is shadowed.** In `apps/api/src/routes/identity.ts`, the generic GET
  `resource === 'proposals' && id` branch precedes `action === 'review'` and does not require an
  absent action. `/identity/proposals/:id/review` therefore returns a proposal rather than review
  history. Add an action guard or reorder the handlers.
- **Import does not reuse its stored person ID.** `identity-import.js` stores `joby-person-id`
  after upload but never sends `x-person-id` on subsequent uploads. The existing-person source
  enrichment journey is not connected in this page.
- **Style reference provenance overstates actual use.** Adaptation reports selected reference IDs
  as `used`, while the default writer ignores references. Selection alone is not style adaptation.
- **Outcome learning is not stage tracking.** `recordOwnedProgress` calls `appendTimelineEntry`;
  it does not call `recordOutcome`. Terminal-looking UI statuses do not feed the resolved-outcome
  learning path.
- **PCI retry protection is process-local.** `LayeredPci` uses an in-memory seen set, marks seen
  before writes, and sequentially increments multiple cells. Durable deduplication/transactional
  updates are necessary before attaching it to at-least-once event delivery.
- **Runtime intelligence is uneven.** CV extraction has an optional OpenAI adapter; Opportunity
  interpretation and application writing in API composition use deterministic implementations.
  Ranking has honest neutral placeholders for trajectory and market quality, not learned models.

## Verification and repository state

- Existing tests were inspected for assertions covering reconstruction, per-item review,
  correction/provenance, enrichment, lenses/CV, grounding, application history, interviews and social
  privacy/locality/Links. Their presence does not establish that they currently pass.
- Attempted `pnpm test` and `pnpm typecheck`: both unavailable because `pnpm` is not on PATH.
  `node_modules/.bin` is also absent. No dependencies were installed for this read-only audit.
- `node --check` passed for `manual.js`, `identity-import.js` and `identity-proposal.js`.
- No live API/database/browser journey, GitHub request, model call or PDF compilation was run.
  Database integration tests require a configured `DATABASE_URL`.
- The working tree already contained untracked `packages/pci/ml/`. It includes Python
  `joby_pci_ml/features.py` and `shared_model.py` at audit time. This corrects the earlier statement
  that no Python implementation existed: Python shared-model code is present, but no running
  API/worker integration was found. These existing files were not modified.
- Repository README/status comments sometimes lag newer implementations; classifications above
  are based on code paths rather than completion labels in documentation.
