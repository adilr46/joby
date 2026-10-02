/**
 * `buildActionPlan` — the pure, deterministic mapping from an already-resolved session's working
 * state onto mechanical portal actions. No Claude call, no judgment: element kind decides the action
 * type, `workingState.portalFieldValues` decides whether there is anything to act with at all.
 */

import { describe, expect, it } from 'vitest';

import type { ApplicationSession } from './session';
import { buildExecutionSurface, type PageObservation } from './surface-observation';
import { buildActionPlan } from './surface-execution';

function session(overrides: Partial<ApplicationSession> = {}): ApplicationSession {
  return {
    id: 'session-1',
    personId: 'person-1',
    opportunityId: 'opp-1',
    jobContext: { opportunityId: 'opp-1', opportunityRevision: 1 },
    portalContext: {},
    workingState: { portalFieldValues: {} },
    executionLevel: 'preparing',
    paused: false,
    requirements: [],
    memory: { notes: [] },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const page: PageObservation = {
  url: 'https://portal.example/apply',
  elements: [
    { id: 'el-name', kind: 'text_input', label: 'Full name' },
    { id: 'el-start', kind: 'select', label: 'Earliest start date', options: ['ASAP', 'In 3 months'] },
    { id: 'el-consent', kind: 'checkbox', label: 'I agree to the privacy policy' },
    { id: 'el-resume', kind: 'file_upload', label: 'Upload your resume' },
    { id: 'el-submit', kind: 'button', label: 'Submit application' },
    { id: 'el-notice', kind: 'static_text', text: 'All fields required.' },
  ],
};

describe('buildActionPlan', () => {
  it('builds no actions when nothing is resolved into working state', () => {
    const plan = buildActionPlan(buildExecutionSurface(page), session());
    expect(plan).toEqual([]);
  });

  it('builds one action per resolved element, mapped from its kind', () => {
    const s = session({
      workingState: {
        portalFieldValues: { 'el-name': 'Ada Lovelace', 'el-start': 'ASAP', 'el-resume': 'resume.pdf' },
      },
    });
    const plan = buildActionPlan(buildExecutionSurface(page), s);
    const byId = new Map(plan.map((a) => [a.surfaceElementId, a]));
    expect(byId.get('el-name')).toEqual({ surfaceElementId: 'el-name', type: 'fill', value: 'Ada Lovelace' });
    expect(byId.get('el-start')).toEqual({ surfaceElementId: 'el-start', type: 'select', value: 'ASAP' });
    expect(byId.get('el-resume')).toEqual({ surfaceElementId: 'el-resume', type: 'upload', value: 'resume.pdf' });
  });

  it('never builds a click action — submission stays out of this plan', () => {
    const s = session({
      workingState: { portalFieldValues: { 'el-submit': 'anything', 'el-consent': 'true' } },
    });
    const plan = buildActionPlan(buildExecutionSurface(page), s);
    // A button has no mapped action type at all, so even a resolved value for it produces nothing.
    expect(plan.some((a) => a.surfaceElementId === 'el-submit')).toBe(false);
    expect(plan.find((a) => a.surfaceElementId === 'el-consent')?.type).toBe('check');
  });

  it('ignores static text and produces the same shape for a structurally different page', () => {
    const otherPage: PageObservation = {
      url: 'https://portal-two.example/step-2',
      elements: [{ id: 'q1', kind: 'textarea', label: 'Why this role?' }],
    };
    const s = session({ workingState: { portalFieldValues: { q1: 'Because...' } } });
    const plan = buildActionPlan(buildExecutionSurface(otherPage), s);
    expect(plan).toEqual([{ surfaceElementId: 'q1', type: 'fill', value: 'Because...' }]);
  });
});
