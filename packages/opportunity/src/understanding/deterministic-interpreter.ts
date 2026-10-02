/**
 * A deterministic, offline opportunity interpreter.
 *
 * Purpose is the same as `DeterministicCvExtractor`'s: tests and local development need a real
 * interpretation path that produces the same output every run. The doctrine assertions here — that
 * absent stays absent, that nothing is inferred, that every reading is attributable — are about the
 * *pipeline*, and a live model would make them flaky for reasons unrelated to what they assert.
 *
 * It is deliberately shallow, and **it never infers**:
 *
 *  - it reads labelled lines and headed sections, and nothing between the lines;
 *  - a field the evidence does not state is left absent and named in `uncertainty`, never guessed,
 *    never defaulted, and never filled from a plausible-sounding synonym;
 *  - "we'd love someone with Python" is a *preference*, not a requirement, because the posting said
 *    so — the distinction survives into the output rather than being flattened.
 *
 * Job descriptions are marketing. Reading one shallowly and saying so is more useful than reading
 * one confidently and being wrong about what someone must have.
 *
 * **Under-collecting is the safe direction.** Every ambiguous case below resolves towards reporting
 * less and saying so, because a missed requirement shows up as uncertainty a person can act on,
 * while an invented one reaches their CV.
 */

import { OPPORTUNITY_CONDITION_KINDS, type OpportunityConditionKind } from './model';

import type {
  InterpretationRequest,
  InterpretationResult,
  InterpretedUnderstanding,
  OpportunityInterpreter,
} from './interpretation-port';

/**
 * Section headings, matched against the **whole** line.
 *
 * Anchoring matters for the same reason it does in CV extraction: a prefix match would treat
 * "Requirements are discussed at interview" as a heading and swallow the sentence.
 */
const SECTION_HEADS: ReadonlyArray<{ pattern: RegExp; section: Section }> = [
  { pattern: /^(requirements?|essential|must\s+have|what\s+you'?ll\s+need)$/i, section: 'required' },
  { pattern: /^(preferred|desirable|nice\s+to\s+have|bonus|preferences?)$/i, section: 'preferred' },
  {
    pattern: /^(responsibilities|what\s+you'?ll\s+do|the\s+role|about\s+the\s+role|duties)$/i,
    section: 'responsibilities',
  },
  {
    pattern: /^(application\s+questions?|questions?|to\s+apply)$/i,
    section: 'questions',
  },
];

type Section = 'required' | 'preferred' | 'responsibilities' | 'questions';

/** `Label: value` lines. Only these keys; an unrecognised label is left alone, not guessed at. */
const LABELS: ReadonlyArray<{ pattern: RegExp; field: LabelField }> = [
  { pattern: /^(role|position|job\s+title|title)$/i, field: 'role' },
  { pattern: /^(company|organisation|organization|employer)$/i, field: 'company' },
  { pattern: /^(location|based(\s+in)?)$/i, field: 'location' },
  { pattern: /^(duration|length|term)$/i, field: 'duration' },
  { pattern: /^(working\s+arrangement|arrangement|work\s+pattern|working\s+pattern)$/i, field: 'work_arrangement' },
  { pattern: /^(start\s+date|starts?|starting)$/i, field: 'start_date' },
  { pattern: /^(work\s+authorisation|work\s+authorization|right\s+to\s+work|eligibility)$/i, field: 'work_authorisation' },
  { pattern: /^(sponsorship|visa\s+sponsorship)$/i, field: 'sponsorship' },
  { pattern: /^(availability|hours)$/i, field: 'availability' },
];

type LabelField = 'role' | 'company' | OpportunityConditionKind;

/**
 * Values that are a refusal to answer rather than an answer.
 *
 * Kept narrow on purpose. "Flexible" and "Negotiable" are **not** here: for a person whose blocking
 * constraint is remote work or reduced hours, "flexible" is the answer they needed, and discarding
 * it would erase a real condition while claiming the posting said nothing.
 */
const NON_ANSWERS = /^(tbc|tbd|tba|t\.b\.[cd]\.?|to\s+be\s+(confirmed|decided|discussed)|n\/?a|unknown|not\s+specified)$/i;

const CONDITION_LABELS: Record<OpportunityConditionKind, string> = {
  location: 'location',
  duration: 'duration',
  work_arrangement: 'working arrangement',
  start_date: 'start date',
  work_authorisation: 'work authorisation',
  sponsorship: 'sponsorship',
  availability: 'availability',
};

/**
 * Bullet markers, including the ones real postings actually contain.
 *
 * En and em dashes matter more than they look: Word, Google Docs and most rich-text editors
 * autocorrect `-` into `–`, so a hyphen-only matcher silently drops requirements from the majority
 * of pasted postings and then reports that none were stated.
 */
const BULLET = /^([-*•‣▪+]|[–—]|\d+[.)])\s+/;
const isBullet = (line: string): boolean => BULLET.test(line);
const stripBullet = (line: string): string => line.replace(BULLET, '').trim();

/**
 * Strip the decoration a heading arrives wearing, so `## Requirements` and `**Requirements**` are
 * recognised as the headings they plainly are.
 *
 * Markdown is an accepted capture type. Refusing to see its headings does not produce a cautious
 * reading — it produces a confident "the evidence does not state any requirement" about a posting
 * that lists ten, which is the worst shape a wrong answer can take.
 */
function headingText(line: string): string {
  return line
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\*\*(.*)\*\*$/, '$1')
    .replace(/^__(.*)__$/, '$1')
    .replace(/^\*(.*)\*$/, '$1')
    .replace(/:$/, '')
    .trim();
}

export class DeterministicOpportunityInterpreter implements OpportunityInterpreter {
  readonly name = 'deterministic';

  async interpret(request: InterpretationRequest): Promise<InterpretationResult> {
    const required: string[] = [];
    const preferred: string[] = [];
    const responsibilities: string[] = [];
    const questions: string[] = [];
    const conditions: Partial<Record<OpportunityConditionKind, string[]>> = {};
    const attribution: string[] = [];
    // The posting raised these and declined to answer. Distinct from never mentioning them.
    const statedButUnanswered: string[] = [];
    const unansweredKinds = new Set<OpportunityConditionKind>();
    // Evidence that disagrees with evidence read earlier.
    const disagreements: string[] = [];

    let role: string | undefined;
    let company: string | undefined;

    for (const item of request.evidence) {
      // The evidence id comes **first, in brackets, at a fixed position**, and the free text follows.
      // Caller-supplied `source` and `uri` can contain anything — including brackets — and putting
      // them before the id would let a source named "LinkedIn [saved]" read as a citation of
      // evidence that does not exist, making the opportunity permanently un-understandable.
      attribution.push(
        `[${item.evidenceId}] ${item.kind} from ${item.source}${item.uri ? ` (${item.uri})` : ''}`,
      );

      let section: Section | undefined;

      for (const raw of item.text.split(/\r\n|\r|\n/)) {
        const line = raw.trim();
        if (line === '') continue;

        const heading = SECTION_HEADS.find(({ pattern }) => pattern.test(headingText(line)));
        if (heading) {
          section = heading.section;
          continue;
        }

        const separator = line.indexOf(':');
        if (separator > 0 && !isBullet(line)) {
          const label = line.slice(0, separator).trim();
          const value = line.slice(separator + 1).trim();
          const matched = LABELS.find(({ pattern }) => pattern.test(label));
          if (matched && value !== '') {
            if (NON_ANSWERS.test(value)) {
              statedButUnanswered.push(
                `The evidence mentions ${matched.field === 'role' || matched.field === 'company' ? matched.field : CONDITION_LABELS[matched.field]} but states '${value}'.`,
              );
              if (matched.field !== 'role' && matched.field !== 'company') {
                unansweredKinds.add(matched.field);
              }
            } else if (matched.field === 'role' || matched.field === 'company') {
              const held = matched.field === 'role' ? role : company;
              if (held === undefined) {
                if (matched.field === 'role') role = value;
                else company = value;
              } else if (held !== value) {
                // Two pieces of evidence disagree. The first read wins because something has to, but
                // silently preferring a scribbled note over the actual posting is how an application
                // ends up addressed to the wrong legal entity. Say so instead.
                disagreements.push(
                  `The evidence disagrees about ${matched.field}: '${held}' and '${value}'. The first is used.`,
                );
              }
            } else {
              (conditions[matched.field] ??= []).push(value);
            }
            section = undefined;
            continue;
          }
        }

        if (section && isBullet(line)) {
          const value = stripBullet(line);
          if (value === '') continue;
          if (section === 'required') required.push(value);
          else if (section === 'preferred') preferred.push(value);
          else if (section === 'responsibilities') responsibilities.push(value);
          else questions.push(value);
          continue;
        }

        // **Anything else closes the section.** A line that is neither a heading this interpreter
        // knows, a recognised label, nor a bullet ends the run of bullets it was collecting.
        // Without this, "Benefits" — an unrecognised heading — leaves Requirements open and free
        // lunch is stored as something the person must have.
        section = undefined;
      }
    }

    // What was looked for and not found. Naming the gap is the whole point: a consumer must be able
    // to tell "the posting did not say" from "Joby did not look", and neither from "no".
    const uncertainty = [...statedButUnanswered, ...disagreements];
    if (role === undefined) uncertainty.push('The evidence does not state a role title.');
    if (company === undefined) uncertainty.push('The evidence does not state a company.');
    for (const kind of OPPORTUNITY_CONDITION_KINDS) {
      // A kind the posting raised and refused to answer is already reported above; saying "does not
      // state it" as well would be two contradictory sentences about the same field.
      if (!conditions[kind]?.length && !unansweredKinds.has(kind)) {
        uncertainty.push(`The evidence does not state ${CONDITION_LABELS[kind]}.`);
      }
    }
    if (required.length === 0) {
      uncertainty.push('The evidence does not state any requirement.');
    }

    const understanding: InterpretedUnderstanding = {
      // Absent, not invented. A record whose role nobody has stated is a real and common case, and
      // the caller sees exactly that in `uncertainty` rather than reading a placeholder.
      ...(role ? { role } : {}),
      ...(company ? { company } : {}),
      ...(required.length ? { requiredCapabilities: required } : {}),
      ...(preferred.length ? { preferredCapabilities: preferred } : {}),
      ...(responsibilities.length ? { responsibilities } : {}),
      ...(Object.keys(conditions).length ? { conditions } : {}),
      ...(questions.length ? { applicationQuestions: questions } : {}),
      attribution,
      uncertainty,
    };

    return { understanding, interpreter: this.name };
  }
}
