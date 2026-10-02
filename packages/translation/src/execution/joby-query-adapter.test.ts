import { describe, expect, it } from 'vitest';

import { CompositeJobyQueryPort, type JobyRequirementResolver } from './joby-query-adapter';
import type { JobyQuery } from './surface-resolution';

const query: JobyQuery = {
  personId: 'person-1',
  opportunityId: 'opp-1',
  requirementLabel: 'Full name',
  requirementKind: 'known',
};

describe('CompositeJobyQueryPort', () => {
  it('returns the first unambiguous authorised answer', async () => {
    const resolvers: JobyRequirementResolver[] = [
      { source: 'known_professional_fact', resolve: async () => 'Ada Lovelace' },
      { source: 'stated_context', resolve: async () => undefined },
    ];

    await expect(new CompositeJobyQueryPort(resolvers).resolve(query)).resolves.toEqual({
      status: 'resolved',
      value: 'Ada Lovelace',
      source: 'known_professional_fact',
    });
  });

  it('pauses resolution when authorised sources disagree', async () => {
    const resolvers: JobyRequirementResolver[] = [
      { source: 'known_professional_fact', resolve: async () => 'Ada Lovelace' },
      { source: 'stated_context', resolve: async () => 'Augusta Ada King' },
    ];

    const result = await new CompositeJobyQueryPort(resolvers).resolve(query);
    expect(result.status).toBe('unresolved');
    if (result.status === 'unresolved') expect(result.reason).toBe('conflicting');
  });
});
