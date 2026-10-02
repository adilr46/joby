import { describe, expect, it } from 'vitest';

import type { CvRenderPlan } from './cv-render-plan';
import {
  toGeneratedLatexPayload,
  toHtmlPdfPayload,
  toLatexTexPatchManifest,
} from './cv-render-adapters';

const plan: CvRenderPlan = {
  contextId: 'ctx-1',
  personId: 'person-1',
  opportunityId: 'opp-1',
  representationId: 'rep-1',
  identityRevision: 3,
  opportunityRevision: 2,
  surface: 'html_pdf',
  path: 'adapt',
  unsupported: [],
  keywords: ['Python', 'Optimisation'],
  entries: [
    {
      nodeId: 'unit-1',
      section: 'projects',
      title: 'Rota scheduler',
      detail: 'Built a shift allocation solver',
      capabilities: ['Python'],
      speaksTo: ['Python'],
      origin: 'representation',
      grounding: { profileUnitId: 'unit-1', visibility: 'public' },
    },
  ],
};

describe('CV renderer adapters', () => {
  it('builds an HTML/PDF payload without losing grounding ids', () => {
    const payload = toHtmlPdfPayload(plan);

    expect(payload.competencies).toEqual(['Python', 'Optimisation']);
    expect(payload.projects).toEqual([
      {
        name: 'Rota scheduler',
        description: 'Built a shift allocation solver',
        groundingProfileUnitId: 'unit-1',
      },
    ]);
  });

  it('builds a generated LaTeX payload without making semantic choices', () => {
    const payload = toGeneratedLatexPayload(plan);

    expect(payload.projects).toEqual([
      {
        name: 'Rota scheduler',
        bullets: ['Built a shift allocation solver'],
        groundingProfileUnitId: 'unit-1',
      },
    ]);
    expect(payload.skills).toEqual([
      { category: 'Relevant Capabilities', items: 'Python, Optimisation' },
    ]);
  });

  it('builds latex-tex patches against existing prose slots only', () => {
    const manifest = toLatexTexPatchManifest({
      plan,
      slots: [
        { id: 'bullet-0', kind: 'bullet', text: 'Old bullet', start: 10, end: 20 },
        { id: 'skill-0', kind: 'skill', text: 'Old skills', start: 30, end: 40 },
      ],
    });

    expect(manifest.patches).toEqual([
      { id: 'bullet-0', text: 'Built a shift allocation solver' },
    ]);
  });
});
