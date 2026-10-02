/**
 * UC02–UC04 — arranging one opportunity against the person's stated conditions.
 *
 * **Person × world contextual interpretation, and therefore Adaptation's** (ADR 0031). Opportunity
 * owns what the posting *says*; what that means for this person in this moment is contextual, and
 * lives here beside the rest of the temporary state.
 *
 * It compares conditions and nothing else. Whether the person suits the role is not computed here,
 * and there is no score, rank or verdict:
 *
 *     ConstraintConflict ≠ ApplicationBlock
 */

import { USER_CONDITION_KINDS, type UserConditionKind } from '@joby/identity';

import type {
  ConditionComparison,
  ContextIntersection,
  OpportunityContext,
  RetrievedStatedContext,
  UserContext,
} from './model';
import type { OpportunityUnderstandingView } from './ports';

const normalise = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

const readable = (values: readonly string[]): string =>
  values.length <= 1 ? (values[0] ?? '') : `${values.slice(0, -1).join(', ')} or ${values.at(-1)}`;

const KIND_LABELS: Record<UserConditionKind, string> = {
  location: 'Location',
  duration: 'Duration',
  work_arrangement: 'Working arrangement',
  start_date: 'Start date',
  work_authorisation: 'Work authorisation',
  sponsorship: 'Sponsorship',
  availability: 'Availability',
};

/**
 * `RawOpportunity -> C_opportunity`, from Opportunity's attributed understanding.
 *
 * Absent arrays become empty ones for the consumer's convenience; **absent role and company stay
 * absent**, because an empty string would read as a stated blank rather than as "nobody said".
 */
export function arrangeOpportunity(understanding: OpportunityUnderstandingView): OpportunityContext {
  const conditions: Partial<Record<UserConditionKind, readonly string[]>> = {};
  for (const kind of USER_CONDITION_KINDS) {
    const values = understanding.conditions?.[kind]?.filter((value) => value.trim().length > 0);
    if (values?.length) conditions[kind] = values;
  }
  return {
    opportunityId: understanding.opportunityId,
    revision: understanding.revision,
    ...(understanding.role ? { role: understanding.role } : {}),
    ...(understanding.company ? { company: understanding.company } : {}),
    requiredCapabilities: understanding.requiredCapabilities ?? [],
    preferredCapabilities: understanding.preferredCapabilities ?? [],
    responsibilities: understanding.responsibilities ?? [],
    conditions,
    applicationQuestions: understanding.applicationQuestions ?? [],
    attribution: understanding.attribution ?? [],
    uncertainty: understanding.uncertainty ?? [],
  };
}

/** `C_user = Retrieve(UserConditions)` — read from Stated Context, never inferred. */
export function arrangeUser(retrieved: RetrievedStatedContext): UserContext {
  const conditions: Partial<Record<UserConditionKind, readonly string[]>> = {};
  const notes: Partial<Record<UserConditionKind, string>> = {};
  for (const condition of retrieved.stated.conditions ?? []) {
    if (condition.values.length > 0) conditions[condition.kind] = condition.values;
    if (condition.note) notes[condition.kind] = condition.note;
  }
  return {
    personId: retrieved.personId,
    identityRevision: retrieved.identityRevision,
    conditions,
    notes,
    otherConstraints: retrieved.stated.constraints ?? [],
    preferences: retrieved.stated.preferences ?? [],
    ...(retrieved.stated.careerDirection ? { careerDirection: retrieved.stated.careerDirection } : {}),
  };
}

function compare(
  kind: UserConditionKind,
  opportunity: readonly string[] | undefined,
  user: readonly string[] | undefined,
  note: string | undefined,
): ConditionComparison {
  const base = {
    kind,
    ...(opportunity ? { opportunity } : {}),
    ...(user ? { user } : {}),
    ...(note ? { note } : {}),
  };
  const label = KIND_LABELS[kind];

  if (!opportunity && !user) {
    return { ...base, alignment: 'uncertain', summary: `${label}: neither the posting nor you have said.` };
  }
  if (!opportunity) {
    return {
      ...base,
      alignment: 'uncertain',
      summary: `${label}: the posting does not state it. You have said ${readable(user!)}.`,
    };
  }
  if (!user) {
    return {
      ...base,
      alignment: 'neutral',
      summary: `${label}: the posting says ${readable(opportunity)}. You have no condition about it.`,
    };
  }

  // Normalised equality and nothing cleverer. "Greater London" does not silently satisfy "London":
  // a wrong match is invisible to the person it misleads, so a near-miss stays a conflict.
  const held = new Set(user.map(normalise));
  const matched = opportunity.filter((value) => held.has(normalise(value)));
  if (matched.length > 0) return { ...base, alignment: 'aligned', summary: `${label}: ${readable(matched)}.` };
  return {
    ...base,
    alignment: 'conflict',
    summary: `${label}: the posting says ${readable(opportunity)}; you have said ${readable(user)}.`,
  };
}

/** `C_opportunity ∩ C_user`, made legible. Nothing filters, disables, ranks or gates. */
export function intersectContext(
  opportunity: OpportunityContext,
  user: UserContext,
): ContextIntersection {
  const comparisons = USER_CONDITION_KINDS.map((kind) =>
    compare(kind, opportunity.conditions[kind], user.conditions[kind], user.notes[kind]),
  ).filter((item) => item.opportunity !== undefined || item.user !== undefined);

  return {
    aligned: comparisons.filter((item) => item.alignment === 'aligned'),
    conflicts: comparisons.filter((item) => item.alignment === 'conflict'),
    uncertain: comparisons.filter((item) => item.alignment === 'uncertain'),
    neutral: comparisons.filter((item) => item.alignment === 'neutral'),
    postingUncertainty: opportunity.uncertainty,
    otherConstraints: user.otherConstraints,
    blocksApplication: false,
  };
}
