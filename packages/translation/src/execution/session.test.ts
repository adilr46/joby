/**
 * Deriving submission readiness — the one computed fact this module produces, and the reason it is
 * computed rather than stored: a stored readiness flag is a second place the same fact could
 * disagree with itself the moment a requirement resolves underneath it.
 */

import { describe, expect, it } from 'vitest';

import { deriveSubmissionReadiness, type ApplicationSession, type SessionRequirement } from './session';

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

const requirement = (id: string, status: SessionRequirement['status']): SessionRequirement => ({
  id,
  label: `Requirement ${id}`,
  status,
});

describe('deriving submission readiness', () => {
  it('is not ready while paused, regardless of everything else', () => {
    const readiness = deriveSubmissionReadiness(
      session({ paused: true, workingState: { intent: {} as never, portalFieldValues: {} } }),
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toContain('paused');
  });

  it('is not ready once already submitted', () => {
    const readiness = deriveSubmissionReadiness(session({ executionLevel: 'submitted' }));
    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toContain('already been submitted');
  });

  it('is not ready after a failure', () => {
    const readiness = deriveSubmissionReadiness(session({ executionLevel: 'failed' }));
    expect(readiness.ready).toBe(false);
  });

  it('lists every unresolved requirement as what is blocking readiness', () => {
    const readiness = deriveSubmissionReadiness(
      session({
        requirements: [requirement('r1', 'resolved'), requirement('r2', 'unresolved'), requirement('r3', 'unresolved')],
        workingState: { intent: {} as never, portalFieldValues: {} },
      }),
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.blockedBy.map((r) => r.id)).toEqual(['r2', 'r3']);
    expect(readiness.reason).toContain('2 requirements');
  });

  it('treats not_applicable as resolved for readiness purposes', () => {
    const readiness = deriveSubmissionReadiness(
      session({
        requirements: [requirement('r1', 'not_applicable')],
        workingState: { intent: {} as never, portalFieldValues: {} },
      }),
    );
    expect(readiness.blockedBy).toEqual([]);
  });

  it('is not ready with nothing prepared to submit, even with every requirement resolved', () => {
    const readiness = deriveSubmissionReadiness(
      session({ requirements: [requirement('r1', 'resolved')] }),
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toContain('No representation has been prepared');
  });

  it('is ready when nothing is unresolved and something is prepared to submit', () => {
    const readiness = deriveSubmissionReadiness(
      session({
        requirements: [requirement('r1', 'resolved'), requirement('r2', 'not_applicable')],
        workingState: { intent: {} as never, portalFieldValues: {} },
      }),
    );
    expect(readiness.ready).toBe(true);
    expect(readiness.blockedBy).toEqual([]);
  });

  it('is ready with no requirements tracked at all, once something is prepared', () => {
    const readiness = deriveSubmissionReadiness(
      session({ workingState: { intent: {} as never, portalFieldValues: {} } }),
    );
    expect(readiness.ready).toBe(true);
  });
});
