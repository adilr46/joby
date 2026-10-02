/**
 * Capturing a professional source.
 *
 * The one transactional guarantee this slice rests on:
 *
 *   BEGIN
 *     create Person + Durable Identity root   (when there is no person yet)
 *     insert the source, immutably
 *     insert the reconstruction job
 *   COMMIT
 *
 * A source that is captured but never scheduled is a person told "we've got your CV" and then
 * nothing happening, forever, with no record that anything is outstanding. One transaction makes
 * that state unreachable.
 *
 * Nothing here writes Explicit State. A CV is the person's prior representation of themselves —
 * evidence of a claim, not the claim (roadmap Tier 1).
 */

import { createHash, randomUUID } from 'node:crypto';

import type { Database } from '@joby/database';

import type { ProfessionalSource, ReconstructionJob, SourceKind } from './model';
import type { IdentityRepository } from './repository';

/** PDFs retain their original bytes; their text layer is extracted before capture. */
export const SUPPORTED_CONTENT_TYPES = ['text/plain', 'text/markdown', 'application/pdf'] as const;

const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

export class UnsupportedSourceError extends Error {
  constructor(contentType: string) {
    super(
      `Unsupported content type '${contentType}'. This release accepts ${SUPPORTED_CONTENT_TYPES.join(' and ')}.`,
    );
    this.name = 'UnsupportedSourceError';
  }
}

export class SourceTooLargeError extends Error {
  constructor(size: number) {
    super(`Source is ${size} bytes; the limit is ${MAX_SOURCE_BYTES}.`);
    this.name = 'SourceTooLargeError';
  }
}

export class MissingPdfTextError extends Error {
  constructor() {
    super('A PDF source needs extracted text before it can be reconstructed.');
    this.name = 'MissingPdfTextError';
  }
}

export class PersonNotFoundError extends Error {
  constructor(personId: string) {
    super(`No person '${personId}'.`);
    this.name = 'PersonNotFoundError';
  }
}

export interface CaptureSourceInput {
  /** Omit for upload-first onboarding: a Person is created, unclaimed (ADR 0010). */
  readonly personId?: string;
  readonly kind?: SourceKind;
  readonly contentType: string;
  readonly filename?: string;
  readonly content: Buffer;
  /** Derived from a text-layer PDF at the API boundary; the original PDF remains `content`. */
  readonly extractedText?: Buffer;
}

export interface CaptureSourceResult {
  readonly personId: string;
  readonly source: ProfessionalSource;
  readonly job: ReconstructionJob;
  /** True when these bytes were already captured for this person and nothing new was stored. */
  readonly duplicate: boolean;
}

export class SourceCaptureService {
  readonly #db: Database;
  readonly #repository: IdentityRepository;

  constructor(dependencies: { db: Database; repository: IdentityRepository }) {
    this.#db = dependencies.db;
    this.#repository = dependencies.repository;
  }

  async capture(input: CaptureSourceInput): Promise<CaptureSourceResult> {
    const contentType = input.contentType.split(';')[0]?.trim().toLowerCase() ?? '';
    if (!(SUPPORTED_CONTENT_TYPES as readonly string[]).includes(contentType)) {
      throw new UnsupportedSourceError(input.contentType);
    }
    if (input.content.byteLength === 0) throw new UnsupportedSourceError('empty body');
    if (input.content.byteLength > MAX_SOURCE_BYTES) throw new SourceTooLargeError(input.content.byteLength);
    if (contentType === 'application/pdf' && !input.extractedText?.length) throw new MissingPdfTextError();

    const checksum = createHash('sha256').update(input.content).digest('hex');

    // Re-uploading the same file is not a new source and must not queue a second reconstruction.
    // Checked before the transaction as a fast path; the unique index is what actually enforces it.
    if (input.personId) {
      const existing = await this.#repository.findSourceByChecksum(input.personId, checksum);
      if (existing) {
        const job = await this.#repository.findJobBySource(existing.id);
        if (job) return { personId: input.personId, source: existing, job, duplicate: true };
      }
    }

    return this.#db.transaction(async (tx) => {
      let personId = input.personId;

      if (personId === undefined) {
        // Upload-first: the Person exists from the first captured source (ADR 0010).
        personId = randomUUID();
        await this.#repository.createPerson(tx, personId, randomUUID());
      } else if (!(await this.#repository.findPerson(personId, tx))) {
        throw new PersonNotFoundError(personId);
      }

      const source = await this.#repository.insertSource(tx, {
        id: randomUUID(),
        personId,
        kind: input.kind ?? 'cv',
        contentType,
        content: input.content,
        ...(input.extractedText ? { extractedText: input.extractedText } : {}),
        checksum,
        ...(input.filename ? { filename: input.filename } : {}),
      });

      // Same transaction. This is the scheduling guarantee, and it is why it is a job row rather
      // than a post-commit call to anything.
      const job = await this.#repository.insertJob(tx, {
        id: randomUUID(),
        personId,
        sourceId: source.id,
      });

      return { personId, source, job, duplicate: false };
    });
  }
}
