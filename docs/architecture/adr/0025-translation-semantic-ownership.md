# ADR 0025 — Semantic Ownership Inside Translation

- **Status:** Superseded by ADR 0029
- **Date:** 2026-09-01
- **Modules affected:** Intelligence, Adaptation, Execution; Opportunity, Application and Portal structurally
- **Amends:** ADRs 0007, 0023 and 0024

## Context

ADR 0024 established Translation as an enclosing boundary but deliberately left Intelligence and
Execution without authority. That caution prevented placeholder contracts, but it also preserved an
older ownership split which no longer describes the intended semantics. In particular, Adaptation
currently computes the relationship between stated opportunity conditions and the person's stated
conditions, while the empty Intelligence seam is described as owning nothing.

The required distinction is now explicit:

- **Intelligence** understands the opportunity, maps it to the person, and evaluates what that
  relationship means.
- **Adaptation** decides how existing professional truth should be represented for that opportunity.
- **Execution** carries the intended application through the external system and reacts to
  mechanical feedback.

## Decision

Those definitions are the semantic authorities inside Translation.

Information may cross their public boundaries. Only the semantic owner mutates its own state. An app
composition root may coordinate calls, but it does not acquire domain authority by doing so.

### Intelligence

Intelligence owns attributed opportunity understanding, person–opportunity mapping, relationship
evaluation and the meaning of uncertainty in that relationship. Opportunity may remain the source
of canonical opportunity records, sourcing, import, normalization and provenance; it does not own
the interpretation of that opportunity for a person.

This slice relocates only the existing deterministic condition mapping from Adaptation. It adds no
posting parser, fit assessment, trajectory evaluation, recommendation or persistence. Those remain
unimplemented.

### Adaptation

Adaptation owns opportunity-specific representation decisions and temporary representation state:
evidence selection and recovery, ordering, emphasis, wording, elicited representational input,
grounded drafts and operational edits. It consumes Intelligence output as information. It neither
recomputes nor mutates Intelligence state.

An Adaptation Context may retain identifiers and input revisions needed to reproduce its own work;
that does not transfer ownership of the referenced information.

### Execution

Execution owns the operational attempt to carry user intent into an external system and its reaction
to mechanical feedback: submission orchestration, portal interaction state, mappings, retries,
captchas and operational failures. Application intent and immutable historical records may be
represented as distinct information, but Application and Portal do not remain competing semantic
owners of execution behaviour.

No Execution behaviour or contract is implemented in this slice. The seam remains empty until a
vertical use case needs it.

## Consequences

- Adaptation no longer owns condition relationship mapping or reads Stated Context for that purpose.
- Intelligence gains a public pure mapping capability by relocation of existing behaviour only.
- The API's in-memory supplied-understanding implementation remains an explicit placeholder; its
  existing HTTP route and runtime behaviour are preserved.
- Opportunity narrows to opportunity source/record ownership. Application and Portal remain
  documentation placeholders, with their former execution claims superseded.
- Translation remains an enclosing boundary with no behaviour, state, events or root export.

## Remaining conflicts

- The compatibility URL for supplying structured understanding remains
  `PUT /adaptation/opportunities/:id`. Its handler is now Intelligence-placeholder-owned, but
  renaming the public path would be a behavior change and needs an API transition decision.
- `adaptation_context` retains database foreign keys to `identity_person` and
  `identity_representation`. Runtime access is through public capabilities, but the constraints let
  another module's lifecycle affect Adaptation persistence. Removing them safely needs a referential
  lifecycle decision and migration, not a silent constraint drop.
- `RepresentationDraft.submitted` remains an always-false compatibility projection. Adaptation
  cannot make it true; future submission truth must come from Execution/Application public
  capabilities. Removing the field would break the current public response contract.
