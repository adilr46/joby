/**
 * UC02 — understanding an opportunity.
 *
 * ```text
 * captured evidence → interpret → validate → stored understanding (a new revision)
 * ```
 *
 * Two boundaries hold this in place.
 *
 * **The understanding partition never reads capture tables.** Evidence arrives through the consumer-side port
 * below, wired by an app composition root — the same shape Adaptation already uses to consume
 * Opportunity Intelligence. So `@joby/translation` does not depend on `@joby/opportunity`, and the raw/interpreted
 * separation is a package fact rather than a naming convention.
 *
 * **No person appears anywhere in this file.** This is one side of Opportunity semantics: what
 * the opportunity *is*. What it means for a particular person is `mapOpportunityToPerson`, which is
 * computed per request, stored nowhere, and not called from here.
 */

import { randomUUID } from 'node:crypto';

import type { Database } from '@joby/database';

import {
  InterpretationError,
  type EvidenceForInterpretation,
  type OpportunityInterpreter,
} from './interpretation-port';
import {
  OpportunityUnderstandingRepository,
  type StoredUnderstanding,
} from './understanding-repository';
import { validateUnderstanding } from './validate-understanding';

/**
 * The read-only window the understanding partition needs onto captured evidence.
 *
 * Narrow on purpose: there is no write on it to call. This partition cannot create an opportunity,
 * amend one, or delete evidence, and no amount of future code in this module can change that
 * without the composition root handing it a wider port on purpose.
 */
export interface OpportunityEvidenceReader {
  /** Current evidence sets, in a stable total order, pageable by cursor. */
  listSummaries(options?: {
    readonly limit?: number;
    readonly after?: string;
  }): Promise<
    readonly {
      readonly opportunityId: string;
      readonly evidenceIds: readonly string[];
      readonly cursor: string;
    }[]
  >;
  /** Evidence for one opportunity, as text, with the provenance needed to attribute a reading. */
  readEvidence(opportunityId: string): Promise<readonly EvidenceForInterpretation[]>;
}

export class OpportunityNotCapturedError extends Error {
  constructor(opportunityId: string) {
    super(
      `Opportunity '${opportunityId}' has no captured evidence. Understanding is read from evidence, ` +
        'never produced without it.',
    );
    this.name = 'OpportunityNotCapturedError';
  }
}

/**
 * Raised when evidence changed while this reading was being made.
 *
 * Not an error in the interpreter and not a lost reading: the opportunity simply moved on, and the
 * work is redone against what it now holds.
 */
export class UnderstandingSupersededError extends Error {
  constructor(opportunityId: string) {
    super(
      `Evidence for opportunity '${opportunityId}' changed while it was being read. The reading was ` +
        'discarded; the current evidence will be read on the next pass.',
    );
    this.name = 'UnderstandingSupersededError';
  }
}

export interface InterpretRunResult {
  readonly considered: number;
  readonly understood: number;
  /** Already current — the same evidence set had already been read. Redelivery doing nothing. */
  readonly skipped: number;
  readonly failed: number;
}

/** How many summaries to fetch per page while hunting for outstanding work. */
const PAGE_SIZE = 100;

/** Two evidence sets are the same reading job when they contain the same ids. */
function sameEvidence(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = new Set(a);
  return b.every((id) => left.has(id));
}

/**
 * Postgres unique violation.
 *
 * Two readers can pass `findLatest` before either has inserted, then both compute the same next
 * revision. The unique constraint is what turns that into a loud, harmless collision rather than a
 * lost reading — but only one of them did the work, and the other must not report a failure for it.
 */
function isRevisionCollision(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505';
}

export class OpportunityUnderstandingService {
  readonly #db: Database;
  readonly #repository: OpportunityUnderstandingRepository;
  readonly #opportunities: OpportunityEvidenceReader;
  readonly #interpreter: OpportunityInterpreter;

  constructor(dependencies: {
    db: Database;
    repository: OpportunityUnderstandingRepository;
    opportunities: OpportunityEvidenceReader;
    interpreter: OpportunityInterpreter;
  }) {
    this.#db = dependencies.db;
    this.#repository = dependencies.repository;
    this.#opportunities = dependencies.opportunities;
    this.#interpreter = dependencies.interpreter;
  }

  getUnderstanding(opportunityId: string, revision?: number): Promise<StoredUnderstanding | undefined> {
    return revision === undefined
      ? this.#repository.findLatest(opportunityId)
      : this.#repository.findRevision(opportunityId, revision);
  }

  /**
   * Read one opportunity's current evidence into a new understanding.
   *
   * Idempotent by evidence set: if the current reading was already made from exactly this evidence,
   * nothing is written and the existing revision is returned. Re-running must not manufacture
   * revisions, or a poll loop would fill the table with identical readings.
   */
  async understand(opportunityId: string): Promise<StoredUnderstanding> {
    const evidence = await this.#opportunities.readEvidence(opportunityId);
    if (evidence.length === 0) throw new OpportunityNotCapturedError(opportunityId);

    const evidenceIds = evidence.map((item) => item.evidenceId);

    const current = await this.#repository.findLatest(opportunityId);
    if (current && sameEvidence(current.evidenceIds, evidenceIds)) return current;

    const result = await this.#interpreter.interpret({ opportunityId, evidence });

    // Interpreter output is untrusted input. Nothing malformed is stored, and a rejection leaves the
    // evidence and the previous reading exactly as they were.
    const content = validateUnderstanding(result.understanding, evidenceIds);

    try {
      return await this.#db.transaction((tx) =>
        this.#repository.insert(tx, {
          id: randomUUID(),
          opportunityId,
          content,
          interpreter: result.interpreter,
          evidenceIds,
        }),
      );
    } catch (error) {
      if (!isRevisionCollision(error)) throw error;

      // Someone else read the same evidence at the same moment and got there first. That is the
      // right answer already stored, not a failure: returning it keeps `understand` idempotent under
      // concurrency, and stops a benign race from surfacing as a 500 or a spurious worker failure.
      const winner = await this.#repository.findLatest(opportunityId);
      if (winner && sameEvidence(winner.evidenceIds, evidenceIds)) return winner;

      // A collision against a *different* evidence set means new evidence landed mid-read. This
      // reading is already stale, so discarding it is correct — the next pass reads the new set.
      throw new UnderstandingSupersededError(opportunityId);
    }
  }

  /**
   * Read every recently captured opportunity whose current understanding is out of date.
   *
   * Polled rather than event-driven, deliberately: capturing an opportunity is not a fact about a
   * person, and every Joby event is about exactly one person (ADR 0028). Inventing a person to
   * satisfy the envelope would be worse than polling a bounded window.
   *
   * One failure does not stop the batch. An opportunity that could not be read stays outstanding and
   * is retried on the next pass, with its evidence untouched.
   */
  async understandOutstanding(options?: { limit?: number }): Promise<InterpretRunResult> {
    const wanted = options?.limit ?? 10;
    let considered = 0;
    let understood = 0;
    let skipped = 0;
    let failed = 0;
    let after: string | undefined;

    // **Page until enough outstanding work is found, or the set is exhausted.**
    //
    // Reading a fixed window of the most recent opportunities would leave anything that falls out of
    // it permanently un-understood: its evidence never changes, so it never becomes recent again.
    // Paging a stable order makes every opportunity reachable, which is what lets the "nothing is
    // stranded" claim actually hold.
    while (understood + failed < wanted) {
      const page: readonly { opportunityId: string; evidenceIds: readonly string[]; cursor: string }[] =
        await this.#opportunities.listSummaries(
          after === undefined ? { limit: PAGE_SIZE } : { limit: PAGE_SIZE, after },
        );
      if (page.length === 0) break;
      after = page[page.length - 1]!.cursor;
      considered += page.length;

      const known = await this.#repository.latestEvidenceSets(page.map((item) => item.opportunityId));

      for (const candidate of page) {
        const existing = known.get(candidate.opportunityId);
        if (existing && sameEvidence(existing, candidate.evidenceIds)) {
          skipped += 1;
          continue;
        }
        try {
          await this.understand(candidate.opportunityId);
          understood += 1;
        } catch (error) {
          if (error instanceof UnderstandingSupersededError) {
            // Someone captured more evidence mid-read. Nothing is wrong and nothing is lost; the
            // next pass reads the fuller set. Counting it as a failure would cry wolf.
            skipped += 1;
            continue;
          }
          failed += 1;
          const reason = error instanceof InterpretationError ? error.message : String(error);
          console.error(`[opportunity] could not understand ${candidate.opportunityId}: ${reason}`);
        }
        if (understood + failed >= wanted) break;
      }

      if (page.length < PAGE_SIZE) break;
    }

    return { considered, understood, skipped, failed };
  }
}
