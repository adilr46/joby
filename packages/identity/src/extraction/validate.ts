/**
 * Validating extractor output before it is persisted, even as a proposal.
 *
 * Model output is untrusted input. The checks here are not schema hygiene — each one blocks a
 * specific way a proposal could quietly become a lie:
 *
 *  - an item with no source reference cannot be reviewed, because the person cannot check it;
 *  - an activity with none of contribution/capability/consequence asserts nothing;
 *  - a relation pointing at an item that does not exist is a claim about a connection that was
 *    never proposed;
 *  - a relation kind outside the vocabulary silently widens the ontology.
 *
 * Rejecting is safe: the job fails, the source survives, and it can be retried. Persisting a
 * malformed proposal is not — a reviewer would be asked to confirm something nobody can trace.
 */

import {
  RELATION_KINDS,
  type EpistemicStatus,
  type ProposedActivity,
  type ProposedConflict,
  type ProposedRelation,
  type ProposedStructure,
  type ReconstructionProposalContent,
  type RelationKind,
  type SourceReference,
} from '../model';
import { ExtractionError } from './port';

const EPISTEMIC: readonly EpistemicStatus[] = ['observed', 'inferred', 'hypothesized'];
const STRUCTURE_KINDS = ['institution', 'organisation', 'programme', 'role', 'engagement', 'team', 'period'];

function fail(message: string): never {
  throw new ExtractionError(`Invalid extraction output: ${message}`);
}

function asRecord(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${where} is not an object`);
  return value as Record<string, unknown>;
}

function asArray(value: unknown, where: string): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(`${where} is not an array`);
  return value;
}

function requireString(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(`${where} is missing or empty`);
  return value;
}

function optionalString(value: unknown, where: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') fail(`${where} is not a string`);
  const trimmed = value.trim();
  // An empty string is absence wearing a value's clothes; keep absence absent.
  return trimmed === '' ? undefined : value;
}

function epistemicStatus(value: unknown, where: string): EpistemicStatus {
  const status = requireString(value, `${where}.epistemicStatus`);
  if (!EPISTEMIC.includes(status as EpistemicStatus)) fail(`${where}.epistemicStatus is '${status}'`);
  return status as EpistemicStatus;
}

function sourceReferences(value: unknown, where: string, sourceId: string): SourceReference[] {
  const raw = asArray(value, `${where}.sources`);
  if (raw.length === 0) fail(`${where} has no source reference — an unciteable proposal cannot be reviewed`);

  return raw.map((entry, index) => {
    const record = asRecord(entry, `${where}.sources[${index}]`);
    // An extractor citing a different source than the one it was given is confused about what it
    // read; trusting the id would attach this fact to the wrong document.
    const claimed = optionalString(record.sourceId, `${where}.sources[${index}].sourceId`);
    if (claimed !== undefined && claimed !== sourceId) {
      fail(`${where}.sources[${index}] cites '${claimed}', not the source being extracted`);
    }

    const reference: SourceReference = {
      sourceId,
      quote: requireString(record.quote, `${where}.sources[${index}].quote`),
      ...numericRange(record, `${where}.sources[${index}]`),
    };
    return reference;
  });
}

function numericRange(
  record: Record<string, unknown>,
  where: string,
): { startOffset?: number; endOffset?: number } {
  const start = record.startOffset;
  const end = record.endOffset;
  if (typeof start !== 'number' || typeof end !== 'number') return {};
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
    fail(`${where} has an invalid character range`);
  }
  return { startOffset: start, endOffset: end };
}

/**
 * Parse and validate a model response into a proposal.
 *
 * `sourceId` is supplied by the caller and always wins over anything the model says.
 */
export function parseProposalContent(raw: unknown, sourceId: string): ReconstructionProposalContent {
  const root = asRecord(raw, 'proposal');
  const ids = new Set<string>();

  function claimId(value: unknown, where: string): string {
    const id = requireString(value, `${where}.id`);
    if (ids.has(id)) fail(`duplicate item id '${id}'`);
    ids.add(id);
    return id;
  }

  const structure: ProposedStructure[] = asArray(root.structure, 'proposal.structure').map((entry, i) => {
    const where = `proposal.structure[${i}]`;
    const record = asRecord(entry, where);
    const kind = requireString(record.kind, `${where}.kind`);
    if (!STRUCTURE_KINDS.includes(kind)) fail(`${where}.kind is '${kind}'`);

    return {
      id: claimId(record.id, where),
      kind: kind as ProposedStructure['kind'],
      label: requireString(record.label, `${where}.label`),
      epistemicStatus: epistemicStatus(record.epistemicStatus, where),
      sources: sourceReferences(record.sources, where, sourceId),
      ...optional('startedAt', optionalString(record.startedAt, `${where}.startedAt`)),
      ...optional('endedAt', optionalString(record.endedAt, `${where}.endedAt`)),
      ...optional('uncertainty', optionalString(record.uncertainty, `${where}.uncertainty`)),
    };
  });

  const activities: ProposedActivity[] = asArray(root.activities, 'proposal.activities').map((entry, i) => {
    const where = `proposal.activities[${i}]`;
    const record = asRecord(entry, where);

    const contribution = optionalString(record.contribution, `${where}.contribution`);
    const consequence = optionalString(record.consequence, `${where}.consequence`);
    const capability = asArray(record.capability, `${where}.capability`)
      .map((c, j) => requireString(c, `${where}.capability[${j}]`))
      .filter((c) => c.trim() !== '');

    // Sparse is valid; empty is not. An activity asserting none of the three says nothing about
    // the person, and is the shape a model returns when it is padding.
    if (contribution === undefined && consequence === undefined && capability.length === 0) {
      fail(`${where} has no contribution, capability or consequence`);
    }

    return {
      id: claimId(record.id, where),
      label: requireString(record.label, `${where}.label`),
      epistemicStatus: epistemicStatus(record.epistemicStatus, where),
      sources: sourceReferences(record.sources, where, sourceId),
      // Absent components stay absent. Nothing here fills one in from the others.
      ...optional('contribution', contribution),
      ...optional('consequence', consequence),
      ...(capability.length > 0 ? { capability } : {}),
      ...optional('uncertainty', optionalString(record.uncertainty, `${where}.uncertainty`)),
    };
  });

  const relations: ProposedRelation[] = asArray(root.relations, 'proposal.relations').map((entry, i) => {
    const where = `proposal.relations[${i}]`;
    const record = asRecord(entry, where);
    const kind = requireString(record.kind, `${where}.kind`);
    if (!(RELATION_KINDS as readonly string[]).includes(kind)) {
      fail(`${where}.kind is '${kind}' — outside the relation vocabulary`);
    }

    return {
      id: claimId(record.id, where),
      kind: kind as RelationKind,
      fromId: requireString(record.fromId, `${where}.fromId`),
      toId: requireString(record.toId, `${where}.toId`),
      epistemicStatus: epistemicStatus(record.epistemicStatus, where),
      sources: sourceReferences(record.sources, where, sourceId),
      ...optional('uncertainty', optionalString(record.uncertainty, `${where}.uncertainty`)),
    };
  });

  const conflicts: ProposedConflict[] = asArray(root.conflicts, 'proposal.conflicts').map((entry, i) => {
    const where = `proposal.conflicts[${i}]`;
    const record = asRecord(entry, where);
    return {
      id: claimId(record.id, where),
      description: requireString(record.description, `${where}.description`),
      itemIds: asArray(record.itemIds, `${where}.itemIds`).map((id, j) =>
        requireString(id, `${where}.itemIds[${j}]`),
      ),
      sources: sourceReferences(record.sources, where, sourceId),
    };
  });

  // Endpoints must exist. A relation to a phantom item is a proposed connection that was never
  // proposed, and it would survive review as an invisible edge.
  const nodeIds = new Set([...structure.map((s) => s.id), ...activities.map((a) => a.id)]);
  for (const relation of relations) {
    for (const endpoint of [relation.fromId, relation.toId]) {
      if (!nodeIds.has(endpoint)) fail(`relation '${relation.id}' points at unknown item '${endpoint}'`);
    }
  }
  for (const conflict of conflicts) {
    for (const itemId of conflict.itemIds) {
      if (!ids.has(itemId)) fail(`conflict '${conflict.id}' references unknown item '${itemId}'`);
    }
  }

  const notes = asArray(root.notes, 'proposal.notes').map((n, i) => requireString(n, `proposal.notes[${i}]`));

  return { structure, activities, relations, conflicts, ...(notes.length > 0 ? { notes } : {}) };
}

function optional<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}
