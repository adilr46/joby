# Claude Code Agents

**Functional engineering specialists and independent reviewers.** Agents are organised by *what kind
of engineering work* they do, never by domain — domain meaning lives in domain-local `CLAUDE.md`
files, and every agent reads the relevant ones before working.

Use only the agents relevant to the task at hand.

## Engineering

| Agent | Works on | Use for |
|---|---|---|
| `frontend-engineer` | `apps/web` | Next.js/React screens, forms, multi-step workflows, shadcn/ui, loading and error states, accessibility |
| `backend-engineer` | `apps/api`, `packages/<domain>` | Endpoints, domain services and use cases, domain public interfaces, application logic, event publication |
| `data-engineer` | `packages/database` | Schema, migrations, repositories, indexes, relational vs JSONB, provenance storage, the `OutboxStore` / `DurableQueue` implementations |
| `ai-engineer` | Model-facing code | Structured outputs, extraction, evidence selection, contextual generation, grounding, provenance, uncertainty, evaluations |
| `worker-engineer` | `apps/worker` | Deferrable event processing, `QueueEventConsumer`, idempotency on `event.id`, async jobs, worker lifecycle |
| `test-engineer` | `tests/`, per-domain tests | Unit, integration, event-flow, AI contract and regression tests; partial failure and duplicate delivery |

## Review

Independent challenge at the **CHALLENGE** step. They review and report; they do not edit files.

| Agent | Asks |
|---|---|
| `architecture-guardian` | Is this right? Person-centric model, domain ownership, truth vs representation, evidence reuse, session vs durable state, ADR compliance, coupling, speculative abstractions |
| `adversarial-reviewer` | What breaks it? Assumptions, malformed input, duplicate delivery, stale state, races, partial failure, security and privacy, AI disagreement, UX failure modes |

Run both on non-trivial work. They look for different things and disagreeing with a finding is fine
— say why rather than applying it mechanically.

## Conventions

- **No domain-specific agents.** A "memory-engineer" or "execution-engineer" would duplicate domain semantics that belong in `packages/<domain>/CLAUDE.md`.
- Every agent reads root `CLAUDE.md` and the affected domains' local `CLAUDE.md` before working.
- Agents stay inside their layer. If work needs another layer, hand off rather than reaching across.
- Agents are *how* Joby is built. Skills are *what* recurring workflow is being followed — see `../skills/`.
