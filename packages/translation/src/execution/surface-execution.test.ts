import { describe, expect, it } from 'vitest';

import type { ApplicationSession } from './session';
import type { ApplicationSessionModule } from './session-contract';
import type { PageObservation } from './surface-observation';
import { SurfaceExecutionService, type PortalActionExecutor } from './surface-execution';

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

const surface = {
  url: 'https://portal.example/apply',
  elements: [{ id: 'full-name', kind: 'text_input' as const, label: 'Full name' }],
};

describe('SurfaceExecutionService', () => {
  it('takes the fresh observation after portal actions have executed', async () => {
    const events: string[] = [];
    const initial = session({ workingState: { portalFieldValues: { 'full-name': 'Ada Lovelace' } } });
    const recorded = session({ ...initial, memory: { notes: ['executed'] } });
    const sessions: Pick<ApplicationSessionModule, 'getSession' | 'recordSessionNote'> = {
      getSession: async () => initial,
      recordSessionNote: async () => recorded,
    };
    const executor: PortalActionExecutor = {
      execute: async () => {
        events.push('execute');
        return { surfaceElementId: 'full-name', status: 'executed' };
      },
    };
    const freshObservation = async (): Promise<PageObservation> => {
      events.push('observe');
      return {
        url: 'https://portal.example/apply',
        elements: [{ id: 'full-name', kind: 'text_input', label: 'Full name', value: 'Ada Lovelace' }],
      };
    };

    const result = await new SurfaceExecutionService({
      executor,
      sessions: sessions as ApplicationSessionModule,
    }).executeActions({ sessionId: 'session-1', surface, freshObservation });

    expect(events).toEqual(['execute', 'observe']);
    expect(result.mismatches).toEqual([]);
  });
});
