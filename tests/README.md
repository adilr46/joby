# Tests

Cross-cutting tests: those spanning domains, verifying event flows end to end, or checking that
architectural rules hold.

**Currently empty.** No test runner is configured yet.

Tests for a single domain live with that domain in `packages/<domain>`. This directory is for what
does not belong to one domain.

## What eventually belongs here

- Event contract tests: payloads stay serialisable, publishers ignore handler outcomes, a failing handler does not affect others.
- Durable delivery tests (ADR 0004): an event survives `serializeEvent` → `parseEvent` unchanged; a rolled-back transaction leaves no outbox row; a released message is redelivered; a handler failure releases rather than acks; the same event delivered twice produces one effect.
- Boundary tests: no domain imports another domain's internals; no domain writes another's tables.
- Doctrine tests: Explicit State is not modified without confirmation; Temporary Workspace state never lands in Durable Identity; the Permanent Workspace stores no person-state of its own; output at the Baseline Identity State contains no claim the evidence does not support; the fast loop never rewrites Learned State/PCI; a single event never creates a durable trait; Application Records are immutable; epistemic status survives a full round trip.
