/**
 * UC02 — reading captured evidence into a structured understanding.
 *
 * These are about **what the interpreter refuses to do**. Reading a posting shallowly is easy; the
 * failure that matters is reading one confidently and being wrong about what someone must have, so
 * most of what follows asserts that a gap stays a gap.
 */

import { describe, expect, it } from 'vitest';

import { DeterministicOpportunityInterpreter } from './deterministic-interpreter';
import { InterpretationError, type EvidenceForInterpretation } from './interpretation-port';
import { validateUnderstanding } from './validate-understanding';

const interpreter = new DeterministicOpportunityInterpreter();

const evidence = (text: string, overrides: Partial<EvidenceForInterpretation> = {}): EvidenceForInterpretation => ({
  evidenceId: 'ev-1',
  kind: 'posting',
  source: 'careers-page',
  text,
  ...overrides,
});

const read = (text: string, overrides?: Partial<EvidenceForInterpretation>) =>
  interpreter.interpret({ opportunityId: 'opp-1', evidence: [evidence(text, overrides)] });

const FULL_POSTING = `
Role: Placement Software Engineer
Company: Acme Trading
Location: London
Duration: 12 months
Start date: September 2026
Working arrangement: Hybrid
Work authorisation: Right to work in the UK
Sponsorship: Not offered
Availability: Full time

Requirements
- Python
- Working towards a degree in a numerate subject

Desirable
- Exposure to market data

Responsibilities
- Support the trading desk's tooling

Application questions
- Why do you want to work at Acme?
`;

describe('the deterministic opportunity interpreter', () => {
  it('reads role, company, requirements, conditions and questions that the evidence states', async () => {
    const { understanding, interpreter: name } = await read(FULL_POSTING);

    expect(name).toBe('deterministic');
    expect(understanding.role).toBe('Placement Software Engineer');
    expect(understanding.company).toBe('Acme Trading');
    expect(understanding.requiredCapabilities).toEqual([
      'Python',
      'Working towards a degree in a numerate subject',
    ]);
    expect(understanding.responsibilities).toEqual(["Support the trading desk's tooling"]);
    expect(understanding.applicationQuestions).toEqual(['Why do you want to work at Acme?']);
    expect(understanding.conditions).toMatchObject({
      location: ['London'],
      duration: ['12 months'],
      start_date: ['September 2026'],
      work_arrangement: ['Hybrid'],
      sponsorship: ['Not offered'],
    });
  });

  it('keeps preferences separate from requirements', async () => {
    const { understanding } = await read(FULL_POSTING);

    // Flattening these loses the distinction the person needs: a desirable is not something they
    // must have, and treating it as one turns a viable application into a self-rejection.
    expect(understanding.preferredCapabilities).toEqual(['Exposure to market data']);
    expect(understanding.requiredCapabilities).not.toContain('Exposure to market data');
  });

  it('leaves what the evidence never stated absent, and names the gap', async () => {
    const { understanding } = await read('Role: Data Analyst\n');

    // Absent, not empty, not guessed. `company` is genuinely unknown here.
    expect(understanding.company).toBeUndefined();
    expect('company' in understanding).toBe(false);
    expect(understanding.uncertainty).toContain('The evidence does not state a company.');
    expect(understanding.uncertainty).toContain('The evidence does not state sponsorship.');
    expect(understanding.uncertainty).toContain('The evidence does not state any requirement.');
  });

  it('never infers a requirement from prose', async () => {
    const { understanding } = await read(
      'Role: Quant Intern\nWe are a Python shop and our team loves clean code.\n',
    );

    // The posting mentions Python. It does not *require* it, and no amount of it being obviously
    // relevant makes it a stated requirement — inventing one here would reach a person's CV.
    expect(understanding.requiredCapabilities).toBeUndefined();
    expect(understanding.preferredCapabilities).toBeUndefined();
    expect(understanding.uncertainty).toContain('The evidence does not state any requirement.');
  });

  it('records a refusal to answer as uncertainty rather than as a value', async () => {
    const { understanding } = await read('Role: Analyst\nSalary: competitive\nStart date: TBC\n');

    // "TBC" is the posting raising the question and declining to answer it. That is different from
    // never mentioning it, and very different from a date.
    expect(understanding.conditions?.start_date).toBeUndefined();
    expect(understanding.uncertainty).toContain("The evidence mentions start date but states 'TBC'.");
  });

  it('does not treat a sentence beginning with a heading word as a heading', async () => {
    const { understanding } = await read(
      'Role: Analyst\nRequirements are discussed at interview.\n- Not a requirement\n',
    );

    // Anchored matching. A prefix match would open a Requirements section here and adopt the
    // following bullet as something the person must have.
    expect(understanding.requiredCapabilities).toBeUndefined();
  });

  it('closes a section at an unrecognised heading, so perks never become requirements', async () => {
    const { understanding } = await read(
      'Requirements\n- Python\nBenefits\n- Free lunch\n- Private healthcare\n',
    );

    // The failure this module exists to prevent. A section left open past a heading it does not
    // recognise turns "free lunch" into something the person must have — well-formed, correctly
    // attributed, and invisible to validation.
    expect(understanding.requiredCapabilities).toEqual(['Python']);
  });

  it('does not let an unrecognised heading promote a preference to a requirement', async () => {
    const { understanding } = await read('Requirements\n- Python\nAbout us\n- We are great\n');
    expect(understanding.requiredCapabilities).toEqual(['Python']);
  });

  it('reads markdown headings, because markdown is an accepted capture type', async () => {
    const { understanding } = await read('## Requirements\n- Python\n**Nice to have**\n- Go\n');

    // Refusing to see these produced a *confident* falsehood — "the evidence does not state any
    // requirement" about a posting that listed them — which is the worst shape a wrong answer takes.
    expect(understanding.requiredCapabilities).toEqual(['Python']);
    expect(understanding.preferredCapabilities).toEqual(['Go']);
    expect(understanding.uncertainty).not.toContain('The evidence does not state any requirement.');
  });

  it('reads en- and em-dash bullets, which is what pasted postings actually contain', async () => {
    // Word and Google Docs autocorrect '-' into an en dash. A hyphen-only matcher drops requirements
    // from most real postings and then reports that none were stated.
    const enDash = await read('Requirements\n\u2013 Python\n');
    const emDash = await read('Requirements\n\u2014 Python\n');
    expect(enDash.understanding.requiredCapabilities).toEqual(['Python']);
    expect(emDash.understanding.requiredCapabilities).toEqual(['Python']);
  });

  it('says so when two pieces of evidence disagree, instead of silently preferring the first', async () => {
    const { understanding } = await interpreter.interpret({
      opportunityId: 'opp-1',
      evidence: [
        evidence('Role: Intern\nCompany: Acme\n', { evidenceId: 'ev-1', kind: 'note', source: 'me' }),
        evidence('Role: Placement Engineer\nCompany: Acme Trading Ltd\n', { evidenceId: 'ev-2' }),
      ],
    });

    // Something has to win, but silently preferring a scribbled note over the posting is how an
    // application ends up addressed to the wrong legal entity.
    expect(understanding.role).toBe('Intern');
    expect(understanding.uncertainty).toContain(
      "The evidence disagrees about role: 'Intern' and 'Placement Engineer'. The first is used.",
    );
    expect(understanding.uncertainty).toContain(
      "The evidence disagrees about company: 'Acme' and 'Acme Trading Ltd'. The first is used.",
    );
  });

  it("treats 'Flexible' as the answer it is, not as a refusal to answer", async () => {
    const { understanding } = await read('Working arrangement: Flexible\n');

    // For someone whose blocking constraint is remote work, "flexible" is the answer they needed.
    expect(understanding.conditions?.work_arrangement).toEqual(['Flexible']);
    expect(understanding.uncertainty).not.toContain(
      'The evidence does not state working arrangement.',
    );
  });

  it('says a field is unanswered once, not twice and contradictorily', async () => {
    const { understanding } = await read('Start date: TBC\n');
    const aboutStartDate = understanding.uncertainty!.filter((entry) => /start date/i.test(entry));

    // It used to report both "mentions start date but states 'TBC'" and "does not state start date".
    expect(aboutStartDate).toEqual(["The evidence mentions start date but states 'TBC'."]);
  });

  it('survives brackets in a caller-supplied source', async () => {
    const { understanding } = await read('Role: Analyst\n', { source: 'LinkedIn [saved]' });

    // The evidence id leads, so free text can never be mistaken for a citation. Before this, one
    // bracket in `source` made an opportunity permanently un-understandable — evidence is immutable
    // and there is no delete path, so every retry reproduced the same rejection.
    expect(understanding.attribution).toEqual(['[ev-1] posting from LinkedIn [saved]']);
    expect(() => validateUnderstanding(understanding, ['ev-1'])).not.toThrow();
  });

  it('attributes every reading to the evidence it came from', async () => {
    const { understanding } = await read(FULL_POSTING, {
      evidenceId: 'ev-42',
      source: 'forwarded-email',
      kind: 'email',
      uri: 'https://example.test/jd',
    });

    expect(understanding.attribution).toEqual([
      '[ev-42] email from forwarded-email (https://example.test/jd)',
    ]);
  });

  it('reads several pieces of evidence into one understanding', async () => {
    const { understanding } = await interpreter.interpret({
      opportunityId: 'opp-1',
      evidence: [
        evidence('Role: Placement Engineer\n', { evidenceId: 'ev-1' }),
        evidence('Company: Acme Trading\nLocation: Bristol\n', {
          evidenceId: 'ev-2',
          kind: 'email',
          source: 'recruiter',
        }),
      ],
    });

    expect(understanding.role).toBe('Placement Engineer');
    expect(understanding.company).toBe('Acme Trading');
    expect(understanding.conditions?.location).toEqual(['Bristol']);
    expect(understanding.attribution).toHaveLength(2);
  });

  it('produces a usable, honest reading from evidence that says almost nothing', async () => {
    const { understanding } = await read('Sam mentioned there might be something going at Acme.');

    // The Baseline case for opportunities. A thin reading is a real outcome; the alternative is
    // inventing a role to look useful.
    expect(understanding.role).toBeUndefined();
    expect(understanding.requiredCapabilities).toBeUndefined();
    expect(understanding.attribution).toHaveLength(1);
    expect(understanding.uncertainty?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('validating interpreter output', () => {
  const valid = { attribution: ['[ev-1] posting from careers-page'], uncertainty: [] };

  it('accepts a reading whose attribution resolves to captured evidence', () => {
    expect(() => validateUnderstanding(valid, ['ev-1'])).not.toThrow();
  });

  it('refuses a reading citing evidence this opportunity does not hold', () => {
    // A cited source nobody captured is either a hallucination or a read of something it was not
    // given. Both are reasons to store nothing.
    expect(() => validateUnderstanding({ ...valid, attribution: ['[ev-9] made up'] }, ['ev-1'])).toThrow(
      InterpretationError,
    );
  });

  it('refuses a reading whose attribution cites nothing at all', () => {
    // This is the check that makes "every claim traces back to evidence" true rather than intended.
    // Without it a model-backed interpreter can fabricate a whole understanding and have it stored,
    // provided the attribution string simply avoids a bracket.
    expect(() =>
      validateUnderstanding(
        {
          role: 'Head of Trading',
          company: 'Goldman',
          requiredCapabilities: ['10 years C++'],
          attribution: ['inferred from what I know about this employer'],
          uncertainty: [],
        },
        ['ev-1'],
      ),
    ).toThrow(/cites no evidence/);
  });

  it('refuses keys that do not belong in an interpreted understanding', () => {
    // Two specific risks, neither of which should be prevented by a comment: raw posting text would
    // put a second copy of the evidence inside the interpreted store, and a person id would put
    // person-state in a table whose migration promises none.
    expect(() => validateUnderstanding({ ...valid, personId: 'p-1' } as never, ['ev-1'])).toThrow(
      /not part of an opportunity understanding/,
    );
    expect(() =>
      validateUnderstanding({ ...valid, rawPostingText: 'the whole posting' } as never, ['ev-1']),
    ).toThrow(/not part of an opportunity understanding/);
  });

  it('refuses a reading with no attribution at all', () => {
    expect(() => validateUnderstanding({ attribution: [] }, ['ev-1'])).toThrow(/attribution is empty/);
  });

  it('refuses an empty string where absence was meant', () => {
    // `role: ''` reads downstream as a stated blank rather than as "nobody said".
    expect(() => validateUnderstanding({ ...valid, role: '  ' }, ['ev-1'])).toThrow(
      /omit it instead so absence stays absent/,
    );
  });

  it('refuses a condition kind outside the comparable vocabulary', () => {
    expect(() =>
      validateUnderstanding({ ...valid, conditions: { salary: ['£30k'] } } as never, ['ev-1']),
    ).toThrow(/not a comparable condition kind/);
  });

  it('refuses a condition kind stated with nothing in it', () => {
    expect(() => validateUnderstanding({ ...valid, conditions: { location: [] } }, ['ev-1'])).toThrow(
      /omit the kind instead of stating nothing/,
    );
  });

  it('refuses a requirement that is only whitespace', () => {
    expect(() => validateUnderstanding({ ...valid, requiredCapabilities: ['  '] }, ['ev-1'])).toThrow(
      /contains an empty entry/,
    );
  });

  it('passes everything the deterministic interpreter produces', async () => {
    const { understanding } = await read(FULL_POSTING);
    expect(() => validateUnderstanding(understanding, ['ev-1'])).not.toThrow();
  });
});
