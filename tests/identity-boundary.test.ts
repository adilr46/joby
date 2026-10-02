/**
 * Identity Slice 4 (UC12) — the service boundary.
 *
 * The boundary is not the package. The boundary is **what the package exports**, so most of this
 * file asserts on the export surface itself: a boundary that is only a convention erodes one
 * convenient import at a time, and nothing fails when it does.
 *
 * The rest proves a downstream domain can do its job through the contract alone, and that the
 * Permanent Identity View is genuinely derived from canonical Explicit State rather than kept
 * beside it.
 */

import { readFile } from 'node:fs/promises';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '@joby/database';
import { createIdentity, type Identity } from '@joby/identity';
import { createIdentityRuntime, DeterministicCvExtractor } from '@joby/identity/runtime';

import * as contractSurface from '@joby/identity';
import * as runtimeSurface from '@joby/identity/runtime';
import * as testingSurface from '@joby/identity/testing';

import { connectTestDatabase, hasDatabase, truncateAll, truncateIdentity } from './support/database';

const repoRoot = new URL('..', import.meta.url);

const describeIntegration = hasDatabase ? describe : (describe.skip.bind(null) as typeof describe);

if (!hasDatabase) {
  console.warn('\n[tests] SKIPPING identity boundary integration tests: DATABASE_URL is not set.\n');
}

/**
 * The value exports of `@joby/identity` — the runtime surface a consumer can actually call.
 *
 * Pinned deliberately. Types are erased at runtime and cannot be checked here; values are what a
 * consumer can reach, and this list is the thing that has to stay small.
 */
const CONTRACT_VALUE_EXPORTS = [
  // The factory. Consumers get the contract, never the implementing class.
  'createIdentity',
  // Errors a caller must handle.
  'AlreadyConfirmedError',
  'ConcurrencyError',
  'DanglingRelationError',
  'IncompleteReviewError',
  'InvalidCorrectionError',
  'NodeNotFoundError',
  'PersonNotFoundError',
  'ProposalNotFoundError',
  'SourceTooLargeError',
  'UnknownProposalItemError',
  'UnsupportedSourceError',
  // Identity Representation (ADR 0014) — a deliberate widening, argued for in that ADR.
  'InvalidStatedContextError',
  // Representation References (ADR 0021).
  // One constant, because a caller has to know what it may upload.
  'SUPPORTED_CONTENT_TYPES',
  'USER_CONDITION_KINDS',
].sort();

/**
 * The nine capabilities of UC12, the three Identity Representation capabilities added by ADR 0014,
 * the two positioning capabilities added by ADR 0015, and the Adaptation prior added by ADR 0016.
 * Adding another should be a decision, not a drift — which is what this list is for.
 *
 * **CV rendering is deliberately not here.** Its only consumer is the HTTP surface and its compiler
 * is a composition choice, so it lives on `/runtime` beside the model adapters.
 */
describe('the exported surface', () => {
  it('exposes exactly the pinned contract, and nothing more', () => {
    // If this fails, the boundary widened. That may be right — but it should be deliberate, and
    // the diff should say so.
    expect(Object.keys(contractSurface).sort()).toEqual(CONTRACT_VALUE_EXPORTS);
  });

  it.each([
    ['the implementing class', 'IdentityService'],
    ['persistence', 'IdentityRepository'],
    ['persistence', 'ExplicitStateRepository'],
    ['the delta classifier', 'classifyAgainstState'],
    ['the projection function', 'projectPermanentIdentityView'],
    ['extraction validation', 'parseProposalContent'],
    ['the GitHub ingestion service', 'GitHubIngestionService'],
    ['persistence', 'RepresentationRepository'],
    ['the representation service class', 'RepresentationService'],
    ['a model adapter', 'OpenAiCvExtractor'],
    ['a model adapter', 'DeterministicCvExtractor'],
    ['a test double', 'FakeGitHubClient'],
  ])('does not expose %s (%s) to other domains', (_label, name) => {
    // Each of these is a way to couple to *how* Identity works rather than *what it means*.
    expect(contractSurface).not.toHaveProperty(name);
  });

  it('keeps composition on the runtime entry point', () => {
    expect(runtimeSurface).toHaveProperty('createIdentityRuntime');
    expect(runtimeSurface).not.toHaveProperty('IdentityService');
    expect(runtimeSurface).toHaveProperty('DeterministicCvExtractor');
    expect(runtimeSurface).toHaveProperty('HttpGitHubClient');
    // CV rendering and its toolchain: composition, not a domain capability (ADR 0016).
    expect(contractSurface).not.toHaveProperty('renderCvLatex');
    // Still not persistence, and still not the classifier: `/runtime` is composition, not internals.
    expect(runtimeSurface).not.toHaveProperty('IdentityRepository');
    expect(runtimeSurface).not.toHaveProperty('classifyAgainstState');
  });

  it('keeps the test double out of both production surfaces', () => {
    expect(testingSurface).toHaveProperty('FakeGitHubClient');
    expect(runtimeSurface).not.toHaveProperty('FakeGitHubClient');
  });

  it('publishes no wildcard subpath, so internals are unreachable by import', async () => {
    const manifest = JSON.parse(
      await readFile(new URL('packages/identity/package.json', repoRoot), 'utf8'),
    ) as { exports: Record<string, string> };

    // A `./*` entry would make `@joby/identity/src/repository` importable and undo all of the above.
    //
    // `./adaptation` used to be here — a separate surface inside a shared package, because sharing a
    // package must not mean sharing a surface. Adaptation now lives in `@joby/translation`
    // (ADR 0024), so that separation is a package boundary rather than an exports-map convention.
    expect(Object.keys(manifest.exports).sort()).toEqual([
      '.',
      './representation',
      './representation/runtime',
      './runtime',
      './testing',
    ]);
    expect(JSON.stringify(manifest.exports)).not.toContain('*');
  });

});

describe('no consumer reaches past the boundary', () => {
  const appFiles = ['apps/api/src/main.ts', 'apps/api/src/routes/identity.ts', 'apps/worker/src/main.ts'];

  it('no application code names an Identity table', async () => {
    for (const file of appFiles) {
      const source = await readFile(new URL(file, repoRoot), 'utf8');
      // Reading another domain's tables directly is how ADR 0003's boundaries become decorative.
      expect(source, `${file} references identity_* tables`).not.toMatch(/identity_[a-z_]+/);
    }
  });

  it('no application code imports an Identity internal module', async () => {
    for (const file of appFiles) {
      const source = await readFile(new URL(file, repoRoot), 'utf8');
      expect(source, `${file} reaches into @joby/identity internals`).not.toMatch(
        /@joby\/identity\/src/,
      );
    }
  });
});

describeIntegration('a downstream domain, through the contract alone', () => {
  let db: Database;
  /** Typed as the contract, not the class: this is exactly what another domain would hold. */
  let identity: Identity;

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
    identity = createIdentity(db, { extractor: new DeterministicCvExtractor() });
  });

  /**
   * Everything a downstream domain would need to reach a confirmed identity, using only the
   * contract. Reconstruction itself is a runtime concern, so it is driven separately.
   */
  async function establishIdentity(): Promise<string> {
    const { personId } = await identity.captureSource({
      contentType: 'text/plain',
      content: Buffer.from(CV, 'utf8'),
    });

    // The worker's job, composed from `/runtime` — a domain never runs this.
    await createIdentityRuntime({ db, extractor: new DeterministicCvExtractor() }).runReconstruction();

    const proposal = (await identity.listProposals(personId))[0]!;
    const decisions = [
      ...proposal.content.structure,
      ...proposal.content.activities,
      ...proposal.content.relations,
    ].map((item) => ({ itemId: item.id, decision: 'retain' as const }));

    await identity.confirmReview({
      proposalId: proposal.id,
      expectedRevision: 0,
      decisions,
      confirmedBy: 'user-1',
    });
    return personId;
  }

  it('supports all nine UC12 capabilities without touching anything else', async () => {
    // 2. capture a source (inside the helper) → 1. locate the identity
    const personId = await establishIdentity();
    expect((await identity.getPerson(personId))!.durableIdentityId).toBeTruthy();

    // 3. inspect reconstruction
    const proposal = (await identity.listProposals(personId))[0]!;
    expect(await identity.getProposal(proposal.id)).toBeTruthy();
    const lifecycle = await identity.getSourceLifecycle(proposal.sourceId);
    expect(lifecycle).toMatchObject({ captured: true, confirmed: true });

    // 4. the reviewed reconstruction was applied
    expect((await identity.getReview(proposal.id))!.confirmedBy).toBe('user-1');

    // 5. retrieve canonical Explicit State
    const state = (await identity.getExplicitState(personId))!;
    expect(state.reconstructed.structure.length).toBeGreaterThan(0);
    expect(state.revision).toBe(1);

    // …and trace a fact to the passage behind it
    const node = state.reconstructed.structure[0]!;
    const provenance = await identity.getProvenance('node', node.id);
    expect(CV).toContain(provenance[0]!.quote!);

    // 6. correct it
    const corrected = await identity.correctNode({
      nodeId: node.id,
      expectedRevision: node.revision,
      correctedBy: 'user-1',
      changes: { label: 'University of Bristol (BSc)' },
    });
    expect(corrected.node!.label).toBe('University of Bristol (BSc)');
    expect((await identity.getNode(node.id))!.revision).toBe(node.revision + 1);

    const added = await identity.addNode({
      personId,
      type: 'activity',
      label: 'Mentored first years',
      contribution: 'Mentored two first-year students',
      correctedBy: 'user-1',
    });
    await identity.removeNode({
      nodeId: added.node!.id,
      expectedRevision: added.node!.revision,
      correctedBy: 'user-1',
    });

    // 7. retrieve Durable Identity
    expect(await identity.getDurableIdentity(personId)).toBeTruthy();

    // 8. the Permanent Identity View
    expect((await identity.getPermanentIdentityView(personId))!.education.length).toBeGreaterThan(0);
  });

  it('returns Explicit and Learned State as separately governed components', async () => {
    const personId = await establishIdentity();
    const durable = (await identity.getDurableIdentity(personId))!;

    expect(durable.explicit.reconstructed).toBeTruthy();
    // X is present and empty: a consumer must see that Stated Context exists and is unset.
    expect(durable.explicit.stated).toEqual({});
    // **There is no L here.** PCI is an independent learned model owned by Memory / PCI, not a
    // Durable Identity component awaiting implementation (ADR 0030). This module answers what is
    // professionally true; what Joby has learned about person x world is a different authority.
    expect('learned' in durable).toBe(false);
    expect(Object.keys(durable).sort()).toEqual([
      'durableIdentityId',
      'explicit',
      'personId',
    ]);
  });

  it('exposes no way to write Learned State', () => {
    // PCI changes only through the Slower Learning Loop. There is no method here to misuse.
    const surface = Object.keys(contractSurface).join(' ');
    expect(surface).not.toMatch(/learn/i);
    expect(surface).not.toMatch(/pci/i);
  });

  it('carries the concurrency information every mutable workflow needs', async () => {
    const personId = await establishIdentity();
    const state = (await identity.getExplicitState(personId))!;
    const node = state.reconstructed.activities[0]!;

    // Whole-set transitions are guarded identity-wide; corrections are guarded per node. Both
    // revisions are readable through the contract, so a consumer can supply the one it read.
    expect(typeof state.revision).toBe('number');
    expect(typeof node.revision).toBe('number');

    await identity.correctNode({
      nodeId: node.id,
      expectedRevision: node.revision,
      correctedBy: 'user-1',
      changes: { label: 'First writer' },
    });

    await expect(
      identity.correctNode({
        nodeId: node.id,
        expectedRevision: node.revision,
        correctedBy: 'user-2',
        changes: { label: 'Second writer' },
      }),
    ).rejects.toThrow(/stale/i);
  });

  describe('the Permanent Identity View is derived, not stored', () => {
    it('follows a correction to Explicit State with no separate write', async () => {
      const personId = await establishIdentity();

      const before = (await identity.getPermanentIdentityView(personId))!;
      expect(before.education.map((e) => e.title)).toContain('University of Bristol');

      const node = (await identity.getExplicitState(personId))!.reconstructed.structure.find(
        (s) => s.label === 'University of Bristol',
      )!;
      await identity.correctNode({
        nodeId: node.id,
        expectedRevision: node.revision,
        correctedBy: 'user-1',
        changes: { label: 'University of Bath' },
      });

      const after = (await identity.getPermanentIdentityView(personId))!;
      // Nothing refreshed a projection: the section is a query over R, so it simply changed.
      expect(after.education.map((e) => e.title)).toContain('University of Bath');
      expect(after.education.map((e) => e.title)).not.toContain('University of Bristol');
    });

    it('disappears entirely when the facts behind it are removed', async () => {
      const personId = await establishIdentity();
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

      const view = (await identity.getPermanentIdentityView(personId))!;
      // A parallel store would still be holding the person's education here.
      expect(view.education).toHaveLength(0);
      expect(view.projects).toHaveLength(0);
      expect(view.skills).toHaveLength(0);
      expect(view.evidence).toHaveLength(0);
    });

    it('has no table of its own, and no cached person-state anywhere', async () => {
      await establishIdentity();

      const { rows } = await db.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name LIKE 'identity_%'
          ORDER BY table_name`,
      );

      // The canonical graph, its provenance and history, sources, and the GitHub selection. No
      // Education/Experience/Projects/Skills table, and no materialised view.
      //
      // `identity_representation` is the one persistent non-canonical table, and it holds a lens —
      // a name and a purpose — never a fact (ADR 0014). Its columns are pinned separately in
      // `identity-representation.test.ts`, which is where that distinction is actually enforced.
      expect(rows.map((r) => r.table_name)).toEqual([
        'identity_correction',
        'identity_durable_identity',
        'identity_explicit_node',
        'identity_github_connection',
        'identity_person',
        'identity_professional_source',
        'identity_provenance',
        'identity_reconstruction_job',
        'identity_reconstruction_proposal',
        'identity_relation',
        'identity_repository_selection',
        'identity_representation',
        'identity_representation_decision',
        // Expression material, never reconstructed from — no job table references it (ADR 0021).
        'identity_representation_reference',
        'identity_representation_theme',
        'identity_review',
        'identity_review_decision',
        'identity_stated_context',
        'identity_user_condition',
      ]);
    });
  });
});
