# Application

## Applications made outside Joby

Open `/applications/manual` on the API (normally `http://localhost:3001/applications/manual`).
Enter the configured access token, company, role and current stage; a historical stage date is optional.
The record appears on your own profile immediately. Join a peer group and explicitly share a signal
to show progress to others. A newer unshared stage does not leak through the shared profile.

`recordExternalApplication` writes the root, user-reported company/role and initial timeline together.
Unknown Identity/Opportunity revisions are null, and no submitted documents or outcomes are fabricated.
An `external:` reference denotes an uncaptured opportunity, not an Opportunity record or understanding.
`requestId` is a client UUID scoped to the person and makes retries idempotent. Company/role conflicts
under that same id are rejected. `recordOwnedProgress` verifies ownership and appends later stages.

HTTP: `POST /applications/manual` accepts `{ company, role, stage, occurredAt?, requestId }`;
`POST /applications/:id/progress` accepts `{ stage, occurredAt? }`.
`POST /applications/:id/interviews` accepts `{ kind, observations, occurredAt? }`, and
`POST /applications/:id/interviews/:stageId/reflection` accepts `{ reflection }`. The trusted actor
supplies personId; interview observations and the person's reflection remain separate writes.
Apply migration `0018_external_application.sql` with `pnpm db:migrate` before using this path.
The form uses `JOBY_SOCIAL_ACTORS` authentication configured for the existing Social API.

**Status: implemented.** The durable structured observation of one Person × Opportunity interaction
(ADR 0031).

```text
Oₙ = (Pₙ, Wₙ, Rₙ, Aₙ, Xₙ, Iₙ, Yₙ)
```

## Owns

The live lifecycle and durable record of what actually happened — seven epistemically distinct
parts, kept apart on purpose:

| | Meaning | What is actually stored |
|---|---|---|
| `Pₙ` | Person state used | grounding Profile Unit ids, the identity revision, the user context relied upon — verbatim, not re-read live |
| `Wₙ` | Opportunity / world state used | the opportunity id and revision |
| `Rₙ` | Representation prior used | recommended vs selected representation id and revision; `overridden` is **derived**, never stored |
| `Aₙ` | Adaptation produced | a reference to the adaptation context and drafts consulted — never a copy of Adapted State |
| `Xₙ` | Submitted reality | what was actually sent, immutable once recorded |
| `Iₙ` | Interaction history | lifecycle timeline, communications, interview stages — all append-only |
| `Yₙ` | Resolved outcome | how the external world responded |

## Does not own — and this is the whole design

Every reference to another authority here is an id, a revision, or a copy of material that already
crossed the external boundary. **Nothing here is a live projection of Identity, Representation,
Opportunity or Adaptation state.**

- `groundingProfileUnitIds` names which canonical units the submitted material cites; it is not a
  second Profile Unit store.
- `identityRevision` and `opportunityRevision` say *which reading* this application was built
  against; they do not re-derive from Identity or Opportunity, and a later correction to either does
  not silently rewrite what this application recorded.
- `adaptationContextId` and `draftIds` reference Adaptation's own records. Adapted State is composed
  on request and stored nowhere (ADR 0013); Application does not change that by holding a second
  copy.

## `Aₙ ≠ Xₙ`

What Joby produced and what the person actually sent can differ — an edit, a swapped attachment, a
question answered differently at the last moment. `SubmittedMaterial.sourceDraftId` traces sent
content back to a draft *when it came from one*; `editedFromSource` says whether it still matches.
Its absence — no source draft at all — is informative: this material did not originate from anything
Joby produced.

## `Xₙ ≠ Yₙ`

What was sent is a fact about the person's action. How the world responded is a fact about the
world, observed later, and often not caused by anything in `Xₙ` — a placement outcome is dominated by
headcount, timing, an internal candidate. They are separate tables so a later reader cannot read
causation into two facts that merely happened in sequence.

## `currentState` is derived, never stored

The lifecycle timeline is append-only. A correction is a new entry `supersedes`ing the one it
corrects — the superseded entry is kept, not deleted, so what was believed at the time stays
inspectable. `currentState` is computed from timeline chronology on every read (`deriveCurrentState`
in `model.ts`); there is no stage column beside it that could disagree.

## The resolved-evidence seam toward PCI

`getResolvedEvidence` projects an application's history into `@joby/pci`'s
`ResolvedApplicationEvidence` shape — the input contract PCI already declared. **No learning happens
here**: this module does not import or call `@joby/pci`. Wiring `getResolvedEvidence` into
`pci.observe` is a composition-root decision for whoever builds the worker pass that does it.

Two rules the projection enforces:

- **Nothing crosses until the application has resolved.** `isResolved` requires at least one recorded
  outcome; an application still in progress projects to `undefined`.
- **The two signal families stay distinct**, per PCI's own contract: a representation override and
  an interview reflection are `user_response`; a timeline stage reached and an outcome are
  `world_response`. `user preference ≠ external effectiveness`.
- **Outcome meaning is more precise than the stored world-response bucket.** `offer_declined`,
  `ghosted`, `stage_reached` and their aliases normalise to canonical application outcomes, then
  project progression facts such as reached-interview, reached-offer and terminal polarity. These are
  strategy facts for PCI, not professional claims about the person.

## Only meaningful reality is persisted

Retries, selectors, captcha checkpoints and transient portal errors have **no column anywhere in
this schema**. That is structural exclusion, not filtering: Execution's mechanical detail was never
written here to begin with, so the resolved-evidence projection has nothing of that shape to leave
out.

## Events

Application publishes facts only after it has written the Application-owned state that makes them
true (ADR 0039):

- `ApplicationSubmitted` after `X_n` submitted material is recorded.
- `InterviewRecorded` after an interview-stage observation is recorded.
- `OutcomeObserved` after `Y_n` is recorded.

These events are downstream notifications, not Application's write path. Handlers may update their
own projections, jobs or learning inputs; they do not decide or mutate Application truth.
