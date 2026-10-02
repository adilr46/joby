---
name: vertical-slice
description: The default workflow for building one coherent Joby capability end to end — understand the outcome, inspect domain context, plan the smallest complete slice, implement, verify, review with the relevant agents, fix validated issues, update state. Use for any non-trivial feature work; other skills compose inside it.
---

# Vertical Slice

The default way to build something in Joby. One capability, complete from the user's action to the
durable consequence — not one layer of several capabilities.

Other skills compose inside this one. A slice that touches evidence uses `identity-evidence`; one
that adds an event uses `event-workflow`; one that generates content uses `ai-translation`.

## Plan against the current model

Before designing anything, place the slice in the architecture (`docs/JOBY_MEMORY.md`, ADRs 0005–0007):

- **What does it read from Durable Identity** — Explicit State, Learned State/PCI, or both?
- **Which Workspace layer?** The **Permanent Workspace Context** (the persistent "My Joby" environment — a view layer over Durable Identity, storing no person-state) or a **Temporary Workspace Context** (task-specific, disposable)? Say which. Anything that must survive the task becomes a Record, or enters Durable Identity through confirmation.
- **How does it behave at the Baseline Identity State?** A new user has sparse Explicit State, a stated direction, and almost no PCI. If the slice only works for someone with history, it is not finished — design the low-evidence case, and make sure claims stay proportionate to evidence.
- **Which loop is it in?** Fast Operational (live context, may adapt Temporary Workspace state, must not casually rewrite Learned State) or Slower Learning (aggregates meaningful Records, updates PCI only when justified)?
- **What Record does it produce**, if any? Records are the only interface between the loops.
- **Which domain owns each piece?** Identity owns person-state; Memory owns the learning process; Development owns interpretation of change; Intelligence proposes and evaluates; Execution acts and must not mutate Explicit State.

A slice that can't answer these is not yet planned.

## 1. Understand the outcome

Say, in one sentence, what a placement student can do afterwards that they couldn't before. If you
can't, you don't have a slice — you have a task list.

Then get concrete: what they see, what they decide, what Joby remembers afterwards. A slice with no
durable consequence is a demo.

## 2. Inspect

Read, in this order: root `CLAUDE.md`, `docs/JOBY_MEMORY.md`, `docs/CURRENT_STATE.md`. Identify the
affected domains. Read their local `CLAUDE.md`. Read the accepted ADRs that apply. Then read the
actual code and tests you're about to change.

Do not skip to planning because the change looks obvious. The expensive mistakes in Joby are
terminology mistakes, and they are only visible in the domain context.

## 3. Plan the smallest complete slice

Write it to `docs/plans/active/NNN-name.md`: goal, domains affected and who owns what, doctrine check,
event contracts touched, ordered steps each independently verifiable, how you'll verify, and what is
deliberately out of scope.

**Vertical, not horizontal.** One capability through every layer beats a complete data layer with no
user. Cut scope by removing capability, never by removing a layer — a slice missing its UI or its
persistence isn't a thin slice, it's an unfinished one.

Ask what this must *not* do. Writing that down is what keeps the slice small.

## 4. Implement

Use the specialist agents for their layers: `frontend-engineer`, `backend-engineer`, `data-engineer`,
`ai-engineer`, `worker-engineer`. Give each the domain context it needs.

- Smallest change that completes the slice. No unrelated refactors — note them for later instead.
- Preserve domain ownership. No cross-domain writes.
- Extend existing concepts rather than duplicating them. If a concept nearly fits, the right move is
  usually to widen it, not to add its near-twin.

## 5. Verify

Run it. `test-engineer` writes tests for the invariants, including duplicate delivery and partial
failure where events are involved. Report what actually ran and what actually failed, with output.

If tooling doesn't exist to verify something, say so plainly rather than asserting it works.

## 6. Challenge

Run `architecture-guardian` and `adversarial-reviewer`. Give them the diff and the context.

Then judge their findings — don't apply them mechanically. Fix what is real, and say why you're
declining what isn't. A finding you disagree with is worth a sentence, not silence.

## 7. Consolidate

- Update `docs/CURRENT_STATE.md`: what's done, what's in flight, new known issues.
- Move the plan to `docs/plans/completed/`.
- Write an ADR if a consequential decision was made. If implementing forced a decision about what
  something *means*, that belongs in `JOBY_MEMORY.md` — and it needs to be a deliberate change, not
  a side effect.
- Commit as one coherent change.

## Stop conditions

Stop and raise it rather than working around it:

- The slice requires a cross-domain write.
- It requires AI output to become Explicit State without confirmation.
- It requires a Workspace layer to own person-state, including a cached copy in the Permanent Workspace.
- It requires presenting a claim the evidence does not support in order to look useful early.
- It requires the fast loop to rewrite Learned State / PCI directly.
- It contradicts an accepted ADR.
- It needs a new deployed service or new infrastructure.
- It only works if a term from `JOBY_MEMORY.md` quietly means something new.

Each of these is an ADR or a doctrine conversation, not an implementation detail to route around.
