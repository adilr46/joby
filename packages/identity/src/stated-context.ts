/**
 * Stated Context (X) — the half of Explicit State only the user writes.
 *
 *   X = (CareerDirection, Preferences, Constraints)
 *
 * Two rules this file exists to hold (ADR 0011, ADR 0017):
 *
 *  - **Only the user writes X.** There is no AI path in here, no inference, no default value, and
 *    no way for reconstruction to reach it. A historical statement found in a CV may be *proposed*
 *    elsewhere; it becomes current X only by the explicit act below.
 *  - **A condition is never inferred.** Joby does not conclude that someone needs sponsorship, or
 *    that they will only work in Bristol, from anything they have done. They say it, or it is
 *    unknown — and unknown is a real answer that Adaptation surfaces as uncertainty rather than
 *    guessing past.
 *
 * X is canonical Explicit State, so a change here bumps the identity revision and publishes
 * `IdentityUpdated`, exactly as a confirmation or correction to R does.
 */

import { randomUUID } from 'node:crypto';

import type { Database, Queryable, Transaction } from '@joby/database';
import { createEvent, type TransactionalEventPublisher } from '@joby/events';

import { ConcurrencyError } from './concurrency';
import type { StatedContext, UserCondition, UserConditionKind } from './model';
import { USER_CONDITION_KINDS } from './model';
import type { IdentityRepository } from './repository';
import type { ExplicitStateRepository } from './explicit-state-repository';

export class InvalidStatedContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStatedContextError';
  }
}

export interface UserConditionInput {
  readonly kind: UserConditionKind;
  readonly values: readonly string[];
  readonly note?: string;
}

export interface SetStatedContextInput {
  readonly personId: string;
  /** The identity revision the user read. X is canonical, and guarded like the rest of it. */
  readonly expectedRevision: number;
  readonly statedBy: string;
  /** Omitted leaves the component as it was; `null` clears it. */
  readonly careerDirection?: string | null;
  readonly preferences?: readonly string[] | null;
  readonly constraints?: readonly string[] | null;
  /** The whole condition set, replacing what was there. Omitted leaves it alone. */
  readonly conditions?: readonly UserConditionInput[];
}

const MAX_TEXT = 2000;
const MAX_LIST_ITEMS = 100;

interface ContextRow extends Record<string, unknown> {
  career_direction: string | null;
  preferences: unknown;
  constraints: unknown;
}

interface ConditionRow extends Record<string, unknown> {
  kind: string;
  values: unknown;
  note: string | null;
  stated_at: Date | string;
  stated_by: string;
}

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const strings = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

function normaliseText(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new InvalidStatedContextError(`${label} must be text.`);
  }
  const normalised = value.trim();
  if (normalised.length === 0) {
    throw new InvalidStatedContextError(`${label} may not be blank. Use null to remove it.`);
  }
  if (normalised.length > MAX_TEXT) {
    throw new InvalidStatedContextError(`${label} may be at most ${MAX_TEXT} characters.`);
  }
  return normalised;
}

function normaliseList(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new InvalidStatedContextError(`${label} must be a list of text values or null.`);
  }
  if (value.length > MAX_LIST_ITEMS) {
    throw new InvalidStatedContextError(`${label} may contain at most ${MAX_LIST_ITEMS} values.`);
  }
  return value.map((item, index) => normaliseText(item, `${label}[${index}]`));
}

function sameStrings(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

function sameConditions(
  held: readonly UserCondition[] | undefined,
  next: readonly UserConditionInput[] | undefined,
): boolean {
  if (next === undefined) return true;
  const semanticHeld = (held ?? []).map(({ kind, values, note }) => ({ kind, values, ...(note ? { note } : {}) }));
  return JSON.stringify(semanticHeld) === JSON.stringify(next);
}

export class StatedContextRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async read(personId: string, runner: Queryable = this.#db): Promise<StatedContext> {
    const context = await runner.query<ContextRow>(
      'SELECT career_direction, preferences, constraints FROM identity_stated_context WHERE person_id = $1',
      [personId],
    );
    const conditions = await runner.query<ConditionRow>(
      `SELECT kind, values, note, stated_at, stated_by FROM identity_user_condition
        WHERE person_id = $1 ORDER BY kind`,
      [personId],
    );

    const row = context.rows[0];
    const preferences = strings(row?.preferences);
    const constraints = strings(row?.constraints);

    return {
      // Absent stays absent. An unset career direction must not round-trip into an empty string,
      // which would read as "they have none" rather than "they have not said".
      ...(row?.career_direction ? { careerDirection: row.career_direction } : {}),
      ...(preferences.length > 0 ? { preferences } : {}),
      ...(constraints.length > 0 ? { constraints } : {}),
      ...(conditions.rows.length > 0
        ? {
            conditions: conditions.rows.map(
              (condition): UserCondition => ({
                kind: condition.kind as UserConditionKind,
                values: strings(condition.values),
                statedAt: iso(condition.stated_at),
                statedBy: condition.stated_by,
                ...(condition.note === null ? {} : { note: condition.note }),
              }),
            ),
          }
        : {}),
    };
  }

  async upsertContext(
    tx: Transaction,
    input: {
      personId: string;
      careerDirection: string | null;
      preferences: readonly string[];
      constraints: readonly string[];
      statedBy: string;
    },
  ): Promise<void> {
    await tx.query(
      `INSERT INTO identity_stated_context
         (person_id, career_direction, preferences, constraints, stated_by)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
       ON CONFLICT (person_id) DO UPDATE SET
         career_direction = EXCLUDED.career_direction,
         preferences      = EXCLUDED.preferences,
         constraints      = EXCLUDED.constraints,
         stated_at        = now(),
         stated_by        = EXCLUDED.stated_by`,
      [
        input.personId,
        input.careerDirection,
        JSON.stringify(input.preferences),
        JSON.stringify(input.constraints),
        input.statedBy,
      ],
    );
  }

  /** Replace the whole condition set: it is one statement about a situation, not a bag of rows. */
  async replaceConditions(
    tx: Transaction,
    personId: string,
    conditions: readonly UserConditionInput[],
    statedBy: string,
  ): Promise<void> {
    await tx.query('DELETE FROM identity_user_condition WHERE person_id = $1', [personId]);
    for (const condition of conditions) {
      await tx.query(
        `INSERT INTO identity_user_condition (id, person_id, kind, values, note, stated_by)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
        [
          randomUUID(),
          personId,
          condition.kind,
          JSON.stringify(condition.values),
          condition.note ?? null,
          statedBy,
        ],
      );
    }
  }

  /** Advance only the Stated Context aggregate revision, independent of the professional graph. */
  async incrementRevision(
    tx: Transaction,
    personId: string,
    statedBy: string,
  ): Promise<number> {
    const { rows } = await tx.query<{ revision: number }>(
      `INSERT INTO identity_stated_context
         (person_id, preferences, constraints, stated_by, revision)
       VALUES ($1, '[]'::jsonb, '[]'::jsonb, $2, 1)
       ON CONFLICT (person_id) DO UPDATE SET
         revision  = identity_stated_context.revision + 1,
         stated_at = now(),
         stated_by = EXCLUDED.stated_by
       RETURNING revision`,
      [personId, statedBy],
    );
    return rows[0]!.revision;
  }
}

export class StatedContextService {
  readonly #db: Database;
  readonly #repository: StatedContextRepository;
  readonly #identity: IdentityRepository;
  readonly #state: ExplicitStateRepository;
  readonly #publisher: TransactionalEventPublisher;

  constructor(dependencies: {
    db: Database;
    repository: StatedContextRepository;
    identityRepository: IdentityRepository;
    stateRepository: ExplicitStateRepository;
    publisher: TransactionalEventPublisher;
  }) {
    this.#db = dependencies.db;
    this.#repository = dependencies.repository;
    this.#identity = dependencies.identityRepository;
    this.#state = dependencies.stateRepository;
    this.#publisher = dependencies.publisher;
  }

  read(personId: string): Promise<StatedContext> {
    return this.#repository.read(personId);
  }

  /**
   * Write what the person says about their situation.
   *
   * Guarded by the identity revision: X is canonical Explicit State, and a stale writer is told
   * rather than applied on top.
   */
  async set(input: SetStatedContextInput): Promise<{ revision: number; stated: StatedContext }> {
    const person = await this.#identity.findPerson(input.personId);
    if (!person) throw new InvalidStatedContextError(`No person '${input.personId}'.`);

    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw new InvalidStatedContextError('expectedRevision must be a non-negative integer.');
    }
    const statedBy = normaliseText(input.statedBy, 'statedBy');
    if (
      input.careerDirection === undefined &&
      input.preferences === undefined &&
      input.constraints === undefined &&
      input.conditions === undefined
    ) {
      throw new InvalidStatedContextError(
        'State at least one Stated Context field. Omit a field to preserve it; use null or an empty list to remove it.',
      );
    }

    const careerDirection =
      input.careerDirection === undefined || input.careerDirection === null
        ? input.careerDirection
        : normaliseText(input.careerDirection, 'careerDirection');
    const preferences =
      input.preferences === undefined || input.preferences === null
        ? input.preferences
        : normaliseList(input.preferences, 'preferences');
    const constraints =
      input.constraints === undefined || input.constraints === null
        ? input.constraints
        : normaliseList(input.constraints, 'constraints');

    if (input.conditions !== undefined && !Array.isArray(input.conditions)) {
      throw new InvalidStatedContextError('conditions must be a list.');
    }
    const seenKinds = new Set<UserConditionKind>();
    const conditions = input.conditions?.map((condition, index) => {
      if (!condition || typeof condition !== 'object') {
        throw new InvalidStatedContextError(`conditions[${index}] must be an object.`);
      }
      if (!USER_CONDITION_KINDS.includes(condition.kind)) {
        throw new InvalidStatedContextError(
          `'${condition.kind}' is not a condition kind Joby can compare. ` +
            `Known kinds: ${USER_CONDITION_KINDS.join(', ')}. Anything else belongs in constraints.`,
        );
      }
      if (seenKinds.has(condition.kind)) {
        throw new InvalidStatedContextError(
          `The '${condition.kind}' condition appears more than once. Put its acceptable values in one condition.`,
        );
      }
      seenKinds.add(condition.kind);
      const values = normaliseList(condition.values, `conditions[${index}].values`);
      if (values.length === 0) {
        throw new InvalidStatedContextError(
          `The '${condition.kind}' condition has no values. To remove it, leave it out.`,
        );
      }
      return {
        kind: condition.kind,
        values,
        ...(condition.note === undefined ? {} : { note: normaliseText(condition.note, `conditions[${index}].note`) }),
      };
    }).sort((left, right) => left.kind.localeCompare(right.kind));

    // Read-modify-write inside the guard, so an omitted component is genuinely left alone rather
    // than silently cleared by a caller who only meant to change one thing.
    const result = await this.#db.transaction(async (tx) => {
      const heldRevision = await this.#state.lockRevision(tx, input.personId);
      if (heldRevision !== input.expectedRevision) {
        throw new ConcurrencyError(input.expectedRevision, heldRevision);
      }
      const current = await this.#repository.read(input.personId, tx);

      const resolve = <T>(supplied: T | null | undefined, held: T | undefined): T | undefined =>
        supplied === undefined ? held : (supplied ?? undefined);

      const next = {
        careerDirection: resolve(careerDirection, current.careerDirection),
        preferences: resolve(preferences, current.preferences),
        constraints: resolve(constraints, current.constraints),
      };
      const contextChanged =
        next.careerDirection !== current.careerDirection ||
        !sameStrings(next.preferences, current.preferences) ||
        !sameStrings(next.constraints, current.constraints);
      const conditionsChanged = !sameConditions(current.conditions, conditions);

      // A command that re-states the currently operative context is not a state transition. It
      // therefore creates neither a new revision nor an IdentityUpdated event.
      if (!contextChanged && !conditionsChanged) {
        return { revision: heldRevision, stated: current } as const;
      }

      const revision = await this.#state.bumpRevision(tx, input.personId, input.expectedRevision);
      if (revision === undefined) {
        throw new ConcurrencyError(
          input.expectedRevision,
          await this.#state.getRevision(input.personId, tx),
        );
      }

      if (contextChanged) {
        await this.#repository.upsertContext(tx, {
          personId: input.personId,
          careerDirection: next.careerDirection ?? null,
          preferences: next.preferences ?? [],
          constraints: next.constraints ?? [],
          statedBy,
        });
      }

      if (conditionsChanged && conditions !== undefined) {
        await this.#repository.replaceConditions(tx, input.personId, conditions, statedBy);
      }

      await this.#repository.incrementRevision(tx, input.personId, statedBy);

      const event = createEvent('IdentityUpdated', {
        personId: input.personId,
        payload: {
          identityId: person.durableIdentityId,
          changedFields: ['stated'],
          revision,
          // X has no other author. If this event exists, a person wrote it themselves.
          userConfirmed: true,
        },
        metadata: { source: 'api', actor: { kind: 'user', userId: statedBy } },
      });
      await this.#publisher.recordDurable(tx, event);

      return { revision, stated: await this.#repository.read(input.personId, tx), event };
    });

    if ('event' in result && result.event) await this.#publisher.publishCommitted(result.event);
    return { revision: result.revision, stated: result.stated };
  }
}
