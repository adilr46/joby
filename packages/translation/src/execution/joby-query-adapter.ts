import type { JobyQuery, JobyQueryPort, JobyQueryResult, JobyQuerySource } from './surface-resolution';

export interface JobyRequirementResolver {
  readonly source: JobyQuerySource;
  resolve(query: JobyQuery): Promise<string | undefined>;
}

/**
 * Composition-root adapter for Execution's local `JobyQueryPort`.
 *
 * Execution still does not import Identity, Adaptation, Opportunity or Application. The app runtime
 * supplies small resolvers in the order it wants them tried; this adapter only coordinates the
 * conversation and refuses ambiguous answers rather than choosing between them.
 */
export class CompositeJobyQueryPort implements JobyQueryPort {
  readonly #resolvers: readonly JobyRequirementResolver[];

  constructor(resolvers: readonly JobyRequirementResolver[]) {
    this.#resolvers = resolvers;
  }

  async resolve(query: JobyQuery): Promise<JobyQueryResult> {
    const answers: { source: JobyQuerySource; value: string }[] = [];

    for (const resolver of this.#resolvers) {
      const value = await resolver.resolve(query);
      if (value !== undefined && value.trim()) answers.push({ source: resolver.source, value });
    }

    if (answers.length === 0) {
      return {
        status: 'unresolved',
        reason: 'not_found',
        explanation: `No authorised answer was available for "${query.requirementLabel}".`,
      };
    }

    const distinct = [...new Set(answers.map((answer) => answer.value.trim()))];
    if (distinct.length > 1) {
      return {
        status: 'unresolved',
        reason: 'conflicting',
        explanation: `Multiple authorised answers disagree for "${query.requirementLabel}".`,
      };
    }

    return { status: 'resolved', value: answers[0]!.value, source: answers[0]!.source };
  }
}
