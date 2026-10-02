/**
 * Validating interpreter output before it is persisted.
 *
 * Interpreter output is **untrusted input**, exactly as extractor output is. The checks here are not
 * schema hygiene — each blocks a specific way a stored understanding could quietly become a lie:
 *
 *  - an understanding with no attribution cannot be traced back to captured evidence, so nobody can
 *    check it against what the posting actually said;
 *  - attribution naming evidence that is not part of this opportunity is a claim about a source that
 *    was never captured here;
 *  - an empty string in `role` or `company` is absence wearing a value's clothes, and downstream it
 *    reads as a stated blank rather than as "nobody said";
 *  - a condition kind outside the vocabulary silently widens what Joby claims to compare;
 *  - a requirement that is only whitespace asserts nothing while occupying the space where a real
 *    requirement would be.
 *
 * Rejecting is safe: nothing is stored, the evidence survives untouched, and the opportunity stays
 * outstanding so it can be re-read. Persisting a malformed understanding is not — Adaptation would
 * later build a person's application on it.
 */

import { OPPORTUNITY_CONDITION_KINDS, type OpportunityConditionKind } from './model';

import { InterpretationError, type InterpretedUnderstanding } from './interpretation-port';

function fail(message: string): never {
  throw new InterpretationError(`Invalid interpretation output: ${message}`);
}

function checkList(value: unknown, where: string): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) fail(`${where} is not an array`);
  for (const entry of value) {
    if (typeof entry !== 'string') fail(`${where} contains a non-string`);
    if (entry.trim() === '') fail(`${where} contains an empty entry`);
  }
  return value as readonly string[];
}

function checkPresentString(value: unknown, where: string): void {
  if (value === undefined) return;
  if (typeof value !== 'string') fail(`${where} is not a string`);
  // Absent means the evidence did not state it. An empty string means it did state it, as nothing.
  if (value.trim() === '') {
    fail(`${where} is an empty string; omit it instead so absence stays absent`);
  }
}

/**
 * Check an interpretation against the evidence it claims to have read.
 *
 * `evidenceIds` is the set actually supplied to the interpreter. Attribution must reference only
 * those — an interpreter citing something else has either hallucinated a source or read one it was
 * not given, and both are reasons to store nothing.
 */
/**
 * The complete set of keys an understanding may carry.
 *
 * A whitelist rather than a blocklist, because the risks are the fields nobody thought of. Two in
 * particular: an interpreter echoing the posting text back would put a second copy of the raw
 * evidence inside the interpreted store and dissolve the separation the table namespaces exist to
 * hold; and a `personId` would put person-state into a store whose migration promises none. Neither
 * should be prevented by a comment.
 */
const ALLOWED_KEYS = new Set([
  'role',
  'company',
  'requiredCapabilities',
  'preferredCapabilities',
  'responsibilities',
  'conditions',
  'applicationQuestions',
  'attribution',
  'uncertainty',
]);

export function validateUnderstanding(
  understanding: InterpretedUnderstanding,
  evidenceIds: readonly string[],
): InterpretedUnderstanding {
  if (typeof understanding !== 'object' || understanding === null) {
    fail('understanding is not an object');
  }

  for (const key of Object.keys(understanding)) {
    if (!ALLOWED_KEYS.has(key)) {
      fail(
        `'${key}' is not part of an opportunity understanding. This store holds what the ` +
          'opportunity is, not raw evidence and not anything about a person.',
      );
    }
  }

  checkPresentString(understanding.role, 'role');
  checkPresentString(understanding.company, 'company');

  checkList(understanding.requiredCapabilities, 'requiredCapabilities');
  checkList(understanding.preferredCapabilities, 'preferredCapabilities');
  checkList(understanding.responsibilities, 'responsibilities');
  checkList(understanding.applicationQuestions, 'applicationQuestions');
  checkList(understanding.uncertainty, 'uncertainty');

  const attribution = checkList(understanding.attribution, 'attribution');
  if (!attribution || attribution.length === 0) {
    fail('attribution is empty; an understanding nobody can trace is not storable');
  }

  // **Every entry must cite evidence this opportunity actually holds.**
  //
  // This is the check that makes "every generated claim traces back to evidence" true rather than
  // merely intended. Requiring only *some* bracket somewhere would let an interpreter write
  // `attribution: ['inferred from what I know about this employer']` and have a wholly fabricated
  // role, company and requirement list validate — which is precisely the failure a model-backed
  // interpreter makes and the deterministic one never would.
  //
  // The id is read from a **fixed leading position**, so free text later in the entry — a source
  // named "LinkedIn [saved]", a URI containing brackets — can never be mistaken for a citation.
  const known = new Set(evidenceIds);
  for (const entry of attribution) {
    const cited = /^\[([^\]]+)\]/.exec(entry)?.[1];
    if (cited === undefined) {
      fail(`attribution entry '${entry}' cites no evidence; it must begin with '[evidenceId]'`);
    }
    if (!known.has(cited)) {
      fail(`attribution cites evidence '${cited}' which is not part of this opportunity`);
    }
  }

  if (understanding.conditions !== undefined) {
    if (typeof understanding.conditions !== 'object' || understanding.conditions === null) {
      fail('conditions is not an object');
    }
    for (const [kind, values] of Object.entries(understanding.conditions)) {
      if (!(OPPORTUNITY_CONDITION_KINDS as readonly string[]).includes(kind)) {
        fail(`'${kind}' is not a comparable condition kind`);
      }
      const list = checkList(values, `conditions.${kind}`);
      if (!list || list.length === 0) {
        fail(`conditions.${kind} is empty; omit the kind instead of stating nothing for it`);
      }
    }
  }

  return understanding;
}

