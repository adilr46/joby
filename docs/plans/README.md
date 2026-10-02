# Plans

Non-trivial work gets a plan before it gets code — the **PLAN** step of the development loop.

- [`active/`](active/) — in flight. Ideally one or two, not ten.
- [`completed/`](completed/) — moved here at **CONSOLIDATE**, kept as a record of what was actually built and why.

## Shape of a plan

1. **Goal** — the smallest vertically complete slice.
2. **Domains affected** — and who owns what.
3. **Doctrine check** — which product rules this touches, and how it respects them.
4. **Events** — any new or affected event contracts.
5. **Steps** — ordered, each independently verifiable.
6. **Verification** — how we will know it works, beyond "it compiles".
7. **Out of scope** — what is deliberately not being done.

Filename: `NNN-kebab-case-title.md`.

A plan that grows a second goal should be split. A decision made while planning that will outlive
the plan belongs in an ADR, not buried here.
