/**
 * Identity Representation — persistent, reusable, non-canonical projections (ADR 0014).
 *
 *   V_i = P_i(E_t)
 *
 * The whole risk in this feature is one thing: a persistent object that looks like a profile
 * quietly becoming a second copy of the person. So most of this file does not test that creating
 * and reading works — it tests that the representation **cannot** hold facts, **cannot** drift from
 * canonical Explicit State, and **cannot** write to it.
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '@joby/database';
import { createIdentity, type DurableIdentityModule } from '@joby/identity';
import {
  createIdentityRepresentation,
  type IdentityRepresentationModule,
} from '@joby/identity/representation';
import * as contractSurface from '@joby/identity/representation';
import {
  createCanonicalFactRemovedHandler,
  createIdentityRepresentationRuntime,
  type IdentityRepresentationRuntime,
} from '@joby/identity/representation/runtime';
import { createIdentityRuntime, DeterministicCvExtractor } from '@joby/identity/runtime';

import { connectTestDatabase, hasDatabase, truncateAll, truncateIdentity } from './support/database';
import { combineIdentityModules, type TestIdentityModules } from './support/identity-modules';

const representationRoot = join(process.cwd(), 'packages', 'identity', 'src', 'representation');

const describeIntegration = hasDatabase ? describe : (describe.skip.bind(null) as typeof describe);

if (!hasDatabase) {
  console.warn('\n[tests] SKIPPING Identity Representation integration tests: DATABASE_URL is not set.\n');
}

async function sourceFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return entry.name.endsWith('.ts') ? [path] : [];
    }),
  );
  return nested.flat();
}

function importedSpecifiers(source: string): readonly string[] {
  const imports = source.matchAll(
    /\bfrom\s+['"]([^'"]+)['"]|(?:\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g,
  );
  return [...imports].map((match) => match[1] ?? match[2]).filter((value) => value !== undefined);
}

describe('the Identity Representation module boundary', () => {
  it('cannot reach Durable Identity write internals or an adjacent domain', async () => {
    // Non-canonical state reads canonical state through a narrow read port, the same rule ADR 0012
    // sets for Adaptation. Holding a write repository would make "writes nothing canonical" a
    // promise rather than a property.
    const identityRoot = join(process.cwd(), 'packages', 'identity', 'src');
    const forbiddenIdentityModules = new Set(
      [
        'service',
        'factory',
        'runtime',
        'repository',
        'explicit-state-repository',
        'review',
        'correction',
        'source-capture',
        'reconstruction',
        join('github', 'ingestion'),
      ].map((module) => join(identityRoot, module)),
    );
    const adjacentDomains = new Set([
      '@joby/intelligence',
      '@joby/execution',
      '@joby/discovery',
      '@joby/memory',
      '@joby/development',
      '@joby/network',
    ]);

    for (const file of await sourceFiles(representationRoot)) {
      const source = await readFile(file, 'utf8');
      for (const specifier of importedSpecifiers(source)) {
        expect(
          adjacentDomains.has(specifier),
          `${relative(process.cwd(), file)} imports adjacent domain ${specifier}`,
        ).toBe(false);

        if (specifier.startsWith('.')) {
          const importedModule = resolve(dirname(file), specifier).replace(/\.ts$/, '');
          expect(
            forbiddenIdentityModules.has(importedModule),
            `${relative(process.cwd(), file)} imports Durable Identity write surface ${specifier}`,
          ).toBe(false);
        }
      }
    }
  });

  it('names only its own tables', async () => {
    // Canonical ownership is answered through Durable Identity's stable-ID capability.
    const allowed = new Set([
      'identity_representation',
      'identity_representation_decision',
      'identity_representation_theme',
      'identity_representation_reference',
    ]);

    for (const file of await sourceFiles(representationRoot)) {
      const source = await readFile(file, 'utf8');
      for (const table of new Set([...source.matchAll(/identity_[a-z_]+/g)].map((m) => m[0]))) {
        expect(allowed.has(table!), `${relative(process.cwd(), file)} names ${table}`).toBe(true);
      }
    }
  });

  it('never writes a canonical table', async () => {
    for (const file of await sourceFiles(representationRoot)) {
      const source = await readFile(file, 'utf8');
      // The ownership check is the only canonical statement, and it is a SELECT.
      expect(source, `${relative(process.cwd(), file)} writes canonical state`).not.toMatch(
        /(INSERT INTO|UPDATE|DELETE FROM)\s+identity_(explicit_node|relation|provenance|durable_identity|correction|review)/i,
      );
    }
  });
});

describeIntegration('Identity Representation', () => {
  let db: Database;
  let identity: TestIdentityModules;
  let durable: DurableIdentityModule;
  let representations: IdentityRepresentationModule;
  /**
   * The same service composed from `/runtime`.
   *
   * CV rendering lives there rather than on the domain contract: its only consumer is the HTTP
   * surface, and the PDF toolchain is a composition choice like the model adapters (ADR 0016).
   */
  let runtime: IdentityRepresentationRuntime;

  const CV = [
    'Education',
    'University of Bristol, 2022 - 2026',
    '- Studied compilers',
    '',
    'Projects',
    'Rota scheduler',
    '- Wrote a constraint solver for shift allocation',
  ].join('\n');

  beforeAll(async () => {
    db = await connectTestDatabase();
  });

  afterAll(async () => {
    await db?.close();
  });

  beforeEach(async () => {
    await truncateIdentity(db);
    await truncateAll(db);
    durable = createIdentity(db, { extractor: new DeterministicCvExtractor() });
    representations = createIdentityRepresentation(db, durable);
    identity = combineIdentityModules(durable, representations);
    runtime = createIdentityRepresentationRuntime({ db, identity: durable });
  });

  /** A person with confirmed canonical Explicit State to project. */
  async function establishIdentity(): Promise<string> {
    const { personId } = await identity.captureSource({
      contentType: 'text/plain',
      content: Buffer.from(CV, 'utf8'),
    });

    await createIdentityRuntime({ db, extractor: new DeterministicCvExtractor() }).runReconstruction();

    const proposal = (await identity.listProposals(personId))[0]!;
    await identity.confirmReview({
      proposalId: proposal.id,
      expectedRevision: 0,
      decisions: [
        ...proposal.content.structure,
        ...proposal.content.activities,
        ...proposal.content.relations,
      ].map((item) => ({ itemId: item.id, decision: 'retain' as const })),
      confirmedBy: 'user-1',
    });
    return personId;
  }

  describe('creating and retrieving a named lens', () => {
    it('creates one, lists it, and reads it back grounded in Durable Identity', async () => {
      const personId = await establishIdentity();

      const created = await identity.createRepresentation({
        personId,
        name: 'Markets',
        purpose: 'Sales & trading placements — quantitative and fast-paced.',
        createdBy: 'user-1',
      });

      expect(created.name).toBe('Markets');
      expect(created.purpose).toContain('trading');
      expect(await identity.listRepresentations(personId)).toHaveLength(1);

      const view = (await identity.getRepresentation(created.id))!;
      expect(view.representation.id).toBe(created.id);

      // Lineage: which identity, at which revision. Not a copy of it.
      const durable = (await identity.getDurableIdentity(personId))!;
      expect(view.derivedFrom.durableIdentityId).toBe(durable.durableIdentityId);
      expect(view.derivedFrom.identityRevision).toBe(durable.explicit.revision);

      // Content is the person's actual confirmed history.
      expect(view.projection.education.map((entry) => entry.title)).toContain('University of Bristol');
    });

    it('keeps a purpose optional and absent rather than empty', async () => {
      const personId = await establishIdentity();
      const created = await identity.createRepresentation({
        personId,
        name: 'Software Engineering',
        createdBy: 'user-1',
      });

      expect(created).not.toHaveProperty('purpose');
      expect((await identity.getRepresentation(created.id))!.representation).not.toHaveProperty(
        'purpose',
      );
    });

    it('holds several independent lenses over one identity', async () => {
      const personId = await establishIdentity();
      await identity.createRepresentation({ personId, name: 'Markets', createdBy: 'user-1' });
      await identity.createRepresentation({
        personId,
        name: 'Investment Banking',
        createdBy: 'user-1',
      });

      const names = (await identity.listRepresentations(personId)).map((r) => r.name);
      expect(names).toEqual(['Markets', 'Investment Banking']);
    });

    it('refuses a second lens with the same name, and a nameless one', async () => {
      const personId = await establishIdentity();
      await identity.createRepresentation({ personId, name: 'Markets', createdBy: 'user-1' });

      // Two "Markets" the person would have no way to tell apart later.
      await expect(
        identity.createRepresentation({ personId, name: '  markets ', createdBy: 'user-1' }),
      ).rejects.toThrow(/already has an Identity Representation/i);

      await expect(
        identity.createRepresentation({ personId, name: '   ', createdBy: 'user-1' }),
      ).rejects.toThrow(/needs a name/i);
    });

    it('will not create a lens over an identity that does not exist', async () => {
      await expect(
        identity.createRepresentation({ personId: 'nobody', name: 'Markets', createdBy: 'user-1' }),
      ).rejects.toThrow(/No Identity Representation 'nobody'/);
    });
  });

  describe('persistent, but not a second source of truth', () => {
    it('follows a correction to Explicit State with no write of its own', async () => {
      const personId = await establishIdentity();
      const created = await identity.createRepresentation({
        personId,
        name: 'Markets',
        createdBy: 'user-1',
      });

      const before = (await identity.getRepresentation(created.id))!;
      expect(before.projection.education.map((e) => e.title)).toContain('University of Bristol');

      const node = (await identity.getExplicitState(personId))!.reconstructed.structure.find(
        (s) => s.label === 'University of Bristol',
      )!;
      await identity.correctNode({
        nodeId: node.id,
        expectedRevision: node.revision,
        correctedBy: 'user-1',
        changes: { label: 'University of Bath' },
      });

      const after = (await identity.getRepresentation(created.id))!;
      // Nothing refreshed, invalidated or synchronised this — it is a query, so it simply changed.
      expect(after.projection.education.map((e) => e.title)).toContain('University of Bath');
      expect(after.projection.education.map((e) => e.title)).not.toContain('University of Bristol');
      // …and the lineage moved with it.
      expect(after.derivedFrom.identityRevision).toBeGreaterThan(before.derivedFrom.identityRevision);
      // The stored lens itself did not change: the person's choice is not a fact about them.
      expect(after.representation.revision).toBe(before.representation.revision);
    });

    it('empties when the facts behind it are removed', async () => {
      const personId = await establishIdentity();
      const created = await identity.createRepresentation({
        personId,
        name: 'Markets',
        createdBy: 'user-1',
      });

      const state = (await identity.getExplicitState(personId))!;
      for (const node of [...state.reconstructed.structure, ...state.reconstructed.activities]) {
        const current = await identity.getNode(node.id);
        if (!current) continue; // already cascaded away with its structure
        await identity.removeNode({
          nodeId: node.id,
          expectedRevision: current.revision,
          correctedBy: 'user-1',
        });
      }

      const view = (await identity.getRepresentation(created.id))!;
      // A stored snapshot would still be showing this person's education here.
      expect(view.projection.education).toHaveLength(0);
      expect(view.projection.projects).toHaveLength(0);
      expect(view.projection.skills).toHaveLength(0);
      // The lens survives; it just has nothing to project.
      expect(view.representation.name).toBe('Markets');
    });

    it('shows two lenses the same corrected fact — one factual authority, not two', async () => {
      const personId = await establishIdentity();
      const markets = await identity.createRepresentation({
        personId,
        name: 'Markets',
        createdBy: 'user-1',
      });
      const engineering = await identity.createRepresentation({
        personId,
        name: 'Software Engineering',
        createdBy: 'user-1',
      });

      const node = (await identity.getExplicitState(personId))!.reconstructed.structure.find(
        (s) => s.label === 'University of Bristol',
      )!;
      await identity.correctNode({
        nodeId: node.id,
        expectedRevision: node.revision,
        correctedBy: 'user-1',
        changes: { label: 'University of Bath' },
      });

      for (const id of [markets.id, engineering.id]) {
        const view = (await identity.getRepresentation(id))!;
        expect(view.projection.education.map((e) => e.title)).toContain('University of Bath');
      }
    });
  });

  describe('non-canonical: creating and reading changes nothing about the person', () => {
    it('does not move Explicit State, write a correction, or publish an event', async () => {
      const personId = await establishIdentity();
      const before = (await identity.getExplicitState(personId))!;
      const outboxBefore = await db.query<{ count: string }>('SELECT count(*) FROM event_outbox');

      const created = await identity.createRepresentation({
        personId,
        name: 'Markets',
        purpose: 'Sales & trading.',
        createdBy: 'user-1',
      });
      await identity.getRepresentation(created.id);
      await identity.listRepresentations(personId);

      const after = (await identity.getExplicitState(personId))!;
      expect(after.revision).toBe(before.revision);
      expect(after.reconstructed).toEqual(before.reconstructed);
      // X is user-authored only; a lens is not a statement of career direction.
      expect(after.stated).toEqual({});

      const outboxAfter = await db.query<{ count: string }>('SELECT count(*) FROM event_outbox');
      // `IdentityUpdated` means a confirmed change to canonical Explicit State. Nothing else.
      expect(outboxAfter.rows[0]!.count).toBe(outboxBefore.rows[0]!.count);

      const corrections = await db.query('SELECT id FROM identity_correction WHERE person_id = $1', [
        personId,
      ]);
      expect(corrections.rowCount).toBe(0);
    });

    it('leaves Learned State untouched and unreachable', async () => {
      const personId = await establishIdentity();
      await identity.createRepresentation({ personId, name: 'Markets', createdBy: 'user-1' });

      // PCI changes only through the Slower Learning Loop. A lens is not evidence about the person.
      // A lens is not evidence about the person, and Durable Identity holds no PCI to change:
      // learned relational state is Memory / PCI's own authority (ADR 0030).
      expect('learned' in (await identity.getDurableIdentity(personId))!).toBe(false);
    });
  });

  describe('the stored row is a lens, never a fact', () => {
    it('has no column that could hold professional content', async () => {
      const { rows } = await db.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'identity_representation'
          ORDER BY column_name`,
      );

      // Pinned deliberately. A `content`, `sections`, `node_ids` or `summary` column would make
      // this a second copy of the person's history; an `opportunity_id` or `job_description` column
      // would make it Adapted State, which belongs to Adaptation and is temporary.
      expect(rows.map((row) => row.column_name)).toEqual([
        'created_at',
        'created_by',
        'id',
        'name',
        'person_id',
        'purpose',
        'revision',
        'updated_at',
      ]);
    });

    it('cannot contain anything canonical Explicit State does not stand behind', async () => {
      const personId = await establishIdentity();
      const created = await identity.createRepresentation({
        personId,
        name: 'Markets',
        createdBy: 'user-1',
      });

      const view = (await identity.getRepresentation(created.id))!;
      const state = (await identity.getExplicitState(personId))!;
      const canonicalIds = new Set(
        [...state.reconstructed.structure, ...state.reconstructed.activities].map((node) => node.id),
      );

      const entries = [
        ...view.projection.education,
        ...view.projection.experience,
        ...view.projection.projects,
        ...view.projection.achievements,
        ...view.projection.education.flatMap((entry) => entry.activities ?? []),
        ...view.projection.projects.flatMap((entry) => entry.activities ?? []),
      ];
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        // Every claim in a representation resolves to a confirmed fact. There is no path here that
        // produces an entry with no canonical node behind it.
        expect(canonicalIds.has(entry.nodeId), `${entry.title} has no canonical node`).toBe(true);
      }
    });

    it('has no positioning table that could hold professional content', async () => {
      const { rows } = await db.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name IN ('identity_representation_decision', 'identity_representation_theme')
          ORDER BY table_name, column_name`,
      );

      // Pinned. A decision names a canonical fact and says what to do with it; it never carries a
      // label, contribution, capability, consequence or date out of Explicit State.
      expect(
        rows.filter((r) => r.table_name === 'identity_representation_decision').map((r) => r.column_name),
      ).toEqual([
        'decided_at',
        'decided_by',
        'emphasis',
        'framing',
        'id',
        'included',
        'node_id',
        'priority',
        'representation_id',
      ]);
      expect(
        rows.filter((r) => r.table_name === 'identity_representation_theme').map((r) => r.column_name),
      ).toEqual(['created_at', 'id', 'label', 'position', 'representation_id']);
    });

    it('projects nothing at all for an identity with no confirmed facts', async () => {
      // A person exists from the first captured source, before anything is confirmed (ADR 0010).
      const { personId } = await identity.captureSource({
        contentType: 'text/plain',
        content: Buffer.from(CV, 'utf8'),
      });

      const created = await identity.createRepresentation({
        personId,
        name: 'Markets',
        createdBy: 'user-1',
      });
      const view = (await identity.getRepresentation(created.id))!;

      // Sparse is a correct answer, not a gap to fill (ADR 0008). Nothing invents a profile here.
      expect(view.projection.education).toHaveLength(0);
      expect(view.projection.experience).toHaveLength(0);
      expect(view.projection.projects).toHaveLength(0);
      expect(view.projection.skills).toHaveLength(0);
      expect(view.derivedFrom.identityRevision).toBe(0);
    });
  });

  // --- Slice 2: generalized positioning (UC05–UC08, ADR 0015) --------------------------------

  describe('positioning canonical evidence', () => {
    /** Find a confirmed fact by the label Explicit State holds for it. */
    async function nodeIdFor(personId: string, label: string): Promise<string> {
      const state = (await identity.getExplicitState(personId))!;
      const node = [...state.reconstructed.structure, ...state.reconstructed.activities].find(
        (candidate) => candidate.label === label,
      );
      if (!node) throw new Error(`no canonical node labelled '${label}'`);
      return node.id;
    }

    async function establishLens(name: string, personId: string): Promise<string> {
      const created = await identity.createRepresentation({ personId, name, createdBy: 'user-1' });
      return created.id;
    }

    it('selects, hides, ranks, emphasises and rewords canonical facts (UC05–UC08)', async () => {
      const personId = await establishIdentity();
      const lens = await establishLens('Markets', personId);
      const solver = await nodeIdFor(personId, 'Rota scheduler');
      const degree = await nodeIdFor(personId, 'University of Bristol');

      const applied = await identity.applyRepresentationDecisions({
        representationId: lens,
        expectedRevision: 1,
        decidedBy: 'user-1',
        decisions: [
          {
            nodeId: solver,
            priority: 0,
            emphasis: 'emphasised',
            framing: 'Constraint solving under operational uncertainty',
          },
          { nodeId: degree, included: false },
        ],
      });

      expect(applied.revision).toBe(2);
      expect(applied.decisions).toHaveLength(2);

      const view = (await identity.getRepresentation(lens))!;
      const solverEntry = view.positioning.evidence.find((e) => e.nodeId === solver)!;
      const degreeEntry = view.positioning.evidence.find((e) => e.nodeId === degree)!;

      expect(view.positioning.evidence[0]!.nodeId).toBe(solver); // UC06
      expect(solverEntry.emphasis).toBe('emphasised'); // UC07
      expect(solverEntry.title).toBe('Constraint solving under operational uncertainty'); // UC08
      expect(solverEntry.canonicalTitle).toBe('Rota scheduler'); // …grounded in what R says
      expect(degreeEntry.included).toBe(false); // UC05
    });

    it('sets reusable positioning themes for the lens (UC07)', async () => {
      const personId = await establishIdentity();
      const lens = await establishLens('Markets', personId);

      const result = await identity.setRepresentationPositioning({
        representationId: lens,
        expectedRevision: 1,
        setBy: 'user-1',
        themes: [
          'Quantitative reasoning',
          'Decision-making under uncertainty',
          'Commercial judgement',
        ],
      });

      expect(result.themes.map((theme) => theme.label)).toEqual([
        'Quantitative reasoning',
        'Decision-making under uncertainty',
        'Commercial judgement',
      ]);
      // An arrangement, not a set: the order the person put them in is part of the positioning.
      expect(result.themes.map((theme) => theme.position)).toEqual([0, 1, 2]);

      const view = (await identity.getRepresentation(lens))!;
      expect(view.positioning.themes[0]!.label).toBe('Quantitative reasoning');
    });

    it('lets two lenses over one identity position it substantially differently', async () => {
      const personId = await establishIdentity();
      const markets = await establishLens('Markets', personId);
      const engineering = await establishLens('Software Engineering', personId);
      const solver = await nodeIdFor(personId, 'Rota scheduler');
      const degree = await nodeIdFor(personId, 'University of Bristol');

      await identity.applyRepresentationDecisions({
        representationId: markets,
        expectedRevision: 1,
        decidedBy: 'user-1',
        decisions: [
          { nodeId: degree, priority: 0, framing: 'Quantitative foundation' },
          { nodeId: solver, included: false },
        ],
      });
      await identity.applyRepresentationDecisions({
        representationId: engineering,
        expectedRevision: 1,
        decidedBy: 'user-1',
        decisions: [{ nodeId: solver, priority: 0, emphasis: 'emphasised' }],
      });

      const marketsView = (await identity.getRepresentation(markets))!;
      const engineeringView = (await identity.getRepresentation(engineering))!;

      expect(marketsView.positioning.evidence[0]!.nodeId).toBe(degree);
      expect(marketsView.positioning.evidence[0]!.title).toBe('Quantitative foundation');
      expect(engineeringView.positioning.evidence[0]!.nodeId).toBe(solver);

      // Different positioning, one professional truth: neither lens can add to or subtract from the
      // set of canonical facts.
      expect(new Set(marketsView.positioning.evidence.map((e) => e.nodeId))).toEqual(
        new Set(engineeringView.positioning.evidence.map((e) => e.nodeId)),
      );
      // …and the framing of one is not the framing of the other.
      expect(engineeringView.positioning.evidence.find((e) => e.nodeId === degree)!.framing).toBeUndefined();
    });

    it('changing one lens does not touch another', async () => {
      const personId = await establishIdentity();
      const markets = await establishLens('Markets', personId);
      const engineering = await establishLens('Software Engineering', personId);
      const solver = await nodeIdFor(personId, 'Rota scheduler');

      const before = (await identity.getRepresentation(engineering))!;

      await identity.applyRepresentationDecisions({
        representationId: markets,
        expectedRevision: 1,
        decidedBy: 'user-1',
        decisions: [{ nodeId: solver, included: false, framing: 'Set aside for markets' }],
      });

      const after = (await identity.getRepresentation(engineering))!;
      expect(after.positioning.decisions).toHaveLength(0);
      expect(after.representation.revision).toBe(before.representation.revision);
      expect(after.positioning.evidence.find((e) => e.nodeId === solver)!.included).toBe(true);
      expect(JSON.stringify(after)).not.toContain('Set aside for markets');
    });

    it('changing a lens does not touch Durable Identity', async () => {
      const personId = await establishIdentity();
      const lens = await establishLens('Markets', personId);
      const solver = await nodeIdFor(personId, 'Rota scheduler');

      const before = (await identity.getExplicitState(personId))!;
      const outboxBefore = await db.query<{ count: string }>('SELECT count(*) FROM event_outbox');

      await identity.applyRepresentationDecisions({
        representationId: lens,
        expectedRevision: 1,
        decidedBy: 'user-1',
        decisions: [{ nodeId: solver, included: false, framing: 'Reframed for markets' }],
      });
      await identity.setRepresentationPositioning({
        representationId: lens,
        expectedRevision: 2,
        setBy: 'user-1',
        themes: ['Quantitative reasoning'],
      });

      const after = (await identity.getExplicitState(personId))!;
      expect(after.revision).toBe(before.revision);
      expect(after.reconstructed).toEqual(before.reconstructed);
      // The canonical label is untouched by the reframing.
      expect((await identity.getNode(solver))!.label).toBe('Rota scheduler');
      // Positioning is not an `IdentityUpdated`, but it is a fact about this persistent lens.
      const outboxAfter = await db.query<{ count: string }>('SELECT count(*) FROM event_outbox');
      expect(Number(outboxAfter.rows[0]!.count)).toBe(Number(outboxBefore.rows[0]!.count) + 2);
      const revised = await db.query<{ event_name: string }>(
        `SELECT event_name FROM event_outbox
          WHERE event_name = 'IdentityRepresentationRevised'`,
      );
      expect(revised.rowCount).toBe(2);
      // A lens is not evidence about the person, and Durable Identity holds no PCI to change:
      // learned relational state is Memory / PCI's own authority (ADR 0030).
      expect('learned' in (await identity.getDurableIdentity(personId))!).toBe(false);
    });

    it('hides in the lens without making evidence unavailable', async () => {
      const personId = await establishIdentity();
      const lens = await establishLens('Markets', personId);
      const degree = await nodeIdFor(personId, 'University of Bristol');

      await identity.applyRepresentationDecisions({
        representationId: lens,
        expectedRevision: 1,
        decidedBy: 'user-1',
        decisions: [{ nodeId: degree, included: false }],
      });

      // HiddenInLens ≠ UnavailableToAdaptation, three ways over (ADR 0015).
      //
      // 1. Still canonical.
      expect(await identity.getNode(degree)).toBeTruthy();
      // 2. Still in the broad canonical reads Adaptation is granted by ADR 0013 — neither the
      //    Permanent Identity View nor Explicit State knows this lens exists.
      const view = (await identity.getRepresentation(lens))!;
      expect(view.projection.education.map((e) => e.nodeId)).toContain(degree);
      expect((await identity.getPermanentIdentityView(personId))!.education.map((e) => e.nodeId))
        .toContain(degree);
      // 3. Still present in the lens's own read model, flagged rather than dropped — so a consumer
      //    can see what was set aside and recover it when a role makes it locally useful.
      const hidden = view.positioning.evidence.find((e) => e.nodeId === degree)!;
      expect(hidden.included).toBe(false);
      expect(hidden.canonicalTitle).toBe('University of Bristol');
    });

    it('keeps every decision traceable to a canonical fact of this person', async () => {
      const personId = await establishIdentity();
      const lens = await establishLens('Markets', personId);

      // A decision about something that is not this person's confirmed fact is refused rather than
      // stored as a free-floating opinion.
      await expect(
        identity.applyRepresentationDecisions({
          representationId: lens,
          expectedRevision: 1,
          decidedBy: 'user-1',
          decisions: [{ nodeId: 'not-a-node', framing: 'Led a trading desk' }],
        }),
      ).rejects.toThrow(/No canonical fact of this person's/);

      const view = (await identity.getRepresentation(lens))!;
      expect(view.positioning.decisions).toHaveLength(0);
      // Nothing was written, and the revision did not move: the whole call is one decision.
      expect(view.representation.revision).toBe(1);

      const state = (await identity.getExplicitState(personId))!;
      const canonical = new Set(
        [...state.reconstructed.structure, ...state.reconstructed.activities].map((n) => n.id),
      );
      const solver = await nodeIdFor(personId, 'Rota scheduler');
      await identity.applyRepresentationDecisions({
        representationId: lens,
        expectedRevision: 1,
        decidedBy: 'user-1',
        decisions: [{ nodeId: solver, priority: 0 }],
      });

      const after = (await identity.getRepresentation(lens))!;
      for (const decision of after.positioning.decisions) {
        expect(canonical.has(decision.nodeId)).toBe(true);
      }
      for (const entry of after.positioning.evidence) {
        expect(canonical.has(entry.nodeId)).toBe(true);
      }
    });

    it('shows a canonical correction through the lens, framing and all', async () => {
      const personId = await establishIdentity();
      const lens = await establishLens('Markets', personId);
      const degree = await nodeIdFor(personId, 'University of Bristol');

      await identity.applyRepresentationDecisions({
        representationId: lens,
        expectedRevision: 1,
        decidedBy: 'user-1',
        decisions: [{ nodeId: degree, priority: 0, framing: 'Quantitative foundation' }],
      });

      const node = (await identity.getNode(degree))!;
      await identity.correctNode({
        nodeId: degree,
        expectedRevision: node.revision,
        correctedBy: 'user-1',
        changes: { label: 'University of Bath' },
      });

      const view = (await identity.getRepresentation(lens))!;
      const entry = view.positioning.evidence.find((e) => e.nodeId === degree)!;
      // The decision survives the correction, because it was never about the label — it was about
      // the fact. And the canonical truth underneath it moved with no synchronisation anywhere.
      expect(entry.canonicalTitle).toBe('University of Bath');
      expect(entry.framing).toBe('Quantitative foundation');
      expect(entry.priority).toBe(0);
    });

    it('drops decisions about a fact that no longer exists', async () => {
      const personId = await establishIdentity();
      const lens = await establishLens('Markets', personId);
      const solver = await nodeIdFor(personId, 'Rota scheduler');

      await identity.applyRepresentationDecisions({
        representationId: lens,
        expectedRevision: 1,
        decidedBy: 'user-1',
        decisions: [{ nodeId: solver, priority: 0, framing: 'Constraint solving' }],
      });

      const node = (await identity.getNode(solver))!;
      await identity.removeNode({
        nodeId: solver,
        expectedRevision: node.revision,
        correctedBy: 'user-1',
      });

      const view = (await identity.getRepresentation(lens))!;
      // A decision about a fact the person removed is meaningless, and keeping it would let the
      // removed fact reappear through the lens.
      expect(view.positioning.decisions).toHaveLength(0);
      expect(view.positioning.evidence.map((e) => e.nodeId)).not.toContain(solver);

      // Durable Identity leaves the foreign aggregate untouched; its public read filters the stale
      // stable ID until Representation consumes the domain fact and reconciles itself.
      const held = await db.query(
        'SELECT id FROM identity_representation_decision WHERE representation_id = $1 AND node_id = $2',
        [lens, solver],
      );
      expect(held.rowCount).toBe(1);

      const { rows } = await db.query<{ envelope: unknown }>(
        `SELECT envelope FROM event_outbox
          WHERE event_name = 'CanonicalFactRemoved' ORDER BY created_at DESC LIMIT 1`,
      );
      const event = rows[0]!.envelope as Parameters<
        ReturnType<typeof createCanonicalFactRemovedHandler>['handle']
      >[0];
      await createCanonicalFactRemovedHandler(db).handle(event);

      const reconciled = await db.query(
        'SELECT id FROM identity_representation_decision WHERE representation_id = $1 AND node_id = $2',
        [lens, solver],
      );
      expect(reconciled.rowCount).toBe(0);
      expect((await identity.getRepresentation(lens))!.representation.revision).toBe(3);
    });

    it('guards positioning with the lens revision', async () => {
      const personId = await establishIdentity();
      const lens = await establishLens('Markets', personId);
      const solver = await nodeIdFor(personId, 'Rota scheduler');

      await identity.applyRepresentationDecisions({
        representationId: lens,
        expectedRevision: 1,
        decidedBy: 'user-1',
        decisions: [{ nodeId: solver, priority: 0 }],
      });

      // The same optimistic-concurrency mechanism Explicit State uses: the second writer is told,
      // not silently applied on top.
      await expect(
        identity.applyRepresentationDecisions({
          representationId: lens,
          expectedRevision: 1,
          decidedBy: 'user-2',
          decisions: [{ nodeId: solver, priority: 5 }],
        }),
      ).rejects.toThrow(/stale/i);

      await expect(
        identity.setRepresentationPositioning({
          representationId: lens,
          expectedRevision: 1,
          setBy: 'user-2',
          themes: ['Quantitative reasoning'],
        }),
      ).rejects.toThrow(/stale/i);

      expect((await identity.getRepresentation(lens))!.positioning.decisions[0]!.priority).toBe(0);
    });

    it('updates a decision in place, and tells "leave it" apart from "clear it"', async () => {
      const personId = await establishIdentity();
      const lens = await establishLens('Markets', personId);
      const solver = await nodeIdFor(personId, 'Rota scheduler');

      await identity.applyRepresentationDecisions({
        representationId: lens,
        expectedRevision: 1,
        decidedBy: 'user-1',
        decisions: [{ nodeId: solver, priority: 0, emphasis: 'emphasised', framing: 'Constraint solving' }],
      });

      // Omitted fields are left alone…
      await identity.applyRepresentationDecisions({
        representationId: lens,
        expectedRevision: 2,
        decidedBy: 'user-1',
        decisions: [{ nodeId: solver, priority: 3 }],
      });
      let decisions = (await identity.getRepresentation(lens))!.positioning.decisions;
      expect(decisions).toHaveLength(1); // one decision per fact per lens, updated in place
      expect(decisions[0]).toMatchObject({ priority: 3, emphasis: 'emphasised', framing: 'Constraint solving' });

      // …and an explicit null clears one back to neutral.
      await identity.applyRepresentationDecisions({
        representationId: lens,
        expectedRevision: 3,
        decidedBy: 'user-1',
        decisions: [{ nodeId: solver, framing: null, emphasis: null }],
      });
      decisions = (await identity.getRepresentation(lens))!.positioning.decisions;
      expect(decisions[0]).not.toHaveProperty('framing');
      expect(decisions[0]).not.toHaveProperty('emphasis');
      expect(decisions[0]!.priority).toBe(3);
    });

    it('refuses incoherent positioning input', async () => {
      const personId = await establishIdentity();
      const lens = await establishLens('Markets', personId);
      const solver = await nodeIdFor(personId, 'Rota scheduler');

      await expect(
        identity.applyRepresentationDecisions({
          representationId: lens,
          expectedRevision: 1,
          decidedBy: 'user-1',
          decisions: [{ nodeId: solver, priority: 0 }, { nodeId: solver, priority: 1 }],
        }),
      ).rejects.toThrow(/More than one decision/);

      await expect(
        identity.applyRepresentationDecisions({
          representationId: lens,
          expectedRevision: 1,
          decidedBy: 'user-1',
          decisions: [],
        }),
      ).rejects.toThrow(/No positioning decisions/);

      await expect(
        identity.setRepresentationPositioning({
          representationId: lens,
          expectedRevision: 1,
          setBy: 'user-1',
          themes: ['Quantitative reasoning', 'quantitative reasoning'],
        }),
      ).rejects.toThrow(/listed more than once/);
    });
  });

  // --- Slice 3: materialization and the Adaptation prior (UC09, UC10, ADR 0016) ---------------

  describe('materializing a lens as a general CV (UC09)', () => {
    /** A lens shaped the way a Markets student would shape it. */
    async function shapedLens(personId: string, name: string): Promise<string> {
      const created = await identity.createRepresentation({
        personId,
        name,
        purpose: 'Sales & trading placements.',
        createdBy: 'user-1',
      });
      const state = (await identity.getExplicitState(personId))!;
      const node = (label: string) =>
        [...state.reconstructed.structure, ...state.reconstructed.activities].find(
          (candidate) => candidate.label === label,
        )!.id;

      await identity.applyRepresentationDecisions({
        representationId: created.id,
        expectedRevision: 1,
        decidedBy: 'user-1',
        decisions: [
          {
            nodeId: node('Rota scheduler'),
            priority: 0,
            emphasis: 'emphasised',
            framing: 'Constraint solving under operational uncertainty',
          },
          { nodeId: node('University of Bristol'), included: false },
        ],
      });
      await identity.setRepresentationPositioning({
        representationId: created.id,
        expectedRevision: 2,
        setBy: 'user-1',
        themes: ['Quantitative reasoning', 'Decision-making under uncertainty'],
      });
      return created.id;
    }

    it('renders the shaped lens as a document and LaTeX, grounded in canonical facts', async () => {
      const personId = await establishIdentity();
      const lens = await shapedLens(personId, 'Markets');

      const rendered = (await runtime.renderRepresentationCv(lens, { fullName: 'A. Student' }))!;
      const { document, latex } = rendered;

      expect(document.representationName).toBe('Markets');
      expect(document.themes).toEqual(['Quantitative reasoning', 'Decision-making under uncertainty']);
      expect(document.header.headline).toBe('Sales & trading placements.');

      const state = (await identity.getExplicitState(personId))!;
      const canonical = new Set(
        [...state.reconstructed.structure, ...state.reconstructed.activities].map((n) => n.id),
      );
      const entries = document.sections
        .filter((section) => section.kind !== 'skills')
        .flatMap((section) => section.entries);
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        // Every line on the CV traces to a confirmed fact. Nothing is composed here.
        expect(canonical.has(entry.nodeId!), `${entry.title} has no canonical node`).toBe(true);
      }

      expect(latex).toContain('\\documentclass');
      expect(latex).toContain('\\textbf{Constraint solving under operational uncertainty}');
      // Hidden in the lens, so absent from the lens's CV — and still canonical, see below.
      expect(latex).not.toContain('University of Bristol');
      expect(document.grounding.identityRevision).toBe(state.revision);
    });

    it('is a reusable general CV, not a submitted application artifact', async () => {
      const personId = await establishIdentity();
      const lens = await shapedLens(personId, 'Markets');

      // The same lens renders the same reusable CV, as many times as the person wants, for as many
      // Markets opportunities as they apply to. There is no opportunity anywhere in the input.
      const first = (await runtime.renderRepresentationCv(lens))!;
      const second = (await runtime.renderRepresentationCv(lens))!;
      expect(second.latex).toBe(first.latex);

      // Nothing was stored: no artifact table, no bytes, nothing to go stale.
      const { rows } = await db.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name LIKE '%cv%' OR table_name LIKE '%document%'`,
      );
      expect(rows).toHaveLength(0);
    });

    it('follows a canonical correction into the next render', async () => {
      const personId = await establishIdentity();
      const lens = await shapedLens(personId, 'Markets');

      const before = (await runtime.renderRepresentationCv(lens))!;
      // The framed project heading, and the unframed activity beneath it, exactly as R holds it.
      expect(before.latex).toContain('Constraint solving under operational uncertainty');
      expect(before.latex).toContain('Wrote a constraint solver for shift allocation');

      const state = (await identity.getExplicitState(personId))!;
      const activity = state.reconstructed.activities.find(
        (node) => node.label === 'Wrote a constraint solver for shift allocation',
      )!;
      await identity.correctNode({
        nodeId: activity.id,
        expectedRevision: activity.revision,
        correctedBy: 'user-1',
        changes: {
          label: 'Built a constraint solver for shift allocation',
          contribution: 'Built a constraint solver for shift allocation',
        },
      });

      // No cache to invalidate and no stored document to regenerate: the CV is derived, so the
      // correction is simply there.
      const after = (await runtime.renderRepresentationCv(lens))!;
      expect(after.latex).toContain('Built a constraint solver');
      expect(after.latex).not.toContain('Wrote a constraint solver');
    });

    it('reports a missing toolchain instead of degrading silently', async () => {
      const personId = await establishIdentity();
      const lens = await shapedLens(personId, 'Markets');
      const rendered = (await runtime.renderRepresentationCv(lens))!;

      // No compiler configured in tests. The document and its LaTeX are still fully available —
      // a missing toolchain is an operational fact, not a product answer.
      await expect(runtime.compileCv(rendered.latex)).rejects.toThrow(/No LaTeX toolchain/);
      expect(rendered.latex.length).toBeGreaterThan(0);
    });

    it('compiles through the port when a runtime supplies one', async () => {
      const personId = await establishIdentity();
      const lens = await shapedLens(personId, 'Markets');

      let compiled = '';
      const withCompiler = createIdentityRepresentationRuntime({
        db,
        identity: durable,
        compiler: {
          compile: async (latex: string) => {
            compiled = latex;
            return new TextEncoder().encode('%PDF-1.7 fake');
          },
        },
      });

      const rendered = (await withCompiler.renderRepresentationCv(lens))!;
      const pdf = await withCompiler.compileCv(rendered.latex);

      expect(new TextDecoder().decode(pdf).startsWith('%PDF')).toBe(true);
      expect(compiled).toContain('\\begin{document}');
    });
  });

  describe('the lens as an Adaptation prior (UC10)', () => {
    async function lensHiding(personId: string, label: string): Promise<string> {
      const created = await identity.createRepresentation({
        personId,
        name: 'Markets',
        createdBy: 'user-1',
      });
      const state = (await identity.getExplicitState(personId))!;
      const nodeId = [...state.reconstructed.structure, ...state.reconstructed.activities].find(
        (candidate) => candidate.label === label,
      )!.id;

      await identity.applyRepresentationDecisions({
        representationId: created.id,
        expectedRevision: 1,
        decidedBy: 'user-1',
        decisions: [{ nodeId, included: false }],
      });
      await identity.setRepresentationPositioning({
        representationId: created.id,
        expectedRevision: 2,
        setBy: 'user-1',
        themes: ['Quantitative reasoning'],
      });
      return created.id;
    }

    it('offers positioning preferences and no professional evidence', async () => {
      const personId = await establishIdentity();
      const lens = await lensHiding(personId, 'University of Bristol');

      const prior = (await identity.getRepresentationPrior(lens))!;
      expect(prior.name).toBe('Markets');
      expect(prior.themes).toEqual(['Quantitative reasoning']);
      expect(prior.identityRevision).toBe((await identity.getExplicitState(personId))!.revision);

      // A consumer holding only this cannot say what any of these facts *are*. That is what stops
      // `A^C = T(V_i, C)` — the prior is unusable without the canonical snapshot.
      const serialised = JSON.stringify(prior);
      for (const canonical of ['University of Bristol', 'Rota scheduler', 'Studied compilers']) {
        expect(serialised, `the prior leaked canonical evidence: ${canonical}`).not.toContain(canonical);
      }
    });

    it('states hiding as a preference, so the lens can never act as a whitelist', async () => {
      const personId = await establishIdentity();
      const lens = await lensHiding(personId, 'University of Bristol');

      const state = (await identity.getExplicitState(personId))!;
      const hiddenId = state.reconstructed.structure.find(
        (node) => node.label === 'University of Bristol',
      )!.id;

      const prior = (await identity.getRepresentationPrior(lens))!;
      const preference = prior.preferences.find((p) => p.nodeId === hiddenId)!;

      // HiddenInLens ≠ UnavailableToAdaptation. The hidden fact is *named* here, marked as the
      // person's general preference — not silently missing, which is what a filter would look like.
      expect(preference).toBeDefined();
      expect(preference.suggestedInclusion).toBe(false);
    });

    it('leaves the broad canonical snapshot ADR 0013 grants completely untouched', async () => {
      const personId = await establishIdentity();
      const lens = await lensHiding(personId, 'University of Bristol');
      const prior = (await identity.getRepresentationPrior(lens))!;

      const state = (await identity.getExplicitState(personId))!;
      const durable = (await identity.getDurableIdentity(personId))!;
      const view = (await identity.getPermanentIdentityView(personId))!;

      // Everything the lens sets aside is still reachable through the canonical reads, which do not
      // take a representation id and cannot be narrowed by one. This is the structural form of
      // "Adaptation can recover evidence the general lens de-emphasises".
      const hidden = prior.preferences.filter((p) => !p.suggestedInclusion);
      expect(hidden.length).toBeGreaterThan(0);
      const canonicalIds = new Set(
        [...state.reconstructed.structure, ...state.reconstructed.activities].map((n) => n.id),
      );
      for (const preference of hidden) {
        expect(canonicalIds.has(preference.nodeId)).toBe(true);
        expect(await identity.getNode(preference.nodeId)).toBeTruthy();
      }
      expect(view.education.map((e) => e.title)).toContain('University of Bristol');
      expect(durable.explicit.reconstructed.structure.length).toBeGreaterThan(0);
    });

    it('is optional: a lens with no decisions still yields a usable prior', async () => {
      const personId = await establishIdentity();
      const bare = await identity.createRepresentation({
        personId,
        name: 'Software Engineering',
        createdBy: 'user-1',
      });

      const prior = (await identity.getRepresentationPrior(bare.id))!;
      // Adaptation must work with a lens that has decided nothing — and with no lens at all, which
      // is why `P_i` is optional in `A^C = T(E_t, L_t, C, P_i)`.
      expect(prior.preferences).toEqual([]);
      expect(prior.themes).toEqual([]);
      expect(await identity.getRepresentationPrior('no-such-lens')).toBeUndefined();
    });

    it('exposes no way for a consumer to write a lens from an opportunity', () => {
      // Adaptation reads a prior. Nothing on the contract lets an opportunity-specific caller push
      // positioning back into a persistent lens: a generalized update must come through the user, or
      // later through the Slower Learning Loop (ADR 0016 §UC11).
      const surface = Object.keys(contractSurface).join(' ');
      expect(surface).not.toMatch(/learn|pci|adapt/i);

      expect(contractSurface).not.toHaveProperty('applyAdaptation');
    });
  });
});
