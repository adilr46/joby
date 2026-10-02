/**
 * Repository metadata → candidate Structure, Activity and Relations.
 *
 * Deterministic and deliberately shallow. Metadata is thin evidence, and the temptation with thin
 * evidence is to dress it up: a repository with three commits becoming "built a distributed
 * system", a language list becoming a skill set.
 *
 * The rules here:
 *
 *  - A repository is an **engagement** (Structure). It is not, on its own, evidence that the
 *    person did anything in particular.
 *  - The description is the **contribution**, quoted, never rewritten. No description ⇒ no
 *    activity, because there is nothing to say.
 *  - Languages become **capability**, marked `inferred` — the repository contains that language;
 *    that the person *knows* it is a defensible inference, not an observation.
 *  - Nothing becomes a **consequence**. Stars, forks and watchers describe a repository's
 *    reception, not an outcome the person produced.
 */

import { createHash } from 'node:crypto';

import type {
  ProposedActivity,
  ProposedRelation,
  ProposedStructure,
  ReconstructionProposalContent,
  SourceReference,
} from '../model';
import type { RepositoryMetadata } from './port';

const stableId = (prefix: string, seed: string): string =>
  `${prefix}_${createHash('sha1').update(seed).digest('hex').slice(0, 12)}`;

/**
 * The quote for repository-derived facts is the metadata field it came from, rendered as text.
 *
 * A reviewer needs to see the actual evidence — `description: "..."` — not a claim that GitHub
 * said so.
 */
function reference(sourceId: string, field: string, value: string): SourceReference {
  return { sourceId, quote: `${field}: ${value}` };
}

export function extractFromRepository(
  sourceId: string,
  repository: RepositoryMetadata,
): ReconstructionProposalContent {
  const structure: ProposedStructure[] = [];
  const activities: ProposedActivity[] = [];
  const relations: ProposedRelation[] = [];
  const notes: string[] = [];

  const engagementId = stableId('str', `${sourceId}:${repository.fullName}`);
  structure.push({
    id: engagementId,
    kind: 'engagement',
    // The repository name, normalised for shape only: 'rota-scheduler' → 'rota scheduler'.
    // This is what lets it match a CV project of the same name rather than duplicating it.
    label: humanise(repository.name),
    epistemicStatus: 'observed',
    sources: [reference(sourceId, 'repository', repository.fullName)],
    // `createdAt` is when the repository was created, which is not when the work happened. It is
    // recorded as a start only, never inflated into a range.
    ...(repository.createdAt ? { startedAt: repository.createdAt.slice(0, 10) } : {}),
  });

  if (repository.description) {
    const activityId = stableId('act', `${sourceId}:description`);
    activities.push({
      id: activityId,
      label: humanise(repository.name),
      // Quoted, not paraphrased. The person wrote this description; Joby does not improve it.
      contribution: repository.description,
      epistemicStatus: 'observed',
      sources: [reference(sourceId, 'description', repository.description)],
      // No consequence. Metadata says nothing about what resulted.
    });

    relations.push({
      id: stableId('rel', `${activityId}->${engagementId}`),
      kind: 'occurred_within',
      fromId: activityId,
      toId: engagementId,
      epistemicStatus: 'observed',
      sources: [reference(sourceId, 'repository', repository.fullName)],
    });

    if (repository.languages.length > 0) {
      // Attached to the activity as capability, and marked inferred: the repository contains this
      // language, which is evidence the person used it — not a statement that they did.
      const capabilityId = stableId('act', `${sourceId}:languages`);
      activities.push({
        id: capabilityId,
        label: `Languages used in ${humanise(repository.name)}`,
        capability: [...repository.languages],
        epistemicStatus: 'inferred',
        uncertainty:
          'Derived from the languages GitHub detected in this repository. It shows the code ' +
          'contains them, not how much of it this person wrote.',
        sources: [reference(sourceId, 'languages', repository.languages.join(', '))],
      });

      relations.push({
        id: stableId('rel', `${capabilityId}->${engagementId}`),
        kind: 'uses_capability',
        fromId: engagementId,
        toId: capabilityId,
        epistemicStatus: 'inferred',
        sources: [reference(sourceId, 'languages', repository.languages.join(', '))],
      });
    }
  } else {
    notes.push(
      `'${repository.fullName}' has no description, so nothing was recorded about what was done ` +
        'in it. The repository itself is proposed; what it contains is not.',
    );
  }

  if (repository.isPrivate) {
    notes.push('This repository is private. Anything confirmed from it stays private.');
  }

  return { structure, activities, relations, conflicts: [], ...(notes.length > 0 ? { notes } : {}) };
}

/** Shape normalisation only: separators to spaces. Never a meaning change. */
function humanise(name: string): string {
  return name.replace(/[-_]+/g, ' ').trim();
}
