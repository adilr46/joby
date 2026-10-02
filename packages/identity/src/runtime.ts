/**
 * `@joby/identity/runtime` — composition, for Joby's own runtimes.
 *
 * `apps/api` and `apps/worker` need more than the domain contract: they acquire professional
 * sources, run the reconstruction loop, inspect and retry jobs, and choose model adapters. None of
 * that is something *another domain* should be able to reach, which is why it lives behind a
 * separate entry point rather than beside the contract.
 *
 * The split is by who is asking. A domain asking "what is true about this person" gets
 * `@joby/identity` — nine methods. A runtime assembling the system gets this, and that is a
 * different blast radius.
 *
 * `IdentityService implements Identity`, so the contract is enforced by the compiler rather than by
 * anyone remembering to keep the two in step.
 */

import type { DurableIdentityModule } from './durable-contract';
import { IdentityService, defaultExtractor, type IdentityServiceOptions } from './service';

export interface DurableIdentityRuntime extends DurableIdentityModule {
  getSource: IdentityService['getSource'];
  getReconstructionJob: IdentityService['getReconstructionJob'];
  retryReconstruction: IdentityService['retryReconstruction'];
  runReconstruction: IdentityService['runReconstruction'];
  listCorrections: IdentityService['listCorrections'];
  connectGitHub: IdentityService['connectGitHub'];
  getGitHubConnection: IdentityService['getGitHubConnection'];
  listAvailableRepositories: IdentityService['listAvailableRepositories'];
  selectRepositories: IdentityService['selectRepositories'];
  listRepositorySelections: IdentityService['listRepositorySelections'];
  ingestSelectedRepositories: IdentityService['ingestSelectedRepositories'];
  refreshRepository: IdentityService['refreshRepository'];
}

export function createIdentityRuntime(options: IdentityServiceOptions): DurableIdentityRuntime {
  return new IdentityService(options);
}

export { defaultExtractor, type IdentityServiceOptions };

export type { ReconstructionRunResult, ReconstructionRunnerOptions } from './reconstruction';

// --- Extraction adapters a runtime chooses between --------------------------------------------

export { DeterministicCvExtractor } from './extraction/deterministic-extractor';
export { OpenAiCvExtractor, type OpenAiCvExtractorOptions } from './extraction/openai-extractor';
export {
  ExtractionError,
  type CvExtractor,
  type ExtractionRequest,
  type ExtractionResult,
} from './extraction/port';

// --- Professional source acquisition ------------------------------------------------------------
//
// Not in the domain contract: no domain consumes repository selection, and putting it there would
// be exactly the speculative API the boundary is meant to exclude.

export { HttpGitHubClient, type HttpGitHubClientOptions } from './github/http-client';
export {
  GitHubError,
  type GitHubClient,
  type GitHubCredentials,
  type RepositoryMetadata,
} from './github/port';
export {
  GitHubNotConnectedError,
  RepositoryNotSelectedError,
  GITHUB_CONTENT_TYPE,
  type IngestResult,
} from './github/ingestion';

export type { GitHubConnection, RepositorySelection } from './model';
