import { describe, expect, it } from 'vitest';

import type { AdaptedState } from './adapted-state';
import { buildCvRenderPlan, CvRenderPlanError } from './cv-render-plan';
import type { CvPathDecision } from './cv-path';

const adapted: AdaptedState = {
  contextId: 'ctx-1',
  personId: 'person-1',
  opportunityId: 'opp-1',
  representationId: 'rep-1',
  identityRevision: 3,
  opportunityRevision: 2,
  composedAt: '2026-09-13T00:00:00.000Z',
  elements: [
    {
      nodeId: 'unit-1',
      section: 'projects',
      title: 'Rota scheduler',
      canonicalTitle: 'Rota scheduler',
      detail: 'Built a shift allocation solver',
      capabilities: ['Python', 'Optimisation'],
      origin: 'representation',
      speaksTo: ['Python'],
      rationale: 'From your positioning; speaks to Python.',
      visibility: 'public',
    },
  ],
  assessment: {
    representationId: 'rep-1',
    baseline: [],
    gaps: [],
    unevidenced: [],
  },
  recoveryUsed: false,
  opportunity: {
    opportunityId: 'opp-1',
    revision: 2,
    role: 'Quant Developer',
    company: 'A Bank',
    requiredCapabilities: ['Python'],
    preferredCapabilities: ['Optimisation'],
    responsibilities: [],
    conditions: {},
    applicationQuestions: [],
    attribution: [],
    uncertainty: [],
  },
  user: {
    personId: 'person-1',
    identityRevision: 3,
    conditions: {},
    otherConstraints: [],
    preferences: [],
    notes: {},
  },
};

const decision: CvPathDecision = {
  path: 'reuse',
  provisional: false,
  reason: 'Already covered.',
  unsupported: [],
  changes: [],
};

describe('CV render plan', () => {
  it('turns Adapted State into a renderer-neutral grounded plan', () => {
    const plan = buildCvRenderPlan({ adapted, decision, surface: 'html_pdf' });

    expect(plan.surface).toBe('html_pdf');
    expect(plan.path).toBe('reuse');
    expect(plan.keywords).toEqual(['Python', 'Optimisation']);
    expect(plan.entries).toEqual([
      {
        nodeId: 'unit-1',
        section: 'projects',
        title: 'Rota scheduler',
        detail: 'Built a shift allocation solver',
        capabilities: ['Python', 'Optimisation'],
        speaksTo: ['Python'],
        origin: 'representation',
        grounding: { profileUnitId: 'unit-1', visibility: 'public' },
      },
    ]);
  });

  it('refuses to build a renderer payload while unsupported requirements remain', () => {
    expect(() =>
      buildCvRenderPlan({
        adapted,
        surface: 'generated_latex',
        decision: {
          path: 'needs_attention',
          provisional: false,
          reason: 'Unsupported.',
          unsupported: ['Rust'],
          changes: [],
        },
      }),
    ).toThrow(CvRenderPlanError);
  });
});
