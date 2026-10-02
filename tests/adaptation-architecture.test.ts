import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { EVENT_NAMES, MODULE_NAMES } from '@joby/events';

const adaptationRoot = join(process.cwd(), 'packages', 'translation', 'src', 'adaptation');

async function sourceFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  }));
  return nested.flat();
}

/**
 * Comments out, code in.
 *
 * These assertions are about what the module *does*. A file may say in prose that it does not rank
 * or that it reads nothing canonical — that is exactly the claim being checked, so it cannot also
 * be the evidence.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function importedSpecifiers(source: string): readonly string[] {
  const imports = source.matchAll(
    /\bfrom\s+['"]([^'"]+)['"]|(?:\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g,
  );
  return [...imports].map((match) => match[1] ?? match[2]).filter((value) => value !== undefined);
}

describe('Adaptation architectural boundary', () => {
  it('is a first-class Joby Core module without inventing an event family', () => {
    expect(MODULE_NAMES).toContain('adaptation');
    expect(EVENT_NAMES.some((name) => name.startsWith('Adaptation') || name.startsWith('Adapted')))
      .toBe(false);
  });

  it('queries only its own table', async () => {
    for (const file of await sourceFiles(adaptationRoot)) {
      const code = stripComments(await readFile(file, 'utf8'));
      const queried = [
        ...code.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN|TRUNCATE)\s+((?:identity|adaptation)_[a-z_]+)/gi),
      ];

      for (const [, table] of queried) {
        // Adaptation owns three tables and reads no Identity table at all. Everything canonical is
        // derived at read time through the reader port, so it never needs to.
        expect(
          ['adaptation_context', 'adaptation_application_input', 'adaptation_representation_draft'],
          `${relative(process.cwd(), file)} queries ${table}`,
        ).toContain(table);
      }
    }
  });

  it('does not score, rank or gate — Module 1 interprets context and nothing else', async () => {
    for (const file of await sourceFiles(adaptationRoot)) {
      if (file.endsWith('.test.ts')) continue;
      const code = stripComments(await readFile(file, 'utf8'));

      // Relationship evaluation belongs to Opportunity (ADR 0029), and a constraint conflict never
      // becomes an application block (ADR 0011 invariant 10). Neither may appear as behaviour here.
      expect(code, `${relative(process.cwd(), file)} looks like scoring or gating`).not.toMatch(
        /\b(fitScore|matchScore|ranking|rankBy|shouldApply|isEligible|blockApplication|recommend\w*)\b/,
      );
    }
  });

  it('does not import adjacent modules or reach into another module, own or sibling', async () => {
    // Translation's two sibling modules are as forbidden as the modules outside Translation. An
    // enclosing boundary is not a shared interior: legacy Intelligence and Execution are reached through
    // their own public entry points or not at all.
    const adjacentModules = new Set([
      '@joby/translation/intelligence',
      '@joby/translation/execution',
      '@joby/opportunity',
      '@joby/application',
      '@joby/portal',
      '@joby/discovery',
      '@joby/memory',
      '@joby/development',
      '@joby/network',
    ]);

    // Adaptation reads a broad Identity snapshot but has no write authority (ADR 0013): the read is
    // wide, the authority is not. Now that Adaptation lives in its own package, the *only* way in is
    // a package specifier, so the rule is expressible as an allow-list rather than a list of
    // internal files to forbid — a relative reach into Durable Identity is no longer spellable.
    //
    // `@joby/identity` itself is deliberately allowed: Adaptation reads Durable Identity through the
    // same public interface Application or Memory would use, which is the point (ADR 0023).
    // `/runtime` and `/representation/runtime` are composition and persistence entry points — write
    // access by another route — so they are not.
    const allowedIdentityEntries = new Set([
      '@joby/identity',
      '@joby/identity/representation',
    ]);

    for (const file of await sourceFiles(adaptationRoot)) {
      const source = await readFile(file, 'utf8');
      for (const specifier of importedSpecifiers(source)) {
        expect(
          adjacentModules.has(specifier),
          `${relative(process.cwd(), file)} imports adjacent module ${specifier}`,
        ).toBe(false);

        if (specifier.startsWith('@joby/identity')) {
          expect(
            allowedIdentityEntries.has(specifier),
            `${relative(process.cwd(), file)} uses undeclared Durable Identity entry ${specifier}`,
          ).toBe(true);
        }

        expect(
          specifier.startsWith('../'),
          `${relative(process.cwd(), file)} reaches outside its module through ${specifier}`,
        ).toBe(false);
      }
    }
  });
});
