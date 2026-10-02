# Interview Intelligence — extracted brief

## What this repository contains

Joby defines interview intelligence as an opportunity-specific, evidence-grounded fast-loop
capability. Its scope is **Understand → Prepare → Rehearse** for a live application. It must help a
person prepare from their real professional evidence and the actual opportunity, rather than produce
generic interview advice.

The material to ground that work is deliberately separated by owner:

| Input | What it provides | Authority |
|---|---|---|
| Opportunity understanding | company, role, capabilities required, application questions | Opportunity |
| Application state | verified current stage, person and opportunity identifiers | Application |
| Profile Units | title, contribution, capabilities and consequence for each professional unit | Identity |
| PCI hints | learned preparation hints only, never facts or instructions | PCI |

Each interview workspace is traceable to the person, application and opportunity plus the
opportunity revision. Interview work has one of three stages: `understand`, `prepare` or `rehearse`.

## Preparation standard

- Ground every prepared claim in a specific, confirmed Profile Unit; do not turn a broad background
  claim into an untraceable story.
- Keep observed facts, inferences and hypotheses visibly distinct. Uncertainty is structured data,
  not soft wording.
- Treat missing evidence as a useful gap to surface, not a reason to invent a capability, metric,
  motivation or level of ownership.
- Generated application material must be something the person can credibly explain in an interview.
- The person retains control over intent, consequential claims, sensitive disclosures and anything
  submitted externally.
- PCI may suggest a prior, but never rewrites professional truth or dictates what the person says.

## Interview record and learning signal

An interview stage records factual observations separately from the person's reflection:

| Field | Meaning |
|---|---|
| `kind` | phone, video, in-person, assessment centre or take-home |
| `occurredAt` | when it happened, if known |
| `observations` | factual format, participants and questions asked |
| `reflection` | the person's own account afterward; never an automated performance score |

Lifecycle facts are append-only. Corrections supersede a prior timeline entry instead of rewriting
history. Outcomes retain verbatim recruiter/interviewer feedback. Once an application has a resolved
outcome, the system may project two distinct evidence streams for later learning:

- **User response:** the person's interview reflection and any representation choice that differed
  from a recommendation.
- **World response:** stages reached, outcome and verbatim external feedback.

A single interview, outcome or reflection is not a durable trait. PCI may learn only from meaningful
resolved application evidence, and its conclusions remain priors rather than person-side truth.

## Story-bank extraction

No personal story bank, STAR/CAR narratives, interview transcripts, CV content, application answers
or stored interview records are present in this checkout. The repository provides the evidence model
for a story bank, but not the person's stories themselves.

When source material is added, capture one story per Profile Unit using this evidence-first template:

| Story title | Context | Contribution / actions | Capabilities demonstrated | Consequence / evidence | Best question themes | Gaps to verify |
|---|---|---|---|---|---|---|
| _To be populated from confirmed source material_ |  |  |  |  |  |  |

Do not fill a cell with inferred facts. A useful story may be incomplete; its unanswered fields become
targeted rehearsal prompts.

## Implementation status

`@joby/translation/interview` now implements the read-only **prepare** and **rehearse** loop. Given
an attributed Opportunity, confirmed Application stage, Profile Units and optional PCI hints, it
returns a disposable packet with requirement-to-evidence mappings, observed versus inferred
questions, story prompts, unsupported-evidence gaps, platform guidance and temporary coaching. It
does not persist preparation or create a score. `parseInterviewInvite` extracts platform and
requisition facts without advancing the Application; HireVue remains modality-unknown unless the
invite proves otherwise. Application has authenticated API paths to record a real interview's factual
observations and attach the person's separate reflection. Company research, transcript extraction,
question-bank accumulation, weekly operations views and safeguarded red-flag analysis remain future
consumers of Application records.

## Source map

- `packages/translation/src/interview/contract.ts` — interview stages and traceable context
- `packages/translation/src/interview/ports.ts` — the four permitted preparation inputs
- `packages/application/src/model.ts` — interview record, lifecycle and outcome semantics
- `packages/application/src/resolved-evidence.ts` — safe, resolved evidence projection for PCI
- `.claude/skills/ai-translation/SKILL.md` — evidence, uncertainty and human-review rules
- `docs/architecture/adr/0031-identity-router-translation-application-pci.md` — authority model
