import { SocialService, type SocialDependencies } from './service';
export const createSocial = (dependencies: SocialDependencies) => new SocialService(dependencies);
export type SocialModule = SocialService;
export type { SocialDependencies } from './service';
export { deriveSignals, cohortIdentity, cohortLadder, SocialInputError, SocialNotFoundError } from './model';
export type { Cohort, Signal, CohortCandidate } from './model';
export type { FeedFilter } from './service';
