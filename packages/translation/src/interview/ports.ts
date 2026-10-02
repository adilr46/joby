/**
 * The four reads Interview Intelligence needs, and the authority behind each.
 *
 * Consumer-side views, declared locally so this module depends on no other package. Every one is a
 * read: there is no write here to call, which is how "Interview Intelligence owns nothing" survives
 * contact with a future implementation.
 */

/** Opportunity → what the situation is. Structured understanding, never posting text. */
export interface InterviewOpportunityReader {
  getUnderstanding(opportunityId: string): Promise<
    | {
        readonly opportunityId: string;
        readonly revision: number;
        readonly role?: string;
        readonly company?: string;
        readonly requiredCapabilities?: readonly string[];
        readonly applicationQuestions?: readonly string[];
      }
    | undefined
  >;
}

/**
 * Application → where this actually is.
 *
 * **Read, never inferred.** Guessing that someone has reached a second-round interview, and
 * preparing them for it, is worse than not knowing.
 */
export interface InterviewApplicationReader {
  getCurrentStage(applicationId: string): Promise<
    | {
        readonly applicationId: string;
        readonly personId: string;
        readonly opportunityId: string;
        /** Application's own vocabulary, carried verbatim. Translation does not define it. */
        readonly stage: string;
      }
    | undefined
  >;
}

/** Identity → professional evidence, as Profile Units, retrieved selectively. */
export interface InterviewEvidenceReader {
  getProfileUnits(personId: string): Promise<
    | {
        readonly revision: number;
        readonly units: readonly {
          readonly nodeId: string;
          readonly title: string;
          readonly contribution?: string;
          readonly capabilities: readonly string[];
          readonly consequence?: string;
        }[];
      }
    | undefined
  >;
}

/** PCI → learned priors. Hints, never authority, and absent until PCI exists. */
export interface InterviewPriorSource {
  prepareHints(input: {
    readonly personId: string;
    readonly opportunityId: string;
  }): Promise<readonly string[]>;
}
