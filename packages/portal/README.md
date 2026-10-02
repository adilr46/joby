# Portal infrastructure adapter

**Status:** Browser observation, guarded browser-session lifecycle, deterministic action execution,
agentic drive, and human handoff are implemented as infrastructure adapters. Portal is not a
canonical semantic module (ADR 0029).

## Provides

- an infrastructure adapter for interaction with external application portals;
- SSRF/private-host guarded browser navigation;
- persistent per-Execution-session browser pages for `open -> fill -> handoff -> close`;
- DOM-to-`PageObservation` extraction for Execution;
- deterministic fill/select/check/upload execution through Execution's `PortalActionExecutor` port;
- a submit-safe agentic drive loop with a closed action vocabulary and execution-time submit refusal.

## Public interface

Execution uses the adapter through public capabilities. Execution owns the operational meaning and
state; the adapter does not mutate Execution, Application, Adaptation or Identity tables.

| File | Role |
|---|---|
| `egress-guard.ts` | Rejects non-http(s), localhost, private, link-local and invalid targets |
| `browser-observer.ts` | Playwright observers that produce `PageObservation` from either a new URL or the current page |
| `browser-action-executor.ts` | Playwright implementation of fill/select/check/upload only |
| `browser-session-registry.ts` | Keeps a real browser page open across API calls and supports handoff/close |
| `browser-drive.ts` | Ref-tagged observe/action loop for reaching or filling hard portal surfaces, without submit |

## Does not own

- application lifecycle, final submission orchestration or the Application Record;
- portal execution state, retries or mechanical-failure policy;
- opportunity truth or evaluation;
- person-state, representation or learning.

## Still not implemented here

- final submit clicking;
- vendor-specific ATS schema enrichment;
- captcha/login solving.
