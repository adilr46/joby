/**
 * The closed set of Joby events.
 *
 * Adding a name here is a product decision, not a plumbing detail: an event asserts that
 * something meaningful happened to a person. If it is not meaningful outside the module
 * that produced it, it is a function call, not an event.
 *
 * Names are past tense. `EvidenceConfirmed`, never `ConfirmEvidence`.
 */

import type { ModuleName } from './domains';

export const EVENT_NAMES = [
  'IdentityUpdated',
  'CanonicalFactRemoved',
  'IdentityRepresentationRevised',
  'EvidenceConfirmed',
  'OpportunityImported',
  'ApplicationSubmitted',
  'InterviewRecorded',
  'OutcomeObserved',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/**
 * The module responsible for publishing each event. Only the owner publishes;
 * any module may subscribe.
 */
export const EVENT_OWNER: Readonly<Record<EventName, ModuleName>> = {
  IdentityUpdated: 'durable_identity',
  CanonicalFactRemoved: 'durable_identity',
  IdentityRepresentationRevised: 'identity_representation',
  EvidenceConfirmed: 'memory',
  OpportunityImported: 'opportunity',
  ApplicationSubmitted: 'application',
  InterviewRecorded: 'application',
  OutcomeObserved: 'application',
};

export function isEventName(value: string): value is EventName {
  return (EVENT_NAMES as readonly string[]).includes(value);
}
