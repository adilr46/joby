/**
 * The **Translation** boundary.
 *
 * Translation owns immediate contextual action: Adaptation, Execution and (when built) Interview
 * Intelligence. Opportunity is **upstream of it**, not inside it — the understanding partition that
 * used to live here now sits in `@joby/opportunity` where it always semantically belonged
 * (ADR 0031). The grouping is not a service, deployment or facade.
 *
 * That makes this file structural on purpose. It asserts the shape of the boundary, because a
 * boundary that is only a convention erodes one convenient import at a time and nothing fails when
 * it does. The *behaviour* inside Adaptation is asserted by its own suites, which this change did
 * not touch.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import * as adaptation from '@joby/translation/adaptation';
import * as execution from '@joby/translation/execution';
import * as interview from '@joby/translation/interview';

const root = process.cwd();
const translationRoot = join(root, 'packages', 'translation', 'src');

const MODULES = ['adaptation', 'execution', 'interview'] as const;

/** The declared entry points of `@joby/translation`. Deliberately no `.`. */
const DECLARED_ENTRIES = new Set([
  '@joby/translation/adaptation',
  '@joby/translation/interview',
  '@joby/translation/execution',
  '@joby/translation/testing',
]);

async function sourceFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  }));
  return files.flat();
}

function imports(source: string): readonly string[] {
  return [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g)]
    .map((match) => match[1] ?? match[2])
    .filter((value): value is string => value !== undefined);
}

describe('the Translation boundary', () => {
  it('contains exactly three modules, each with its own entry point', async () => {
    const manifest = JSON.parse(
      await readFile(join(root, 'packages', 'translation', 'package.json'), 'utf8'),
    ) as { exports: Record<string, string> };

    const directories = (await readdir(translationRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(directories).toEqual([...MODULES]);

    for (const module of MODULES) {
      expect(manifest.exports[`./${module}`]).toBe(`./src/${module}/index.ts`);
    }
  });

  it('is not a facade: the boundary itself has no root export', async () => {
    const manifest = JSON.parse(
      await readFile(join(root, 'packages', 'translation', 'package.json'), 'utf8'),
    ) as { exports: Record<string, string> };

    // A root export would let a consumer import "Translation" and reach whichever module happened
    // to be re-exported, which is the boundary dissolving rather than holding.
    expect(Object.keys(manifest.exports)).not.toContain('.');
    expect(Object.keys(manifest.exports).sort()).toEqual(
      ['./adaptation', './execution', './interview', './testing'].sort(),
    );
  });

  it('pins each module surface so growth stays a decision rather than drift', () => {
    // Execution now exposes the composition-root pieces for browser orchestration: the recursive
    // loop remains semantic, while the automation runner and Joby query adapter wire the missing
    // production seams without importing upstream modules directly.
    expect(Object.keys(execution).sort()).toEqual([
      'BrowserApplicationAutomationRunner',
      'ClaudeSurfaceInterpreter',
      'CompositeJobyQueryPort',
      'DeterministicJobyQueryPort',
      'DeterministicPortalActionExecutor',
      'DeterministicSurfaceInterpreter',
      'EXECUTION_LEVELS',
      'RequirementNotFoundError',
      'SURFACE_REQUIREMENT_KINDS',
      'SessionAlreadySubmittedError',
      'SessionNotFoundError',
      'SurfaceInterpretationError',
      'buildActionPlan',
      'buildExecutionSurface',
      'createApplicationAutomationRunner',
      'createApplicationSessionModule',
      'createSurfaceExecutionModule',
      'createSurfaceInspectionModule',
      'createSurfaceLoopModule',
      'createSurfaceResolutionModule',
      'deriveSubmissionReadiness',
    ]);
    expect(Object.keys(interview).sort()).toEqual([
      'InterviewContextError',
      'InterviewIntelligence',
      'createDebriefDraft',
      'createInterviewIntelligence',
      'parseInterviewInvite',
    ]);
  });

  it('holds no opportunity interpretation of its own', async () => {
    // Opportunity owns understanding. A parser, interpreter or evidence store reappearing inside
    // Translation would be the duplication ADR 0031 removed, arriving back one file at a time.
    for (const module of MODULES) {
      for (const file of await sourceFiles(join(translationRoot, module))) {
        const code = (await readFile(file, 'utf8'))
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*$/gm, '');
        expect(code, `${file} looks like opportunity interpretation`).not.toMatch(
          /(OpportunityInterpreter|interpretEvidence|opportunity_evidence|intelligence_opportunity)/,
        );
      }
    }
  });

  it('exposes Adaptation unchanged by the move', () => {
    expect(Object.keys(adaptation).sort()).toEqual([
      'AdaptationConcurrencyError',
      'AdaptationContextNotFoundError',
      'CvRenderPlanError',
      'InvalidAdaptationContextError',
      'OpportunityNotUnderstoodError',
      'WritingError',
      'applyLatexTexPatches',
      'buildCvRenderPlan',
      'createAdaptation',
      'escapeLatexText',
      'extractLatexTexContent',
      'resolveLatexTexSource',
      'toGeneratedLatexPayload',
      'toHtmlPdfPayload',
      'toLatexTexPatchManifest',
    ]);
  });

  it('lets no sibling module import another sibling, even inside the boundary', async () => {
    // A grouping is not a shared interior. Each module keeps its own imports and write paths.
    for (const module of MODULES) {
      for (const file of await sourceFiles(join(translationRoot, module))) {
        for (const specifier of imports(await readFile(file, 'utf8'))) {
          expect(
            specifier.startsWith('../'),
            `${relative(root, file)} reaches outside its module through ${specifier}`,
          ).toBe(false);
          if (specifier.startsWith('@joby/translation')) {
            expect(
              specifier,
              `${relative(root, file)} imports sibling module ${specifier}`,
            ).toBe(`@joby/translation/${module}`);
          }
        }
      }
    }
  });

  it('allows consumers in only through declared entry points', async () => {
    const files = [
      ...(await sourceFiles(join(root, 'apps'))),
      ...(await sourceFiles(join(root, 'packages'))),
      ...(await sourceFiles(join(root, 'tests'))),
    ];

    for (const file of files) {
      for (const specifier of imports(await readFile(file, 'utf8'))) {
        if (!specifier.startsWith('@joby/translation')) continue;
        expect(
          DECLARED_ENTRIES.has(specifier),
          `${relative(root, file)} imports ${specifier}`,
        ).toBe(true);
      }
    }
  });

  it('leaves Durable Identity with no dependency on Translation', async () => {
    // Translation reads Identity. Identity must not learn about Translation in return: that edge
    // would put `Identity -> Adaptation -> Identity` on the package graph.
    for (const file of await sourceFiles(join(root, 'packages', 'identity', 'src'))) {
      for (const specifier of imports(await readFile(file, 'utf8'))) {
        expect(
          specifier.startsWith('@joby/translation'),
          `${relative(root, file)} imports ${specifier}`,
        ).toBe(false);
      }
    }
  });

  it('introduces no new module event vocabulary for the seams', async () => {
    // Type-only information seams and pure mapping create no state change worth an event.
    const { MODULE_NAMES } = await import('@joby/events');
    expect(MODULE_NAMES).toContain('adaptation');
    expect(MODULE_NAMES as readonly string[]).not.toContain('intelligence');
    expect(MODULE_NAMES as readonly string[]).not.toContain('execution');
    expect(MODULE_NAMES as readonly string[]).not.toContain('translation');
  });
});
