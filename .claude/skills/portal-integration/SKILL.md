---
name: portal-integration
description: Working with external application systems and ATS portals — portal identification, field discovery, canonical-field mapping, dropdowns, multi-step flows, uploads, validation, session state, execution repair, checkpoints and captchas, sensitive disclosures, Targeted Uncertainty Escalation, and capturing final submitted state. Use for anything driving an external submission.
---

# Portal Integration

Driving an external application system on the person's behalf, and recording truthfully what was
submitted.

Higher-stakes than it looks: a mistake here is not a bad UI state, it is a wrong claim sent to an
employer under the person's name, usually unrecoverable.

## The rule that shapes the design

**Portal mechanics are operational state. They never pollute Durable Identity or PCI.**

A portal's dropdown taxonomy, its field names, its multi-step structure, its quirks and its session
tokens describe *that portal*, not the person. None of it belongs in Explicit State, and none of it
belongs in Learned State either.

This is Fast Operational Loop work, and it happens entirely inside a **Temporary Application
Workspace**: Durable Identity + Opportunity + Company + relevant PCI + current application/session
state. It acts, and produces a Record.

- A portal's categories don't reshape the person's history. If a portal offers five degree
  classifications and the person's doesn't fit, that's a mapping problem — not a reason to change
  what's true about them.
- Session state, progress, retries and scraped field metadata live in the Temporary Workspace:
  operational, stored separately from Durable Identity, and discarded when no longer useful.
- **Retries, dropdown errors, captcha events and transient failures are noise, not evidence.** The
  Slower Learning Loop must never learn from them (ADR 0006). Repeated failure on one portal is a
  durable fact about *that portal*; it says nothing about the person.
- The only durable outputs are the **Application Record** (what was actually submitted) and any
  evidence or outcome the person confirms afterwards.

## Portal and ATS identification

Identify the system before touching it — Workday, Greenhouse, Taleo, a university placement portal, a
bespoke form. Behaviour, field conventions and failure modes are per-system, and knowing which one
you're on turns most of the rest from discovery into recall.

Record the identification with the application, and treat unknown as a first-class case: degrade to
careful, heavily-gated behaviour rather than guessing.

## Field discovery

Read the form as it actually is, not as the portal type usually is. Capture for each field: label,
type, required, constraints, options, and which step it's on. Labels are ambiguous, mislabelled, and
sometimes wrong — capture surrounding context too.

Store this as operational metadata against the portal, not against the person.

## Canonical-field mapping (Durable Identity → portal fields)

Mapping the person's Explicit State onto this portal's fields. Where most silent damage happens.

- Map **from** Explicit State. Never from a previously generated representation.
- Every mapping is explicit and reversible: which Explicit State fact, into which field, transformed how.
- **A lossy mapping is a decision, not a detail.** If the portal can't express what's true, surface it rather than choosing the nearest option.
- Unmapped required fields are a stop, not a gap to fill plausibly.

## Dropdowns and constrained inputs

The characteristic portal problem: the truth isn't in the list.

- Exact match, then confident synonym, then **ask**. Never "closest available" on anything consequential.
- Never widen a claim to fit an option — a 2:1 does not become a first because the dropdown lacks the right band.
- Options that carry legal or eligibility weight — work authorization, visa status, right to work, disability — are **never** auto-selected. Ever. Regardless of confidence.
- Record the exact option chosen, not your interpretation of it.

## Multi-step flows

Multi-page, stateful, timing out, sometimes losing everything on a back navigation.

- Checkpoint after every step: what was entered, what the portal accepted, where you are.
- Assume interruption between any two steps and design to resume rather than restart.
- Never re-enter a completed step blindly — many portals treat resubmission as a new application.
- Know which step is the point of no return, and gate hard before it.

## Uploads

Verify what was accepted, not just that upload returned success. Wrong file, silently truncated, or
converted are all common. Record the exact artefact submitted — it becomes part of the Application
Record and must be reproducible byte-for-byte later.

## Validation

Portal-side validation is authoritative and often undocumented. Treat rejection as information about
the portal, and record it — the same rejection will happen to the next person. Never work around a
validation rule by altering the truth to satisfy it.

## Session state

Credentials, cookies, tokens, progress. Operational, sensitive, and short-lived.

- Never in logs, error messages, model prompts, or Durable Identity.
- Scoped to one person and one application; expiry handled explicitly.
- Session expiry mid-flow is a normal path — resume from the last checkpoint.

## Execution repair

Portals change without notice. When a step fails: distinguish *the portal changed* from *the data was
wrong* from *the portal is down*. Retry only what is genuinely idempotent — a submission is not.
Repair the mechanics; never repair by adjusting what is claimed about the person.

Repeated failure on one portal is a durable fact about that portal worth recording. It says nothing
about the person.

## Checkpoints and captchas

Some steps require a human, by design. Captchas, MFA, identity verification, explicit consent.

Treat them as expected control points, not errors: pause, hold state, hand to the user with clear
context about where they are and what's needed, resume cleanly. Never attempt to defeat a control
intended to confirm a human is present — that's both wrong and a reliable way to get the person's
application rejected.

## Sensitive disclosures

Diversity monitoring, disability, health, ethnicity, criminal record, visa and work authorization
status.

**Never** pre-filled, defaulted, inferred, remembered across applications without explicit consent, or
included because it was disclosed once before. Each is a fresh, explicit decision by the person, with
"prefer not to say" always available and never discouraged. The person must see exactly what will be
sent before it is sent.

## Targeted Uncertainty Escalation

When uncertain, escalate **narrowly and specifically** rather than abandoning the run or guessing.

- Ask one precise question about the one field in doubt, with the portal's exact wording and options, and enough context to answer in seconds.
- Hold everything else in state; do not restart the flow, and do not force a re-review of settled fields.
- Escalate immediately, regardless of confidence, for: consequential claims, sensitive disclosures, legal or eligibility questions, anything irreversible, and anything where the truth doesn't fit the options.
- Batch related questions where it genuinely helps; never batch by dumping the whole form back on the user.
- Record the answer against the portal's field so the same question isn't asked again — that's portal knowledge, not a new fact about the person.

The failure mode this exists to prevent: an agent that is 80% sure filling the field anyway because
asking felt like failure. Asking is the feature.

## Final submitted-state capture

At submission, capture what was **actually** submitted: every field value as sent, the exact
artefacts uploaded, the portal's confirmation and reference, and the timestamp.

This becomes the **Application Record**, and it is immutable. It is never regenerated from current
truth, never "corrected" when Explicit State later changes, and never reconstructed from what you
intended to send. If capture failed, record that it failed — an honest gap beats a plausible
reconstruction.

Execution publishes `ApplicationSubmitted` once the record is durable.

## Before building anything here

A browser or portal runtime is a new deployed service and **needs its own ADR first** (ADR 0001).
Nothing in this skill authorises adding one. Use `worker-engineer` for the runtime work and
`adversarial-reviewer` on every flow — this is the area where partial failure and stale state cause
real harm to a real person's prospects.
