# ADR 0027 — Resolved Application History as Career Memory Input

- **Status:** Superseded and incorporated by ADR 0029
- **Date:** 2026-09-01
- **Modules affected:** Translation, Application, Career Memory, Durable Identity, Identity Representation
- **Amends:** ADRs 0006, 0013, 0016, 0025 and 0026

## Context

The two-timescale architecture says meaningful Records are the only boundary from the fast loop into
slower learning. Translation now has three strongly owned modules, but the Application Record has
not yet been required to preserve which Intelligence, Adaptation and final Execution state actually
produced the real-world application. Career Memory cannot later learn responsibly from an outcome if
the resolved history omits what Joby understood, intended and finally submitted.

## Decision

The application slow-learning path is:

```text
TRANSLATION
├── Intelligence
├── Adaptation
└── Execution
        ↓
Application — resolved, immutable meaningful history
        ↓
Career Memory — slower interpretation across histories
        ↓
PCI — justified slow-learned output, held by Durable Identity
└────────────→ future Intelligence + Adaptation priors
```

### Application preserves resolved Translation history

Application owns the immutable history of what actually happened. For a resolved application, that
history preserves the meaningful Translation state actually used:

- the Opportunity Intelligence relied upon;
- the Application Intent and Adaptation representation state acted upon; and
- the final meaningful Execution/submission state, including what actually crossed the external
  boundary and later factual outcomes.

This establishes required meaning, not a DTO or storage schema. Application snapshots historical
reality; it does not acquire authority to mutate Intelligence, Adaptation or Execution state.

Intermediate drafts, retries, selectors, dropdown failures, captchas, transient portal errors and
other mechanical execution detail are excluded by default. A mechanical fact enters resolved
Application history only if a future use case explicitly establishes that it became meaningful
application history; it is never learning input merely because it was logged.

### Career Memory consumes; it does not reach upstream

Career Memory later consumes resolved Application history through Application's future public
capability or a meaningful notification carrying an Application-owned identifier. Existing events
remain notifications, not copied object graphs; no event contract changes here.

Career Memory may accumulate evidence and determine whether patterns across resolved histories
justify learning. It does not rewrite past Applications, Intelligence, Adaptation, Execution,
Durable Identity, or Identity Representation.

### PCI is the governed output

PCI remains the slow-learned output of Career Memory and the Learned State component held by Durable
Identity. Career Memory may produce a justified PCI update proposal; only Durable Identity's future
governed public capability may record resulting person-state.

Future Intelligence and Adaptation may read held PCI as a prior through Durable Identity's public
read boundary. PCI is neither an Application-owned cache nor a direct Career Memory write into those
modules. Identity Representation remains the only owner of persistent lenses; any generalized
representation improvement remains a user-governed proposal, never a Career Memory write.

## Consequences

- Application becomes the temporal and semantic handoff from Translation to Career Memory.
- Career Memory receives resolved history rather than live Translation state or mechanical logs.
- Past operational truth remains immutable while future Intelligence and Adaptation may improve from
  governed PCI priors.
- No learning behavior, persistence, event, DTO, algorithm or new public interface is introduced.

## Unresolved

- The exact resolved-history shape and snapshot/version references await the first Application
  implementation slice.
- The rule that classifies final Execution information as meaningful history rather than mechanical
  noise awaits a concrete portal/application use case.
- The governed Durable Identity capability for accepting or rejecting justified PCI proposals does
  not exist yet.
