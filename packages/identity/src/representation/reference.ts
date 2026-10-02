/**
 * Representation References — persistent, user-owned **expression** material (ADR 0021).
 *
 * Writing samples, previous cover letters, previous application answers. They answer one question:
 *
 *   How has this person chosen to express themselves?
 *
 * **Never:** what has this person done? A reference is not a professional source, and the difference
 * is load-bearing. A previous cover letter is full of claims written for a different audience —
 * possibly overstated, possibly no longer true. If those became identity, Joby would inherit every
 * exaggeration a nervous student ever wrote about themselves and launder it into future applications
 * as fact.
 *
 * So this file has no extraction, no proposal, no reconstruction job and no path to `E`. Not because
 * one is discouraged — because none exists to call. Same rule as a professional source (ADR 0010),
 * enforced by absence rather than by care:
 *
 *   A source is never canonical identity. A reference is never canonical identity either.
 *
 * Adaptation reads these. It cannot write them.
 */

import { createHash, randomUUID } from 'node:crypto';

import type { Database, Queryable } from '@joby/database';

import type {
  AddRepresentationReferenceInput,
  RepresentationReference,
  RepresentationReferenceKind,
} from './model';
import { REPRESENTATION_REFERENCE_KINDS } from './model';

export interface RepresentationPersonReader {
  personExists(personId: string): Promise<boolean>;
}

const MAX_REFERENCE_CHARS = 20_000;
const MAX_LABEL_CHARS = 120;

export class InvalidRepresentationReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRepresentationReferenceError';
  }
}

interface ReferenceRow extends Record<string, unknown> {
  id: string;
  person_id: string;
  kind: string;
  label: string;
  content: string;
  checksum: string;
  captured_at: Date | string;
  provided_by: string;
}

const COLUMNS = 'id, person_id, kind, label, content, checksum, captured_at, provided_by';

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const toReference = (row: ReferenceRow): RepresentationReference => ({
  id: row.id,
  personId: row.person_id,
  kind: row.kind as RepresentationReferenceKind,
  label: row.label,
  content: row.content,
  checksum: row.checksum,
  capturedAt: iso(row.captured_at),
  providedBy: row.provided_by,
});

export class RepresentationReferenceRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async insert(
    input: AddRepresentationReferenceInput & { id: string; checksum: string },
    runner: Queryable = this.#db,
  ): Promise<RepresentationReference> {
    const { rows } = await runner.query<ReferenceRow>(
      `INSERT INTO identity_representation_reference
         (id, person_id, kind, label, content, checksum, provided_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       -- The same material twice is one reference, not two votes on how they write.
       ON CONFLICT (person_id, checksum) DO UPDATE SET label = EXCLUDED.label
       RETURNING ${COLUMNS}`,
      [
        input.id,
        input.personId,
        input.kind,
        input.label,
        input.content,
        input.checksum,
        input.providedBy,
      ],
    );
    return toReference(rows[0]!);
  }

  async listForPerson(
    personId: string,
    runner: Queryable = this.#db,
  ): Promise<readonly RepresentationReference[]> {
    const { rows } = await runner.query<ReferenceRow>(
      `SELECT ${COLUMNS} FROM identity_representation_reference
        WHERE person_id = $1 ORDER BY captured_at DESC, id`,
      [personId],
    );
    return rows.map(toReference);
  }

  async remove(id: string, runner: Queryable = this.#db): Promise<boolean> {
    const { rowCount } = await runner.query(
      'DELETE FROM identity_representation_reference WHERE id = $1',
      [id],
    );
    return rowCount > 0;
  }
}

export class RepresentationReferenceService {
  readonly #repository: RepresentationReferenceRepository;
  readonly #identity: RepresentationPersonReader;

  constructor(dependencies: {
    repository: RepresentationReferenceRepository;
    identity: RepresentationPersonReader;
  }) {
    this.#repository = dependencies.repository;
    this.#identity = dependencies.identity;
  }

  /**
   * Keep a piece of the person's own writing.
   *
   * Nothing is extracted from it, now or later. It is stored so a generator can sound like them —
   * and for no other purpose.
   */
  async add(input: AddRepresentationReferenceInput): Promise<RepresentationReference> {
    if (!(await this.#identity.personExists(input.personId))) {
      throw new InvalidRepresentationReferenceError(`No person '${input.personId}'.`);
    }
    if (!REPRESENTATION_REFERENCE_KINDS.includes(input.kind)) {
      throw new InvalidRepresentationReferenceError(
        `'${input.kind}' is not a reference kind. Known kinds: ${REPRESENTATION_REFERENCE_KINDS.join(', ')}.`,
      );
    }

    const content = input.content?.trim() ?? '';
    if (content.length === 0) {
      throw new InvalidRepresentationReferenceError('A representation reference needs content.');
    }
    if (content.length > MAX_REFERENCE_CHARS) {
      throw new InvalidRepresentationReferenceError(
        `A reference may be at most ${MAX_REFERENCE_CHARS} characters.`,
      );
    }

    const label = input.label?.trim() ?? '';
    if (label.length === 0 || label.length > MAX_LABEL_CHARS) {
      throw new InvalidRepresentationReferenceError(
        `A reference needs a label of at most ${MAX_LABEL_CHARS} characters.`,
      );
    }

    return this.#repository.insert({
      ...input,
      id: randomUUID(),
      label,
      content,
      checksum: createHash('sha256').update(content, 'utf8').digest('hex'),
    });
  }

  list(personId: string): Promise<readonly RepresentationReference[]> {
    return this.#repository.listForPerson(personId);
  }

  /** Theirs to remove. Nothing derived from it survives, because nothing was derived from it. */
  remove(referenceId: string): Promise<boolean> {
    return this.#repository.remove(referenceId);
  }
}
