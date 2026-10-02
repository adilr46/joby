# ADR 0018 — Adaptation Module 1: context interpretation

- **Status:** Accepted
- **Date:** 2026-08-16
- **Domains affected:** Identity (Adaptation), Intelligence (consumer seam), Discovery (by reference)
- **Related:** ADR 0012 (Adaptation ownership), ADR 0013 (broad snapshot, cycle lifespan),
  ADR 0011 (Stated Context, rewritten), ADR 0016 (the representation prior), ADR 0007 (Opportunity
  Evaluation belongs to Intelligence)

## Context

ADRs 0012 and 0013 settled where Adaptation lives, what it may own and what it may read. ADR 0011
made Stated Context retrievable, and ADR 0016 defined the optional prior. Module 1 is the first
behaviour built on all of it: turn one opportunity and the person's existing conditions into
something **legible**, before any professional adaptation happens.

```text
P_i(E_t) + C_opportunity + C_user  ->  Adaptation Context
```

Three questions had to be answered to build it, and each has an obvious wrong answer that would have
been easy to ship.

1. **What does the Adaptation Context store?** Copying the opportunity or the person's conditions
   into it would make Adaptation a second opportunity store and a second copy of the person — the
   failure ADRs 0009 and 0014 exist to prevent, in a new place.
2. **Where does structured opportunity meaning come from?** Adaptation reading a job description
   itself is opportunity understanding, and that is Intelligence's authority (ADR 0012). But
   Intelligence does not exist yet, and "wait for Intelligence" would leave the slice unbuildable.
3. **How is the comparison presented?** A comparison that quietly treats silence as agreement, or
   that treats every unmentioned detail as a problem, is worse than no comparison — the person acts
   on it.

## Decision

### 1. The Adaptation Context holds references and revisions

`adaptation_context` stores: the person, the optional representation, the opportunity **id**, the
opportunity-understanding **revision**, and the canonical identity **revision** it was built from.

There is no role, company, requirement, condition or capability column, and there must never be one.
Everything the context shows is **re-derived on every read** from whoever owns it. A condition the
person edits is visible on the next read with no refresh path, no invalidation and nothing to go
stale.

One context per person per opportunity: a second would be a second answer to "what is this
application's scope?", and the later modules would have no way to choose.

ADR 0013 §10 defers retention, versioning, refresh triggers and reconciliation. **None of that is
resolved here.** One row, created once, no lifecycle machinery — because this slice needs none, and
hardening a deferred decision in passing is how it gets lost.

### 2. Opportunity understanding arrives through the consumer port, always

Adaptation **never interprets a job description.** UC02 arranges Intelligence's already-structured,
already-attributed understanding into `C_opportunity`; it adds nothing and infers nothing. An
opportunity nobody has understood has no context, and the API says so rather than falling back to
reading text itself.

Until Intelligence exists, the **composition root** supplies that understanding: `apps/api` holds an
in-memory stand-in that accepts structured understanding and **rejects raw posting text**. It
persists nothing, so it cannot become an opportunity store, and it is one file that is deleted when
Intelligence's adapter is wired in its place. Nothing in `packages/identity` changes when that
happens.

### 3. User conditions are retrieved, never inferred

```text
C_user = Retrieve(X_t)        not        C_user = Infer(CurrentMoment)
```

Adaptation reads Stated Context through the Identity contract and **cannot write it**: the reader
port has no write method. Conditions belong to the person, do not fluctuate between applications, and
Adaptation is not responsible for maintaining them.

### 4. Four outcomes, because there are two different silences

| Outcome | When | Why it is its own category |
|---|---|---|
| **aligned** | both stated, and they match | |
| **conflict** | both stated, and nothing matches | Named plainly, both sides shown |
| **uncertain** | the person stated a condition, the posting did not answer it | **The actionable unknown** — the thing to ask before applying |
| **neutral** | the posting states something the person has no condition about | Information about the role, with nothing to reconcile |

Collapsing `neutral` into `uncertain` would bury the questions worth asking under every detail nobody
has an opinion about. Collapsing it the other way would treat a person's silence as acceptance.
**A missing user condition stays unknown**: never assumed acceptable, never assumed a problem.

Comparison is **normalised-text equality and nothing cleverer** — case and spacing are noise, but
"Greater London" does not silently satisfy "London". A near-miss stays a conflict, for the same
reason Release 3 matches labels exactly: a wrong match is invisible to the person it misleads.

Intelligence's own stated uncertainty about the posting travels through verbatim, beside the
comparison, unmapped onto any condition kind. Free-text constraints do the same. Mapping prose onto
structure is a guess in a costume.

### 5. Conditions only, and never a gate

```text
ConstraintConflict ≠ ApplicationBlock
```

Module 1 compares **conditions**. Whether the person suits the role is Opportunity Evaluation and
belongs to Intelligence (ADR 0007); putting it here is how Module 1 drifts into a domain it does not
own. Required capabilities are carried for later modules and compared against nobody.

Nothing filters, disables, ranks or gates. `blocksApplication: false` is a field on the output so a
consumer reads it rather than assuming the opposite, and an architecture test rejects scoring and
gating vocabulary in the module.

### 6. The exported boundary

Adaptation is exported from `@joby/identity/adaptation`, separate from the Durable Identity contract.
Sharing a package must not mean sharing a surface: Execution will call this boundary and supply task
context, and it has no business reaching Identity's write paths to do so.

Adaptation reads Identity through the **public contract**, the same surface Execution or Memory would
use — not a privileged internal path, and not a repository.

## Consequences

- The first Adaptation behaviour runs end to end, and the seams ADRs 0012/0013/0016 designed are now
  proven by code rather than described: broad read, optional prior, no canonical write, no cycle.
- Intelligence can be built without renegotiating anything. Its adapter replaces one file.
- The context is cheap: it holds four references, so throwing one away costs nothing and rebuilding
  it is a read.
- Cost: the composition root temporarily holds opportunity understanding in memory. That is a stand-in
  with an expiry condition, and it is the one place where a future reader might mistake app code for
  domain ownership — which is why it rejects raw text and persists nothing.
- The four-way split will need a UI that reflects it. Presented as one undifferentiated list, the
  distinction between "you should ask about this" and "here is what the role says" is lost.

## Alternatives Considered

- **Store the interpreted opportunity and conditions on the context.** Rejected: a second opportunity
  store and a second copy of the person, plus staleness and a refresh path, to avoid a read.
- **Let Adaptation parse the job description until Intelligence exists.** Rejected: it is the exact
  authority ADR 0012 assigns elsewhere, and temporary code that works is the hardest kind to remove.
- **Three categories (aligned / conflict / uncertain).** Rejected: it forces the two silences
  together, and the resulting list buries the questions the person needs to ask.
- **Infer conditions from the person's history.** Rejected: someone's location constraint is not
  derivable from where they studied, and getting it wrong is invisible to them (ADR 0011).
- **Let a conflict mark the opportunity as unsuitable.** Rejected outright — it is the doctrine this
  module exists to hold, and the pursue decision is the person's.

## Revisit When

Intelligence is implemented and the stand-in is deleted; Module 2 begins and the context needs to
carry selected evidence (it must not — that is Adapted State); the deferred retention, refresh or
versioning questions of ADR 0013 §10 become real; or a condition kind needs comparison logic more
than normalised equality, which is a decision about how wrong Joby is allowed to be.
