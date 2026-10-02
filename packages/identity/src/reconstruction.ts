/**
 * Running reconstruction: claim a job, extract, persist a proposal.
 *
 * Two properties matter more than anything else here.
 *
 * **Nothing canonical is written.** The only output is a row in
 * `identity_reconstruction_proposal`. There is no code path from this file to Explicit State,
 * because in this release Explicit State has no tables at all — confirmation arrives in R2.
 *
 * **Failure preserves the source.** An extraction that throws marks the job failed with its
 * reason and leaves the captured bytes untouched, so it can be retried when the cause is fixed.
 */

import { randomUUID } from 'node:crypto';

import type { Database } from '@joby/database';

import { classifyAgainstState } from './delta';
import type { ExplicitStateRepository } from './explicit-state-repository';
import { extractFromRepository } from './github/repository-extractor';
import type { RepositoryMetadata } from './github/port';
import type { ReconstructionJob, ReconstructionProposal } from './model';
import type { CvExtractor, ExtractionResult } from './extraction/port';
import type { IdentityRepository } from './repository';

/**
 * A stored GitHub source is the metadata JSON exactly as received. Deterministic and offline —
 * re-reading a captured snapshot must never require another network call.
 */
function extractRepositorySource(sourceId: string, content: Buffer): ExtractionResult {
  const metadata = JSON.parse(content.toString('utf8')) as RepositoryMetadata;
  return { model: 'github-metadata-v1', content: extractFromRepository(sourceId, metadata) };
}

export interface ReconstructionRunResult {
  readonly claimed: number;
  readonly succeeded: number;
  readonly failed: number;
  /** Claimed jobs whose proposal already existed — redelivery, correctly doing nothing. */
  readonly skipped: number;
}

export interface ReconstructionRunnerOptions {
  readonly batchSize?: number;
  /** How long a claim may be held before another worker may take it. */
  readonly reclaimAfterMs?: number;
}

export class ReconstructionRunner {
  readonly #db: Database;
  readonly #repository: IdentityRepository;
  readonly #state: ExplicitStateRepository;
  readonly #extractor: CvExtractor;
  readonly #batchSize: number;
  readonly #reclaimAfterMs: number;

  constructor(dependencies: {
    db: Database;
    repository: IdentityRepository;
    stateRepository: ExplicitStateRepository;
    extractor: CvExtractor;
    options?: ReconstructionRunnerOptions;
  }) {
    this.#db = dependencies.db;
    this.#repository = dependencies.repository;
    this.#state = dependencies.stateRepository;
    this.#extractor = dependencies.extractor;
    this.#batchSize = dependencies.options?.batchSize ?? 5;
    this.#reclaimAfterMs = dependencies.options?.reclaimAfterMs ?? 300_000;
  }

  /** Claim one batch and run it. Jobs settle independently: one failure never strands the rest. */
  async runOnce(options: { limit?: number } = {}): Promise<ReconstructionRunResult> {
    const jobs = await this.#repository.claimJobs(options.limit ?? this.#batchSize, this.#reclaimAfterMs);

    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    for (const job of jobs) {
      const outcome = await this.#run(job);
      if (outcome === 'succeeded') succeeded += 1;
      else if (outcome === 'skipped') skipped += 1;
      else failed += 1;
    }

    return { claimed: jobs.length, succeeded, failed, skipped };
  }

  async #run(job: ReconstructionJob): Promise<'succeeded' | 'failed' | 'skipped'> {
    try {
      // A claim can be reclaimed after a worker dies mid-extraction, so the work may already be
      // done. Checked here to avoid a pointless model call; the unique index on job_id is what
      // actually guarantees one proposal.
      if (await this.#repository.findProposalByJob(job.id)) {
        await this.#db.transaction((tx) => this.#repository.markJobSucceeded(tx, job.id));
        return 'skipped';
      }

      const source = await this.#repository.findSource(job.sourceId);
      const content = await this.#repository.readSourceContent(job.sourceId);
      if (!source || !content) throw new Error(`Source ${job.sourceId} has no stored content`);

      // Which extractor depends on what kind of source this is. The Explicit State model does not
      // change with the source type — that is the point of the professional-source abstraction.
      const extraction =
        source.kind === 'github_repository'
          ? extractRepositorySource(job.sourceId, content)
          : // The model call is outside the transaction, deliberately: it is slow and external,
            // and a transaction held open across it would hold a connection for the duration.
            await this.#extractor.extract({ sourceId: job.sourceId, text: content.toString('utf8') });

      // Compare against what Joby already holds, so the draft is a *delta* rather than a restatement.
      // On an empty identity every candidate classifies as `new`, which is exactly Release 1's
      // behaviour — the first reconstruction is the degenerate case of this one.
      const currentState = await this.#state.getReconstructedState(job.personId);
      const classified = classifyAgainstState(extraction.content, currentState);

      // Proposal and job completion commit together. Split apart, a crash between them leaves a
      // proposal nothing points at, or a job claiming success with no proposal behind it.
      const inserted = await this.#db.transaction(async (tx) => {
        const proposal = await this.#repository.insertProposal(tx, {
          id: randomUUID(),
          personId: job.personId,
          sourceId: job.sourceId,
          jobId: job.id,
          extractor: source.kind === 'github_repository' ? 'github-metadata' : this.#extractor.name,
          model: extraction.model,
          content: classified,
        });
        await this.#repository.markJobSucceeded(tx, job.id);
        return proposal;
      });

      return inserted ? 'succeeded' : 'skipped';
    } catch (error) {
      // The source is not touched here. That is the point: a failed extraction must be
      // diagnosable and retryable, and it is only retryable because the bytes survived.
      await this.#repository.markJobFailed(job.id, error instanceof Error ? error.message : String(error));
      return 'failed';
    }
  }
}

export type { ReconstructionProposal };
