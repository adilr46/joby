/**
 * The real GitHub adapter. **Metadata only** — two endpoints, both of which return facts about a
 * repository, neither of which returns its contents.
 *
 * `fetch` is enough; an SDK would add a dependency and, more importantly, would make it easy to
 * reach deeper than the accepted source depth without noticing.
 */

import { GitHubError, type GitHubClient, type GitHubCredentials, type RepositoryMetadata } from './port';

const API = 'https://api.github.com';

interface RepositoryResponse {
  full_name: string;
  name: string;
  description: string | null;
  private: boolean;
  topics?: string[];
  created_at?: string;
  pushed_at?: string;
  homepage?: string | null;
}

export interface HttpGitHubClientOptions {
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

export class HttpGitHubClient implements GitHubClient {
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor(options: HttpGitHubClientOptions = {}) {
    this.#fetch = options.fetchImpl ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? 30_000;
  }

  async listRepositories(credentials: GitHubCredentials): Promise<readonly RepositoryMetadata[]> {
    const response = await this.#get('/user/repos?per_page=100&sort=pushed', credentials);
    const repositories = (await response.json()) as RepositoryResponse[];
    // Languages are fetched per repository, and only for ones the user selects. Fetching them
    // here would mean touching every repository just to build a chooser.
    return repositories.map((repository) => this.#toMetadata(repository, []));
  }

  async getRepository(
    credentials: GitHubCredentials,
    fullName: string,
  ): Promise<RepositoryMetadata | undefined> {
    const response = await this.#get(`/repos/${fullName}`, credentials, { allow404: true });
    if (response.status === 404) return undefined;

    const repository = (await response.json()) as RepositoryResponse;

    // The languages endpoint returns byte counts per language. Only the names are taken: byte
    // counts would invite ranking someone's skills by how much code they happened to write.
    let languages: string[] = [];
    try {
      const languagesResponse = await this.#get(`/repos/${fullName}/languages`, credentials);
      languages = Object.keys((await languagesResponse.json()) as Record<string, number>);
    } catch {
      // A repository with no detected languages is normal, and not a reason to fail ingestion.
    }

    return this.#toMetadata(repository, languages);
  }

  #toMetadata(repository: RepositoryResponse, languages: readonly string[]): RepositoryMetadata {
    return {
      fullName: repository.full_name,
      name: repository.name,
      // Private unless GitHub says otherwise: the safe direction to be wrong in.
      isPrivate: repository.private !== false,
      languages: [...languages],
      ...(repository.description ? { description: repository.description } : {}),
      ...(repository.topics && repository.topics.length > 0 ? { topics: repository.topics } : {}),
      ...(repository.created_at ? { createdAt: repository.created_at } : {}),
      ...(repository.pushed_at ? { pushedAt: repository.pushed_at } : {}),
      ...(repository.homepage ? { homepage: repository.homepage } : {}),
    };
  }

  async #get(
    path: string,
    credentials: GitHubCredentials,
    options: { allow404?: boolean } = {},
  ): Promise<Response> {
    let response: Response;
    try {
      response = await this.#fetch(`${API}${path}`, {
        signal: AbortSignal.timeout(this.#timeoutMs),
        headers: {
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
          ...(credentials.token ? { authorization: `Bearer ${credentials.token}` } : {}),
        },
      });
    } catch (error) {
      throw new GitHubError(`GitHub request to ${path} failed: ${String(error)}`, { cause: error });
    }

    if (response.status === 404 && options.allow404) return response;
    if (!response.ok) throw new GitHubError(`GitHub returned ${response.status} for ${path}`);
    return response;
  }
}
