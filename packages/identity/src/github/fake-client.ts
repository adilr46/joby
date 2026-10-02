/**
 * A deterministic GitHub client for tests and local development.
 *
 * It records **every repository it was asked about**. That is not a convenience: "Joby never
 * inspects a repository the user did not select" is only testable if something can be asked
 * afterwards what was actually fetched. A filter applied after fetching would pass a test that
 * only checked the result.
 */

import type { GitHubClient, GitHubCredentials, RepositoryMetadata } from './port';

export class FakeGitHubClient implements GitHubClient {
  readonly #repositories: Map<string, RepositoryMetadata>;
  /** Every `getRepository` call, in order. Inspect this to prove what was and was not touched. */
  readonly inspected: string[] = [];
  listed = 0;

  constructor(repositories: readonly RepositoryMetadata[]) {
    this.#repositories = new Map(repositories.map((repository) => [repository.fullName, repository]));
  }

  async listRepositories(_credentials: GitHubCredentials): Promise<readonly RepositoryMetadata[]> {
    this.listed += 1;
    // Listing is what the user chooses from. It is not inspection, and it reveals only what the
    // account already exposes to its owner.
    return [...this.#repositories.values()];
  }

  async getRepository(
    _credentials: GitHubCredentials,
    fullName: string,
  ): Promise<RepositoryMetadata | undefined> {
    this.inspected.push(fullName);
    return this.#repositories.get(fullName);
  }
}
