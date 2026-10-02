/**
 * What Opportunity understands about the external situation.
 *
 * **No person appears here.** This is one side of the equation: what the opportunity *is*. What it
 * means for a particular person is contextual interpretation, and it belongs to Adaptation
 * (ADR 0031).
 */

/**
 * The comparable conditions an opportunity may state.
 *
 * Deliberately Opportunity's **own** vocabulary rather than an import of Identity's user-condition
 * kinds. The values coincide today, and that is the point: what a posting is permitted to state must
 * not be bounded by what a person is permitted to state about themselves. Adaptation is where the
 * two vocabularies meet, and it is the right place for any future divergence to be handled.
 */
export const OPPORTUNITY_CONDITION_KINDS = [
  'location',
  'duration',
  'work_arrangement',
  'start_date',
  'work_authorisation',
  'sponsorship',
  'availability',
] as const;

export type OpportunityConditionKind = (typeof OPPORTUNITY_CONDITION_KINDS)[number];

/**
 * An attributed reading of one opportunity.
 *
 * Absent fields mean the evidence did not state them — informative, not defective. The gap is named
 * in `uncertainty`, so a consumer can tell "the posting did not say" from "Joby did not look".
 */
export interface OpportunityUnderstanding {
  readonly opportunityId: string;
  readonly revision: number;
  readonly role?: string;
  readonly company?: string;
  readonly requiredCapabilities?: readonly string[];
  readonly preferredCapabilities?: readonly string[];
  readonly responsibilities?: readonly string[];
  readonly conditions?: Partial<Record<OpportunityConditionKind, readonly string[]>>;
  readonly applicationQuestions?: readonly string[];
  readonly attribution?: readonly string[];
  readonly uncertainty?: readonly string[];
}
