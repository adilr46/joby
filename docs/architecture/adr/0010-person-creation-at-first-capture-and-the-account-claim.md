# ADR 0010 — Person Creation at First Capture, and the Account Claim

- **Status:** Accepted
- **Date:** 2026-08-14
- **Domains affected:** Identity (owner), Execution, Intelligence, Development, Memory (all gated by the claim)
- **Extends:** [ADR 0005](0005-durable-identity-as-the-person-centric-primitive.md) (Person as the primitive), [ADR 0008](0008-workspace-context-and-baseline-identity-state.md) (Baseline Identity State)

## Context

The identity roadmap requires upload-first onboarding: a placement student uploads a CV and gets a
grounded reconstruction back, without an account standing between them and the thing that
demonstrates the product. It also requires the Person and Durable Identity root to be created "at the
appropriate lifecycle point", deliberately unresolved.

Two constraints make the question concrete rather than philosophical.

**Nothing can be stored or scheduled without a Person.** Every `EventEnvelope` carries a non-empty
`personId`, and `parseEvent` rejects envelopes without one. A professional source cannot be captured,
and reconstruction cannot be durably scheduled, before some Person identifier exists. There is no
pre-Person state that the existing infrastructure can carry.

**Account verification must stay out of the Identity ontology** (roadmap Tier 2). Whatever
authentication does, it must not become a property of Durable Identity — a verified email is a fact
about an account, not about a person's professional reality.

The product decision behind this ADR: the first upload produces the durable professional profile
without an account; an account is *recommended* rather than required, because it is what makes the
downstream product — adaptation, execution, and longitudinal learning — usable at all.

## Decision

### The Person exists from the first professional source

**Capturing the first professional source creates the Person and the Durable Identity root, in the
same transaction as the source.** There is no anonymous or provisional pre-Person state, and no
later migration of a profile onto a Person once an account appears.

That Person begins **unclaimed**: it has a Durable Identity and, after reconstruction and
confirmation, real Explicit State — but nobody has yet proven they are the person it describes.

### The account claim is supporting infrastructure, not identity

**Claiming** a Person is an authentication act: an email address is associated with it and verified,
which is the first line of confirmation that the person operating the session is the subject of the
profile.

- The claim lives in **authentication/account infrastructure**, not in Durable Identity, and not in `packages/identity`'s ontology.
- **No account, email address, verification token, or verification timestamp becomes Explicit State, Learned State, a Structure node, an Activity, or a Relation.** An unclaimed and a claimed Person have identically shaped Durable Identity.
- The claim is a **precondition on operations**, expressed as a gate at the boundary — not a field the identity model reasons about.
- Authentication remains supporting infrastructure and does **not** become an eighth domain (roadmap assumption; ADR 0001 unchanged).

### What an unclaimed Person can do

| Available unclaimed | Requires a verified claim |
|---|---|
| Capture a professional source | Anything acting outward on the person's behalf — Execution, applications, portal submission |
| Reconstruction, review, editing, exclusion, confirmation | Opportunity evaluation and recommendation (Intelligence) |
| Retrieve Explicit State and the Permanent Identity View | Longitudinal accumulation — Records, Memory, and any PCI learning |
| Correct confirmed Explicit State | Anything that persists across devices or sessions, or that Joby contacts the person about |

The dividing line: **an unclaimed Person may build and inspect their own profile. Everything that
acts on the world, or that accumulates over time on their behalf, needs the claim.** Both halves of
that follow from the same fact — Joby does not yet know that the operator is the subject — and the
second is also why longitudinal learning waits: attributing accumulated career evidence to a person
nobody has verified would compound an unverified premise.

### The reconstruction slice is not gated

UC01–UC03 run unclaimed, end to end. Prompting for verification is a product moment to be placed
where it earns its interruption — after the user has seen their reconstruction, not before they have
seen anything.

### Professional sources are captured periodically, never continuously

Source capture is **user-initiated and episodic**, because professional reality changes episodically.
A person does not accumulate experience continuously, and a system that polls as if they do
manufactures churn — repeated reconstruction of unchanged material, and pressure to show movement
where none happened.

Capture happens when the user adds a CV, records an achievement, project or experience, connects
GitHub repository metadata they have selected, or points Joby at a portfolio link. **Joby does not
crawl, poll, or watch any source.** Refresh is an act the user performs.

## Consequences

- **Upload-first works with no account, and with no special case in the data model.** The Person is real from the first capture, so events, provenance and scheduling all have the identifier they require.
- **No profile migration path is needed** when a Person is later claimed — nothing moves, one association is added outside the identity model.
- **Unclaimed Persons will accumulate**, including abandoned ones. They hold real personal data, so retention and deletion for unclaimed Persons is a live obligation, not a cleanup task. Nothing implements it yet; it must not be discovered at launch.
- **A gate now exists that can be forgotten.** Every downstream capability has to check the claim, and the failure mode — an unclaimed Person quietly reaching Execution — is invisible in review unless it is tested. It needs an enforced boundary check, not a convention.
- **Verification cannot be leaned on for identity assurance.** A verified email proves control of a mailbox, nothing about the professional facts. It gates access; it never confirms a claim about the person.
- **Cost:** two states for a Person, forever. Every feature has to know which it requires, which is the same discipline ADR 0008 imposed with its two Workspace layers.
- No event contract changes. Claiming publishes nothing: it is not a change to the person's career reality.

## Alternatives Considered

- **Require an account before upload.** Rejected: it puts a verification wall in front of the only thing that demonstrates the product, and the roadmap's preferred UX is upload-first.
- **Anonymous session state, with a Person created at signup.** Rejected: the durable path requires a `personId` to schedule reconstruction at all, so this needs a parallel non-durable pipeline for pre-account work — two mechanisms for one flow, and a migration step where a real profile is copied onto a new Person.
- **A `verified` flag on Durable Identity.** Rejected outright: this is exactly the ontology contamination Tier 2 forbids. Once verification is a field on the identity model, product logic starts reasoning about it as though it described the person.
- **An `Accounts` domain.** Rejected: authentication is supporting infrastructure with no career meaning, and it would be an eighth domain owning something the product model does not contain (ADR 0001).
- **Gate nothing; let unclaimed Persons use everything.** Rejected: applying to a job, or learning durable conclusions, on behalf of someone nobody has verified is a real-world consequence resting on an unverified premise.
- **Periodic background refresh of connected sources.** Rejected: the roadmap forbids continuous crawling, and it manufactures reconstruction work over unchanged material — noise the product would then be tempted to present as change.

## Revisit When

Unclaimed-Person retention needs a policy (it will, and sooner than it feels); a downstream domain has
a genuine need to act for an unclaimed Person; verification needs to be stronger than email for a
consequential action, which is an authentication decision and still not an identity one; or a source
type appears whose value genuinely depends on freshness rather than on the user deciding it changed.
