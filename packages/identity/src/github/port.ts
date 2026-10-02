/**
 * The GitHub boundary — **metadata only**.
 *
 * The roadmap's v1 default is the shallowest useful access: repository metadata, no file contents,
 * no commit history, no diffs. Deeper access needs a concrete accepted use case and a privacy
 * review, so the interface simply does not offer it — a depth limit expressed as an absence is
 * harder to erode than one expressed as a rule.
 */

export interface RepositoryMetadata {
  /** `owner/name`. */
  readonly fullName: string;
  readonly name: string;
  readonly description?: string;
  readonly isPrivate: boolean;
  /** Language names only. Not a proxy for what the person can do — see the extractor. */
  readonly languages: readonly string[];
  readonly topics?: readonly string[];
  readonly createdAt?: string;
  readonly pushedAt?: string;
  readonly homepage?: string;
}

/** Credentials are passed at call time; nothing here is persisted (plan `004`). */
export interface GitHubCredentials {
  readonly accountLogin: string;
  readonly token?: string;
}

export interface GitHubClient {
  /** Repositories the account can see, for the user to choose from. Listing is not inspecting. */
  listRepositories(credentials: GitHubCredentials): Promise<readonly RepositoryMetadata[]>;

  /**
   * Fetch one repository's metadata.
   *
   * Callers must only ever pass a repository the user has selected. That is enforced by the
   * ingestion service, and tested by asserting this method is never called for anything else.
   */
  getRepository(credentials: GitHubCredentials, fullName: string): Promise<RepositoryMetadata | undefined>;
}

export class GitHubError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'GitHubError';
  }
}
