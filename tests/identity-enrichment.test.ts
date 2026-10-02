/**
 * Identity Slice 3 (UC08–UC11), against a real database.
 *
 * The flow this proves end to end:
 *
 *   existing E  +  selected GitHub repository  →  delta  →  review  →  higher-resolution E'
 *
 * without a duplicated identity and without a single unreviewed mutation.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '@joby/database';
import type { ReconstructionProposal, ReviewDecisionInput } from '@joby/identity';
import {
  createIdentityRuntime,
  DeterministicCvExtractor,
  RepositoryNotSelectedError,
  type DurableIdentityRuntime,
  type RepositoryMetadata,
} from '@joby/identity/runtime';
// A test double lives behind its own entry point, so application code cannot reach it.
import { FakeGitHubClient } from '@joby/identity/testing';

import { connectTestDatabase, hasDatabase, truncateAll, truncateIdentity } from './support/database';

const describeIntegration = hasDatabase ? describe : (describe.skip.bind(null) as typeof describe);

if (!hasDatabase) {
  console.warn('\n[tests] SKIPPING identity enrichment tests: DATABASE_URL is not set.\n');
}

/** A CV that already establishes the project the repository will turn out to be. */
const CV = [
  'Education',
  'University of Bristol, 2022 - 2026',
  '- Studied compilers',
  '',
  'Projects',
  'Rota scheduler',
  '- Wrote a constraint solver for shift allocation',
].join('\n');

const SELECTED: RepositoryMetadata = {
  fullName: 'octocat/rota-scheduler',
  name: 'rota-scheduler',
  description: 'Constraint solver for shift allocation, with a web UI',
  isPrivate: false,
  languages: ['TypeScript', 'SQL'],
  createdAt: '2024-01-15T10:00:00Z',
  pushedAt: '2024-06-01T10:00:00Z',
};

const PRIVATE_REPO: RepositoryMetadata = {
  fullName: 'octocat/secret-thesis',
  name: 'secret-thesis',
  description: 'Dissertation working notes',
  isPrivate: true,
  languages: ['TeX'],
  pushedAt: '2024-05-01T10:00:00Z',
};

const UNSELECTED: RepositoryMetadata = {
  fullName: 'octocat/private-side-project',
  name: 'private-side-project',
  description: 'Something the user did not choose to share',
  isPrivate: true,
  languages: ['Python'],
  pushedAt: '2024-04-01T10:00:00Z',
};

const CREDENTIALS = { accountLogin: 'octocat' };
const USER = 'user-1';

describeIntegration('identity: selected sources → delta → higher-resolution E', () => {
  let db: Database;
  let identity: DurableIdentityRuntime;
  let github: FakeGitHubClient;

  beforeAll(async () => {
    db = await connectTestDatabase();
  });

  afterAll(async () => {
    await db?.close();
  });

  beforeEach(async () => {
    await truncateIdentity(db);
    await truncateAll(db);
    github = new FakeGitHubClient([SELECTED, PRIVATE_REPO, UNSELECTED]);
    identity = createIdentityRuntime({
      db,
      extractor: new DeterministicCvExtractor(),
      githubClient: github,
    });
  });

  const allItemIds = (proposal: ReconstructionProposal): string[] => [
    ...proposal.content.structure.map((s) => s.id),
    ...proposal.content.activities.map((a) => a.id),
    ...proposal.content.relations.map((r) => r.id),
  ];

  const retainAll = (proposal: ReconstructionProposal): ReviewDecisionInput[] =>
    allItemIds(proposal).map((itemId) => ({ itemId, decision: 'retain' as const }));

  /** Capture the CV, reconstruct it, confirm all of it. Leaves a real identity to enrich. */
  async function establishedIdentity(): Promise<string> {
    const { personId } = await identity.captureSource({
      contentType: 'text/plain',
      content: Buffer.from(CV, 'utf8'),
    });
    await identity.runReconstruction();
    const proposal = (await identity.listProposals(personId))[0]!;
    await identity.confirmReview({
      proposalId: proposal.id,
      expectedRevision: 0,
      decisions: retainAll(proposal),
      confirmedBy: USER,
    });
    return personId;
  }

  async function connectAndSelect(personId: string): Promise<void> {
    await identity.connectGitHub(personId, 'octocat');
    await identity.selectRepositories(personId, [
      { fullName: SELECTED.fullName, selected: true, isPrivate: false },
      { fullName: PRIVATE_REPO.fullName, selected: true, isPrivate: true },
      { fullName: UNSELECTED.fullName, selected: false, isPrivate: true },
    ]);
  }

  describe('selection is the permission (UC08–UC09)', () => {
    it('never inspects a repository the user did not select', async () => {
      const personId = await establishedIdentity();
      await connectAndSelect(personId);

      await identity.ingestSelectedRepositories(personId, CREDENTIALS);

      // Not "the result excluded it" — it was never fetched. A filter applied after fetching
      // would pass an output-only assertion while Joby had already read the private code.
      expect(github.inspected).toEqual([SELECTED.fullName, PRIVATE_REPO.fullName]);
      expect(github.inspected).not.toContain(UNSELECTED.fullName);
    });

    it('refuses to refresh an unselected repository, without asking GitHub', async () => {
      const personId = await establishedIdentity();
      await connectAndSelect(personId);

      await expect(
        identity.refreshRepository(personId, CREDENTIALS, UNSELECTED.fullName),
      ).rejects.toThrow(RepositoryNotSelectedError);

      expect(github.inspected).toHaveLength(0);
    });

    it('stops inspecting a repository once it is deselected', async () => {
      const personId = await establishedIdentity();
      await connectAndSelect(personId);
      await identity.ingestSelectedRepositories(personId, CREDENTIALS);

      github.inspected.length = 0;
      await identity.selectRepositories(personId, [{ fullName: SELECTED.fullName, selected: false }]);
      await identity.ingestSelectedRepositories(personId, CREDENTIALS);

      expect(github.inspected).toEqual([PRIVATE_REPO.fullName]);
    });

    it('listing what is available captures no source and schedules no work', async () => {
      const personId = await establishedIdentity();
      await identity.connectGitHub(personId, 'octocat');

      const available = await identity.listAvailableRepositories(personId, CREDENTIALS);

      expect(available).toHaveLength(3);
      expect(github.inspected).toHaveLength(0);
      const sources = await db.query(
        `SELECT 1 FROM identity_professional_source WHERE kind = 'github_repository'`,
      );
      expect(sources.rowCount).toBe(0);
    });
  });

  describe('sources beyond the CV (UC08)', () => {
    it('captures repository metadata as a professional source, carrying its visibility', async () => {
      const personId = await establishedIdentity();
      await connectAndSelect(personId);

      const results = await identity.ingestSelectedRepositories(personId, CREDENTIALS);
      const captured = results.find((r) => r.fullName === SELECTED.fullName)!;
      const secret = results.find((r) => r.fullName === PRIVATE_REPO.fullName)!;

      expect(captured.outcome).toBe('captured');
      expect(captured.source!.kind).toBe('github_repository');
      expect(captured.source!.visibility).toBe('public');
      expect(captured.source!.externalRef).toBe(SELECTED.fullName);
      // Private in, private out — before anything is derived from it.
      expect(secret.source!.visibility).toBe('private');

      // Scheduled the same way a CV is: a job in the same transaction as the source.
      expect(captured.job!.sourceId).toBe(captured.source!.id);
      expect(captured.job!.trigger).toBe('selection_changed');
    });

    it('does not re-capture an unchanged snapshot', async () => {
      const personId = await establishedIdentity();
      await connectAndSelect(personId);
      await identity.ingestSelectedRepositories(personId, CREDENTIALS);

      const again = await identity.refreshRepository(personId, CREDENTIALS, SELECTED.fullName);

      // Reconstructing unchanged material manufactures churn the product would then be tempted
      // to present as movement.
      expect(again.outcome).toBe('unchanged');
      const sources = await db.query(
        `SELECT 1 FROM identity_professional_source WHERE kind = 'github_repository'`,
      );
      expect(sources.rowCount).toBe(2);
    });

    it('records the user action behind every reconstruction', async () => {
      const personId = await establishedIdentity();
      await connectAndSelect(personId);
      await identity.ingestSelectedRepositories(personId, CREDENTIALS);

      const { rows } = await db.query<{ trigger: string }>(
        'SELECT DISTINCT trigger FROM identity_reconstruction_job ORDER BY trigger',
      );
      // No scheduled or periodic trigger exists to find. Joby does not crawl.
      expect(rows.map((r) => r.trigger)).toEqual(['selection_changed', 'source_added']);
    });
  });

  describe('the delta (UC10)', () => {
    /** Establish an identity, ingest the matching repository, reconstruct. Returns the delta. */
    async function deltaProposal(): Promise<{ personId: string; proposal: ReconstructionProposal }> {
      const personId = await establishedIdentity();
      await identity.connectGitHub(personId, 'octocat');
      await identity.selectRepositories(personId, [
        { fullName: SELECTED.fullName, selected: true, isPrivate: false },
      ]);
      await identity.ingestSelectedRepositories(personId, CREDENTIALS);
      await identity.runReconstruction();

      const proposals = await identity.listProposals(personId);
      const proposal = proposals.find((p) => p.extractor === 'github-metadata')!;
      return { personId, proposal };
    }

    it('recognises the repository as the project already held, not a new one', async () => {
      const { proposal } = await deltaProposal();
      const engagement = proposal.content.structure.find((s) => s.label === 'rota scheduler')!;

      // 'rota-scheduler' matched 'Rota scheduler'. Without this it would become a second project.
      expect(engagement.delta!.classification).toBe('enrichment');
      expect(engagement.delta!.matchedId).toBeTruthy();
      expect(engagement.delta!.changes).toEqual([{ field: 'startedAt', proposed: '2024-01-15' }]);
    });

    it('classifies genuinely new information as new', async () => {
      const { proposal } = await deltaProposal();
      const work = proposal.content.activities.find((a) => a.contribution?.includes('web UI'))!;

      expect(work.delta!.classification).toBe('new');
    });

    it('leaves canonical state untouched until the delta is reviewed', async () => {
      const { personId } = await deltaProposal();
      const state = await identity.getExplicitState(personId);

      // Reconstruction ran; nothing about the person changed.
      expect(state!.revision).toBe(1);
      const projects = state!.reconstructed.structure.filter((s) => s.label === 'Rota scheduler');
      expect(projects).toHaveLength(1);
      expect(projects[0]!.startedAt).toBeUndefined();
    });
  });

  describe('confirmation raises resolution instead of duplicating (UC10)', () => {
    async function enriched(): Promise<string> {
      const personId = await establishedIdentity();
      await identity.connectGitHub(personId, 'octocat');
      await identity.selectRepositories(personId, [
        { fullName: SELECTED.fullName, selected: true, isPrivate: false },
      ]);
      await identity.ingestSelectedRepositories(personId, CREDENTIALS);
      await identity.runReconstruction();

      const proposal = (await identity.listProposals(personId)).find(
        (p) => p.extractor === 'github-metadata',
      )!;
      const before = await identity.getExplicitState(personId);

      await identity.confirmReview({
        proposalId: proposal.id,
        expectedRevision: before!.revision,
        decisions: retainAll(proposal),
        confirmedBy: USER,
      });
      return personId;
    }

    it('enriches the existing project rather than creating a near-duplicate', async () => {
      const personId = await enriched();
      const state = await identity.getExplicitState(personId);

      const projects = state!.reconstructed.structure.filter(
        (s) => s.label.toLowerCase().replace(/[-_]/g, ' ') === 'rota scheduler',
      );

      // One project, now with a start date it did not have. Not two projects with the same name.
      expect(projects).toHaveLength(1);
      expect(projects[0]!.startedAt).toBe('2024-01-15');
      expect(state!.revision).toBe(2);
    });

    it('leaves the enriched fact traceable to both sources', async () => {
      const personId = await enriched();
      const state = await identity.getExplicitState(personId);
      const project = state!.reconstructed.structure.find((s) => s.label.includes('Rota'))!;

      const provenance = await identity.getProvenance('node', project.id);
      const sourceIds = new Set(provenance.map((p) => p.sourceId));

      // The CV and the repository both stand behind it now — which is what "higher resolution"
      // means: the same fact, better evidenced.
      expect(sourceIds.size).toBe(2);
    });

    it('adds the genuinely new activities from the repository', async () => {
      const personId = await enriched();
      const state = await identity.getExplicitState(personId);

      expect(state!.reconstructed.activities.map((a) => a.contribution)).toContain(
        'Constraint solver for shift allocation, with a web UI',
      );
      const capability = state!.reconstructed.activities.find((a) => a.capability)!;
      expect(capability.capability).toEqual(['TypeScript', 'SQL']);
      // Language-derived capability stays inferred through canonicalisation.
      expect(capability.epistemicStatus).toBe('inferred');
    });

    it('applies nothing when the delta is excluded', async () => {
      const personId = await establishedIdentity();
      await identity.connectGitHub(personId, 'octocat');
      await identity.selectRepositories(personId, [
        { fullName: SELECTED.fullName, selected: true, isPrivate: false },
      ]);
      await identity.ingestSelectedRepositories(personId, CREDENTIALS);
      await identity.runReconstruction();

      const proposal = (await identity.listProposals(personId)).find(
        (p) => p.extractor === 'github-metadata',
      )!;

      await identity.confirmReview({
        proposalId: proposal.id,
        expectedRevision: 1,
        decisions: allItemIds(proposal).map((itemId) => ({ itemId, decision: 'exclude' as const })),
        confirmedBy: USER,
      });

      const state = await identity.getExplicitState(personId);
      expect(state!.revision).toBe(1);
      expect(state!.reconstructed.structure.find((s) => s.label.includes('Rota'))!.startedAt).toBeUndefined();
      expect(state!.reconstructed.activities.map((a) => a.contribution)).not.toContain(
        'Constraint solver for shift allocation, with a web UI',
      );
    });
  });

  describe('conflicts are surfaced, never resolved silently', () => {
    /** Ingest the same repository twice, the second time with a different creation date. */
    async function conflicting(): Promise<{ personId: string; proposal: ReconstructionProposal }> {
      const personId = await establishedIdentity();
      await identity.connectGitHub(personId, 'octocat');
      await identity.selectRepositories(personId, [
        { fullName: SELECTED.fullName, selected: true, isPrivate: false },
      ]);

      // First snapshot: enriches the project with a start date.
      await identity.ingestSelectedRepositories(personId, CREDENTIALS);
      await identity.runReconstruction();
      let proposal = (await identity.listProposals(personId)).find((p) => p.extractor === 'github-metadata')!;
      await identity.confirmReview({
        proposalId: proposal.id,
        expectedRevision: 1,
        decisions: retainAll(proposal),
        confirmedBy: USER,
      });

      // The repository now reports a different creation date. Two sources disagree.
      const moved = new FakeGitHubClient([{ ...SELECTED, createdAt: '2023-03-01T10:00:00Z', pushedAt: '2024-09-01T10:00:00Z' }]);
      const withMoved = createIdentityRuntime({
        db,
        extractor: new DeterministicCvExtractor(),
        githubClient: moved,
      });
      await withMoved.refreshRepository(personId, CREDENTIALS, SELECTED.fullName);
      await withMoved.runReconstruction();

      const proposals = await withMoved.listProposals(personId);
      proposal = proposals.filter((p) => p.extractor === 'github-metadata')[0]!;
      return { personId, proposal };
    }

    it('marks the disagreement and carries both values', async () => {
      const { proposal } = await conflicting();
      const engagement = proposal.content.structure.find((s) => s.label === 'rota scheduler')!;

      expect(engagement.delta!.classification).toBe('conflict');
      expect(engagement.delta!.changes).toEqual([
        { field: 'startedAt', current: '2024-01-15', proposed: '2023-03-01' },
      ]);
    });

    it('keeps the existing value when the user rejects the new one', async () => {
      const { personId, proposal } = await conflicting();
      const before = await identity.getExplicitState(personId);

      await identity.confirmReview({
        proposalId: proposal.id,
        expectedRevision: before!.revision,
        decisions: allItemIds(proposal).map((itemId) => ({ itemId, decision: 'reject' as const })),
        confirmedBy: USER,
      });

      const after = await identity.getExplicitState(personId);
      expect(after!.reconstructed.structure.find((s) => s.label.includes('Rota'))!.startedAt).toBe('2024-01-15');
    });

    it('applies the new value only when the user chooses it', async () => {
      const { personId, proposal } = await conflicting();
      const before = await identity.getExplicitState(personId);

      await identity.confirmReview({
        proposalId: proposal.id,
        expectedRevision: before!.revision,
        decisions: retainAll(proposal),
        confirmedBy: USER,
      });

      const after = await identity.getExplicitState(personId);
      expect(after!.reconstructed.structure.find((s) => s.label.includes('Rota'))!.startedAt).toBe('2023-03-01');

      // And the decision is on the record, so the change is explainable later.
      const review = await identity.getReview(proposal.id);
      expect(review!.decisions.some((d) => d.appliedId)).toBe(true);
    });
  });

  describe('idempotency under retry and duplicate delivery', () => {
    it('produces one proposal when the same job is delivered twice', async () => {
      const personId = await establishedIdentity();
      await identity.connectGitHub(personId, 'octocat');
      await identity.selectRepositories(personId, [
        { fullName: SELECTED.fullName, selected: true, isPrivate: false },
      ]);
      const ingested = await identity.ingestSelectedRepositories(personId, CREDENTIALS);
      const job = ingested[0]!.job!;

      await identity.runReconstruction();
      await db.query(
        `UPDATE identity_reconstruction_job SET status = 'pending', claimed_at = NULL WHERE id = $1`,
        [job.id],
      );
      const second = await identity.runReconstruction();

      expect(second).toMatchObject({ claimed: 1, skipped: 1, succeeded: 0 });
      const proposals = await identity.listProposals(personId);
      expect(proposals.filter((p) => p.extractor === 'github-metadata')).toHaveLength(1);
    });

    it('ingesting the same selection twice creates no second source or job', async () => {
      const personId = await establishedIdentity();
      await identity.connectGitHub(personId, 'octocat');
      await identity.selectRepositories(personId, [
        { fullName: SELECTED.fullName, selected: true, isPrivate: false },
      ]);

      await identity.ingestSelectedRepositories(personId, CREDENTIALS);
      const second = await identity.ingestSelectedRepositories(personId, CREDENTIALS);

      expect(second[0]!.outcome).toBe('unchanged');
      const jobs = await db.query(
        `SELECT 1 FROM identity_reconstruction_job j
           JOIN identity_professional_source s ON s.id = j.source_id
          WHERE s.kind = 'github_repository'`,
      );
      expect(jobs.rowCount).toBe(1);
    });
  });

  describe('the Permanent Identity View (UC11)', () => {
    it('projects familiar sections from Reconstructed State, storing nothing', async () => {
      const personId = await establishedIdentity();
      const view = await identity.getPermanentIdentityView(personId);

      expect(view!.education.map((e) => e.title)).toContain('University of Bristol');
      expect(view!.projects.map((p) => p.title)).toContain('Rota scheduler');
      expect(view!.revision).toBe(1);

      // Still no table behind any of it. (`%view%` is not checked — it matches `identity_review`.)
      const { rows } = await db.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public'
            AND (table_name LIKE '%education%' OR table_name LIKE '%experience%'
                 OR table_name LIKE '%project%' OR table_name LIKE '%skill%'
                 OR table_name LIKE '%identity_view%')`,
      );
      expect(rows).toHaveLength(0);
    });

    it('derives skills from activities, carrying what evidences each one', async () => {
      const personId = await establishedIdentity();
      await identity.connectGitHub(personId, 'octocat');
      await identity.selectRepositories(personId, [
        { fullName: SELECTED.fullName, selected: true, isPrivate: false },
      ]);
      await identity.ingestSelectedRepositories(personId, CREDENTIALS);
      await identity.runReconstruction();

      const proposal = (await identity.listProposals(personId)).find(
        (p) => p.extractor === 'github-metadata',
      )!;
      await identity.confirmReview({
        proposalId: proposal.id,
        expectedRevision: 1,
        decisions: retainAll(proposal),
        confirmedBy: USER,
      });

      const view = await identity.getPermanentIdentityView(personId);
      const typescript = view!.skills.find((s) => s.capability === 'TypeScript')!;

      // A skill is never a claim standing on its own.
      expect(typescript.evidencedBy.length).toBeGreaterThan(0);
      expect(view!.skills.map((s) => s.capability)).toEqual(['TypeScript', 'SQL']);

      // The capability-only activity carrying those languages is not itself a project: it records
      // what work required, not work that was done. Listing it would invent an accomplishment.
      expect(view!.projects.map((p) => p.title)).not.toContain('Languages used in rota scheduler');
    });

    it('keeps facts from a private source private through the projection', async () => {
      const personId = await establishedIdentity();
      await identity.connectGitHub(personId, 'octocat');
      await identity.selectRepositories(personId, [
        { fullName: PRIVATE_REPO.fullName, selected: true, isPrivate: true },
      ]);
      await identity.ingestSelectedRepositories(personId, CREDENTIALS);
      await identity.runReconstruction();

      const proposal = (await identity.listProposals(personId)).find(
        (p) => p.extractor === 'github-metadata',
      )!;
      await identity.confirmReview({
        proposalId: proposal.id,
        expectedRevision: 1,
        decisions: retainAll(proposal),
        confirmedBy: USER,
      });

      const view = await identity.getPermanentIdentityView(personId);
      const thesis = view!.projects.find((p) => p.title === 'secret thesis')!;

      expect(thesis.visibility).toBe('private');
      // A skill evidenced only by a private repository is private too.
      expect(view!.skills.find((s) => s.capability === 'TeX')!.visibility).toBe('private');
      // The CV is private, so everything derived from it is private as well.
      expect(view!.education.every((entry) => entry.visibility === 'private')).toBe(true);
    });
  });
});
