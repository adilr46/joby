import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import * as durable from '@joby/identity';
import * as representation from '@joby/identity/representation';
const root = process.cwd();

const EXPECTED = {
  durable: [
    'AlreadyConfirmedError',
    'ConcurrencyError',
    'DanglingRelationError',
    'IncompleteReviewError',
    'InvalidCorrectionError',
    'InvalidStatedContextError',
    'NodeNotFoundError',
    'PersonNotFoundError',
    'ProposalNotFoundError',
    'SUPPORTED_CONTENT_TYPES',
    'SourceTooLargeError',
    'USER_CONDITION_KINDS',
    'UnknownProposalItemError',
    'UnsupportedSourceError',
    'createIdentity',
  ],
  representation: [
    'DuplicateRepresentationError',
    'InvalidRepresentationError',
    'InvalidRepresentationReferenceError',
    'RepresentationNotFoundError',
    'createIdentityRepresentation',
  ],
} as const;

async function sourceFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  }));
  return files.flat();
}

function imports(source: string): readonly string[] {
  return [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g)]
    .map((match) => match[1] ?? match[2])
    .filter((value): value is string => value !== undefined);
}

describe('Identity module public boundaries', () => {
  it('pins each first-class public value surface', () => {
    expect(Object.keys(durable).sort()).toEqual([...EXPECTED.durable].sort());
    expect(Object.keys(representation).sort()).toEqual([...EXPECTED.representation].sort());
  });

  it('exports no repository, concrete service, policy, validator or internal algorithm', () => {
    for (const [module, surface] of Object.entries({ durable, representation })) {
      expect(Object.keys(surface).join(' '), module).not.toMatch(
        /Repository|Service|Policy|Validator|validate|classify|projectPermanent|composeAdapted/,
      );
    }
  });

  it('allows cross-module package imports only through declared entry points', async () => {
    const declared = new Set([
      '@joby/identity',
      '@joby/identity/runtime',
      '@joby/identity/testing',
      '@joby/identity/representation',
      '@joby/identity/representation/runtime',
    ]);
    const files = [
      ...(await sourceFiles(join(root, 'apps'))),
      ...(await sourceFiles(join(root, 'packages'))),
    ];

    for (const file of files) {
      for (const specifier of imports(await readFile(file, 'utf8'))) {
        if (!specifier.startsWith('@joby/identity')) continue;
        expect(declared.has(specifier), `${relative(root, file)} imports ${specifier}`).toBe(true);
      }
    }
  });

  // Adaptation used to be checked here too. It now lives in `packages/translation`, so its
  // equivalent rules are in `tests/translation-boundary.test.ts` — and a relative reach into
  // Durable Identity is no longer even spellable from it.
  it('prevents Identity Representation from reaching Durable internals relatively', async () => {
    const moduleRoot = join(root, 'packages', 'identity', 'src', 'representation');
    for (const file of await sourceFiles(moduleRoot)) {
      for (const specifier of imports(await readFile(file, 'utf8'))) {
        expect(
          specifier.startsWith('../'),
          `${relative(root, file)} reaches outside its module through ${specifier}`,
        ).toBe(false);
        if (specifier.startsWith('@joby/identity')) {
          expect(
            specifier === '@joby/identity',
            `${relative(root, file)} uses undeclared provider entry ${specifier}`,
          ).toBe(true);
        }
      }
    }
  });

  it('forbids cross-aggregate referential actions from mutating another owner', async () => {
    const migration = await readFile(
      join(root, 'packages', 'database', 'migrations', '0011_identity_aggregate_boundaries.sql'),
      'utf8',
    );
    expect(migration).toMatch(/DROP CONSTRAINT identity_representation_decision_node_id_fkey/);
    expect(migration).not.toMatch(
      /FOREIGN KEY \(node_id\)[\s\S]*?identity_explicit_node[\s\S]*?ON DELETE CASCADE/i,
    );
    expect(migration).not.toMatch(
      /FOREIGN KEY \(representation_id\)[\s\S]*?ON DELETE SET NULL/i,
    );
    expect(migration).not.toMatch(
      /FOREIGN KEY \(context_id\)[\s\S]*?ON DELETE CASCADE/i,
    );
  });
});
