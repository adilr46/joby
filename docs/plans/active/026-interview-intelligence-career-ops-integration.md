# 026 — Interview Intelligence from career-ops

## Goal

Deliver the smallest complete Interview Intelligence slice: generate a grounded, role- and
round-specific preparation packet for a confirmed live Application. Reuse the proven
`career-ops` inputs and workflows without importing its files, trackers or prompt documents as
runtime authorities.

```text
Opportunity understanding + confirmed Application stage + Profile Units + optional PCI hints
                                      ↓
                    Interview Intelligence: understand → prepare
                                      ↓
         reviewable preparation packet: question map, story map, gaps and simulation brief
```

`practice` and `debrief` follow as separate slices. A rehearsal is temporary; an actual interview
is Application history.

## Domains affected

- **Opportunity** owns the company, role, JD-derived requirements and application questions.
- **Application** owns the verified invite/communication, stage, actual interview observations,
  personal reflection, progression, feedback and outcome.
- **Identity** owns confirmed Profile Units and any user-confirmed new story/correction.
- **Interview Intelligence** reads those inputs, selects evidence, predicts questions as explicit
  inferences and produces temporary/reviewable preparation output. It owns no durable record.
- **PCI** later receives only Application's resolved-evidence projection; it does not read prep,
  mock answers, raw transcripts or a single-round score.

## Source-system translation

| career-ops mechanism | Joby home | Rule |
|---|---|---|
| `interview-prep` company/role document | temporary Interview Intelligence preparation packet | Rebuild from current owners; version inputs rather than copying source truth. |
| story bank + provenance check | Identity Profile Units + evidence references | A story map selects confirmed evidence; it cannot make a claim true. |
| invite matching/platform/HireVue detection | Application communication and factual interview-stage observations | Invite facts are actual-process context, not an inferred stage or a person trait. |
| plan | `prepare` output | Predict question themes from role, round and platform; label predictions as inferred. |
| practice/HireVue simulation | temporary `rehearse` output | Format changes pacing, response shape and prompts, never the truth of an answer. |
| debrief/session transcript | Application interview observations + user reflection | Preserve actual questions, round facts and the person's account; never system-score performance as fact. |
| question-bank gaps/corrected prep | temporary next-round packet | Promote only a separately confirmed professional correction/story to Identity. |
| weekly digest, friction, latency, tracker sync | application-facing reporting/operations | Read Application records; not PCI training inputs on their own. |
| red-flag analysis | a separate safeguarded analysis output | Never infer protected characteristics or persist a red-flag judgement as person truth. |

## Doctrine check

- All answer claims must cite specific confirmed Profile Units. Unsupported requirements become
  explicit gaps; no invented STAR metrics or reconstructed accomplishments.
- Company-, interviewer- and HireVue-specific context changes selection, question likelihood and
  simulation format only. It must not change Identity or become a learned conclusion from one round.
- The user reviews consequential wording, corrections and proposed new stories. A system assessment
  of a practice answer is coaching output, not a fact about the person.
- Application's append-only record is the source for what happened. PCI receives only resolved,
  meaningful evidence and keeps user response distinct from world response.

## Delivery slices

1. **Read-model and contract slice — Understand.** Implement adapters for the four existing
   Interview ports. Extend the Opportunity read only if it lacks attributed company/role/requirements;
   use Application's current stage verbatim. Define a typed `InterviewBrief` containing invite facts
   actually recorded by Application (round, interviewer role when known, platform and date), with
   every uncertain field marked observed or inferred.

2. **Grounded preparation slice — Prepare.** Given `InterviewContext` and `InterviewBrief`, return
   a versioned packet with: role/company summary, requirement-to-Profile-Unit mapping, likely
   question themes, story prompts, unsupported-evidence gaps and source references. Do not persist
   it. Translate the story-provenance check into validation that rejects an unsupported metric or
   claim before rendering a suggested answer.

3. **Round/platform simulation slice — Rehearse.** Generate temporary mock turns from the prep
   packet. A HireVue/AI signal selects asynchronous timing, concise first-pass answers and
   camera-style follow-ups; a technical or hiring-manager round selects the appropriate depth and
   question mix. The evaluator returns actionable coaching linked to evidence/gaps, never a durable
   performance score.

4. **Actual-interview capture slice — Debrief.** Use Application public capabilities to record the
   actual stage's factual observations (questions asked, format, participants, dates and invite
   facts) and attach the person's own reflection. Treat a supplied transcript as untrusted quoted
   source material, extract facts only, and retain only the minimum approved record. Generate the
   next-round packet from that record. A newly surfaced story or correction is a confirmation-gated
   Identity proposal, not an automatic write.

5. **Operational consumers and PCI wiring.** Build weekly/latency/friction/follow-up views as reads
   over Application. On a recorded resolved outcome, Application projects representation choice,
   user reflection, reached stages, outcome and verbatim feedback. Wire that idempotently to PCI
   only when PCI learning is deliberately enabled; omit raw practice sessions, prompts, simulated
   scores and unconfirmed gaps.

## Events and persistence

No new event is needed for generated preparation or rehearsal: both are disposable contextual
output. Continue using `InterviewRecorded` only after Application commits a real interview-stage
observation, and use `OutcomeObserved` for actual external response. If a later decision requires
durable rehearsal transcripts or structured invite metadata beyond existing Application observations
and communications, make that an Application-owned schema/API slice first.

## Verification

- A HireVue invitation produces an asynchronous simulation brief and only references confirmed
  Profile Units; it does not mark the person as having an AI-interview skill or advance their stage.
- A likely question unsupported by Identity is visibly a gap, not a fabricated answer or metric.
- An actual debrief writes factual observations and the person's reflection separately; a mock
  debrief cannot enter Application history.
- A new story remains a proposal until confirmed by the user.
- An unresolved Application emits no PCI evidence. A resolved one emits only the existing two
  signal families—user response and world response—and repeated delivery does not double count it.
- Weekly/friction/latency views can explain each result by links to Application records, not copies
  of tracker state.

## Out of scope

- Migrating markdown files or personal interview transcripts wholesale into Joby.
- Building a generic personality or interview-performance score.
- Automatic changes to Profile Units, Representations, Stated Context or PCI from a practice round.
- Protected-ground inference, legal conclusions or automated escalation from red-flag analysis.
