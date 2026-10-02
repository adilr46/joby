/**
 * Connecting GitHub, selecting repositories, and ingesting the selected ones.
 *
 * Three rules this file exists to hold, in order of how badly they fail if broken:
 *
 * 1. **Only selected repositories are ever fetched.** The check happens *before* the client is
 *    called, never after. Fetching everything and filtering the results would satisfy any test
 *    that only looked at the output, while Joby had in fact read the person's private code.
 * 2. **Nothing here polls.** Every ingestion traces to a user action — connecting, changing a
 *    selection, or asking for a refresh — and each is recorded as the job's trigger.
 * 3. **A repository's visibility travels with everything derived from it.** Private in, private out.
 */

import { createHash, randomUUID } from 'node:crypto';

import type { Database } from '@joby/database';

import type {
  GitHubConnection,
  ProfessionalSource,
  ReconstructionJob,
  ReconstructionTrigger,
  RepositorySelection,
} from '../model';
import type { IdentityRepository } from '../repository';
import type { GitHubClient, GitHubCredentials, RepositoryMetadata } from './port';

export const GITHUB_CONTENT_TYPE = 'application/vnd.joby.github-repository+json';

export class GitHubNotConnectedError extends Error {
  constructor(personId: string) {
    super(`Person '${personId}' has not connected GitHub.`);
    this.name = 'GitHubNotConnectedError';
  }
}

/**
 * Raised when something asks for a repository the user did not select.
 *
 * Loud on purpose. A silent skip would let a bug quietly widen the source depth the user agreed
 * to, and nobody would find out.
 */
export class RepositoryNotSelectedError extends Error {
  constructor(readonly fullName: string) {
    super(
      `Repository '${fullName}' is not selected. Joby only inspects repositories the user has ` +
        'explicitly chosen.',
    );
    this.name = 'RepositoryNotSelectedError';
  }
}

export interface IngestResult {
  readonly fullName: string;
  /** `captured` — new material. `unchanged` — the same snapshot; no work scheduled. */
  readonly outcome: 'captured' | 'unchanged';
  readonly source?: ProfessionalSource;
  readonly job?: ReconstructionJob;
}

export class GitHubIngestionService {
  readonly #db: Database;
  readonly #repository: IdentityRepository;
  readonly #client: GitHubClient;

  constructor(dependencies: { db: Database; repository: IdentityRepository; client: GitHubClient }) {
    this.#db = dependencies.db;
    this.#repository = dependencies.repository;
    this.#client = dependencies.client;
  }

  /** Record which account the user connected. No credential is stored (plan `004`). */
  async connect(personId: string, accountLogin: string): Promise<GitHubConnection> {
    return this.#db.transaction((tx) =>
      this.#repository.upsertGitHubConnection(tx, { id: randomUUID(), personId, accountLogin }),
    );
  }

  getConnection(personId: string): Promise<GitHubConnection | undefined> {
    return this.#repository.findGitHubConnection(personId);
  }

  /**
   * What the user can choose from.
   *
   * Listing is not inspecting: it returns what the account already exposes to its owner, and
   * nothing about a repository's contents. No source is captured and no reconstruction scheduled.
   */
  async listAvailableRepositories(
    personId: string,
    credentials: GitHubCredentials,
  ): Promise<readonly RepositoryMetadata[]> {
    await this.#requireConnection(personId);
    return this.#client.listRepositories(credentials);
  }

  /** Record the user's choices. This table *is* the permission. */
  async selectRepositories(
    personId: string,
    choices: readonly { fullName: string; selected: boolean; isPrivate?: boolean }[],
  ): Promise<readonly RepositorySelection[]> {
    const connection = await this.#requireConnection(personId);

    await this.#db.transaction((tx) =>
      this.#repository.setRepositorySelections(
        tx,
        personId,
        connection.id,
        choices.map((choice) => ({
          id: randomUUID(),
          fullName: choice.fullName,
          selected: choice.selected,
          // Private unless told otherwise: being wrong in this direction costs a little
          // usefulness, and being wrong in the other direction discloses someone's private work.
          isPrivate: choice.isPrivate ?? true,
        })),
      ),
    );

    return this.#repository.listRepositorySelections(personId);
  }

  listSelections(personId: string): Promise<readonly RepositorySelection[]> {
    return this.#repository.listRepositorySelections(personId);
  }

  /**
   * Capture the selected repositories as professional sources.
   *
   * User-initiated, always: `trigger` names which action asked for this.
   */
  async ingestSelected(
    personId: string,
    credentials: GitHubCredentials,
    options: { trigger?: ReconstructionTrigger; only?: readonly string[] } = {},
  ): Promise<readonly IngestResult[]> {
    await this.#requireConnection(personId);

    const selected = await this.#repository.listRepositorySelections(personId, { onlySelected: true });
    const wanted = options.only
      ? selected.filter((selection) => options.only!.includes(selection.fullName))
      : selected;

    // If the caller named a repository that is not selected, fail rather than quietly ingesting
    // the subset that happens to be allowed.
    for (const fullName of options.only ?? []) {
      if (!selected.some((selection) => selection.fullName === fullName)) {
        throw new RepositoryNotSelectedError(fullName);
      }
    }

    const results: IngestResult[] = [];
    for (const selection of wanted) {
      results.push(
        await this.#ingestOne(personId, credentials, selection, options.trigger ?? 'selection_changed'),
      );
    }
    return results;
  }

  /** Re-fetch one repository because the user asked. Unchanged material does no work. */
  async refresh(
    personId: string,
    credentials: GitHubCredentials,
    fullName: string,
  ): Promise<IngestResult> {
    // The permission check, before anything reaches the client.
    if (!(await this.#repository.isRepositorySelected(personId, fullName))) {
      throw new RepositoryNotSelectedError(fullName);
    }

    const selections = await this.#repository.listRepositorySelections(personId, { onlySelected: true });
    const selection = selections.find((candidate) => candidate.fullName === fullName)!;
    return this.#ingestOne(personId, credentials, selection, 'refresh');
  }

  async #ingestOne(
    personId: string,
    credentials: GitHubCredentials,
    selection: RepositorySelection,
    trigger: ReconstructionTrigger,
  ): Promise<IngestResult> {
    const metadata = await this.#client.getRepository(credentials, selection.fullName);
    if (!metadata) return { fullName: selection.fullName, outcome: 'unchanged' };

    // The source is the exact metadata Joby received, stored like any other source: provenance,
    // dedup and reprocessing then work identically for a repository and a CV.
    const content = Buffer.from(`${JSON.stringify(metadata, Object.keys(metadata).sort(), 2)}\n`, 'utf8');
    const checksum = createHash('sha256').update(content).digest('hex');

    const existing = await this.#repository.findSourceByChecksum(personId, checksum);
    if (existing) {
      // The same snapshot. Re-ingesting it would reconstruct unchanged material and then invite
      // the product to present the result as movement.
      const job = await this.#repository.findJobBySource(existing.id);
      return { fullName: selection.fullName, outcome: 'unchanged', source: existing, ...(job ? { job } : {}) };
    }

    const captured = await this.#db.transaction(async (tx) => {
      const source = await this.#repository.insertSource(tx, {
        id: randomUUID(),
        personId,
        kind: 'github_repository',
        contentType: GITHUB_CONTENT_TYPE,
        content,
        checksum,
        // The repository's own visibility, not the selection's convenience. Everything derived
        // from a private repository stays private.
        visibility: metadata.isPrivate ? 'private' : 'public',
        externalRef: metadata.fullName,
        ...(metadata.pushedAt ? { sourceVersion: metadata.pushedAt } : {}),
      });

      // Same transaction as the source, exactly as CV capture does.
      const job = await this.#repository.insertJob(tx, {
        id: randomUUID(),
        personId,
        sourceId: source.id,
        trigger,
      });

      return { source, job };
    });

    return { fullName: selection.fullName, outcome: 'captured', ...captured };
  }

  async #requireConnection(personId: string): Promise<GitHubConnection> {
    const connection = await this.#repository.findGitHubConnection(personId);
    if (!connection) throw new GitHubNotConnectedError(personId);
    return connection;
  }
}
