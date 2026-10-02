/**
 * Identity Slice 2 (UC04–UC07), against a real database.
 *
 * The invariant hierarchy under test:
 *
 *  1. AI output becomes canonical **only** through a reviewed-set confirmation.
 *  2. Exactly the retained set is applied, atomically.
 *  3. Excluded things stay excluded.
 *  4. Sparse activities survive canonicalisation.
 *  5. Every confirmed fact traces to the source passage behind it.
 *  6. Corrections change R, and never PCI.
 *  7. Concurrent writers cannot silently overwrite each other.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '@joby/database';
import {
  ConcurrencyError,
  IncompleteReviewError,
  InvalidCorrectionError,
  AlreadyConfirmedError,
  DanglingRelationError,
  UnknownProposalItemError,
  type ActivityNode,
  type ReconstructionProposal,
  type ReviewDecisionInput,
} from '@joby/identity';
import {
  createIdentityRuntime,
  DeterministicCvExtractor,
  type DurableIdentityRuntime,
} from '@joby/identity/runtime';

import { connectTestDatabase, hasDatabase, truncateAll, truncateIdentity } from './support/database';

const describeIntegration = hasDatabase ? describe : (describe.skip.bind(null) as typeof describe);

if (!hasDatabase) {
  console.warn('\n[tests] SKIPPING identity explicit-state tests: DATABASE_URL is not set.\n');
}

const CV = [
  'Education',
  'University of Bristol, 2022 - 2026',
  '- Studied compilers',
  '',
  'Experience',
  'Placement at Acme Ltd, 2024',
  '- Contributed to the payments migration',
  '- Helped build an internal dashboard',
].join('\n');

const USER = 'user-1';

describeIntegration('identity: review → canonical Explicit State → correction', () => {
  let db: Database;
  let identity: DurableIdentityRuntime;

  beforeAll(async () => {
    db = await connectTestDatabase();
  });

  afterAll(async () => {
    await db?.close();
  });

  beforeEach(async () => {
    await truncateIdentity(db);
    await truncateAll(db);
    identity = createIdentityRuntime({ db, extractor: new DeterministicCvExtractor() });
  });

  /** Capture and reconstruct, leaving a proposal ready to review. */
  async function reconstructed(): Promise<{ personId: string; proposal: ReconstructionProposal }> {
    const { personId } = await identity.captureSource({
      contentType: 'text/plain',
      content: Buffer.from(CV, 'utf8'),
    });
    await identity.runReconstruction();
    const proposal = (await identity.listProposals(personId))[0]!;
    return { personId, proposal };
  }

  const allItemIds = (proposal: ReconstructionProposal): string[] => [
    ...proposal.content.structure.map((s) => s.id),
    ...proposal.content.activities.map((a) => a.id),
    ...proposal.content.relations.map((r) => r.id),
  ];

  const retainAll = (proposal: ReconstructionProposal): ReviewDecisionInput[] =>
    allItemIds(proposal).map((itemId) => ({ itemId, decision: 'retain' as const }));

  describe('the gate between proposal and truth', () => {
    it('leaves Explicit State empty until a review is confirmed', async () => {
      const { personId } = await reconstructed();

      const before = await identity.getExplicitState(personId);
      expect(before!.reconstructed.structure).toHaveLength(0);
      expect(before!.reconstructed.activities).toHaveLength(0);
      expect(before!.revision).toBe(0);
    });

    it('refuses to confirm when any proposed item has no decision', async () => {
      const { proposal } = await reconstructed();
      const decisions = retainAll(proposal);
      const dropped = decisions.pop()!;

      // The anti-bulk-accept guard: an item with no decision cannot have been shown to the user.
      await expect(
        identity.confirmReview({
          proposalId: proposal.id,
          expectedRevision: 0,
          decisions,
          confirmedBy: USER,
        }),
      ).rejects.toThrow(IncompleteReviewError);

      await expect(
        identity.confirmReview({
          proposalId: proposal.id,
          expectedRevision: 0,
          decisions,
          confirmedBy: USER,
        }),
      ).rejects.toThrow(new RegExp(dropped.itemId));
    });

    it('rejects decisions about items the proposal never contained', async () => {
      const { proposal } = await reconstructed();
      await expect(
        identity.confirmReview({
          proposalId: proposal.id,
          expectedRevision: 0,
          decisions: [...retainAll(proposal), { itemId: 'invented', decision: 'retain' }],
          confirmedBy: USER,
        }),
      ).rejects.toThrow(UnknownProposalItemError);
    });

    it('cannot confirm the same proposal twice', async () => {
      const { proposal } = await reconstructed();
      await identity.confirmReview({
        proposalId: proposal.id,
        expectedRevision: 0,
        decisions: retainAll(proposal),
        confirmedBy: USER,
      });

      await expect(
        identity.confirmReview({
          proposalId: proposal.id,
          expectedRevision: 1,
          decisions: retainAll(proposal),
          confirmedBy: USER,
        }),
      ).rejects.toThrow(AlreadyConfirmedError);
    });

    it('applies nothing when the confirmation is rejected', async () => {
      const { personId, proposal } = await reconstructed();
      const decisions = retainAll(proposal);
      decisions.pop();

      await expect(
        identity.confirmReview({ proposalId: proposal.id, expectedRevision: 0, decisions, confirmedBy: USER }),
      ).rejects.toThrow();

      const state = await identity.getExplicitState(personId);
      expect(state!.reconstructed.structure).toHaveLength(0);
      expect(state!.reconstructed.activities).toHaveLength(0);
      expect(state!.revision).toBe(0);
    });
  });

  describe('confirmation applies exactly the retained set', () => {
    it('applies retained items and omits excluded and rejected ones', async () => {
      const { personId, proposal } = await reconstructed();

      const excluded = proposal.content.activities.find((a) => a.label.startsWith('Helped build'))!;
      const rejected = proposal.content.structure.find((s) => s.label === 'University of Bristol')!;
      // Relations depending on an omitted endpoint must be omitted too, explicitly.
      const orphanedRelations = proposal.content.relations.filter(
        (r) => [r.fromId, r.toId].includes(excluded.id) || [r.fromId, r.toId].includes(rejected.id),
      );
      const omitted = new Set([excluded.id, rejected.id, ...orphanedRelations.map((r) => r.id)]);

      const decisions: ReviewDecisionInput[] = allItemIds(proposal).map((itemId) => ({
        itemId,
        decision: omitted.has(itemId)
          ? itemId === rejected.id
            ? ('reject' as const)
            : ('exclude' as const)
          : ('retain' as const),
      }));

      const result = await identity.confirmReview({
        proposalId: proposal.id,
        expectedRevision: 0,
        decisions,
        confirmedBy: USER,
      });

      const state = await identity.getExplicitState(personId);
      const labels = [
        ...state!.reconstructed.structure.map((s) => s.label),
        ...state!.reconstructed.activities.map((a) => a.label),
      ];

      expect(labels).toContain('Placement at Acme Ltd');
      expect(labels).toContain('Contributed to the payments migration');
      // Excluded and rejected never appear — not hidden, not soft-deleted. Absent.
      expect(labels).not.toContain('Helped build an internal dashboard');
      expect(labels).not.toContain('University of Bristol');
      expect(result.excludedItemIds).toHaveLength(omitted.size);
      expect(state!.revision).toBe(1);
    });

    it('refuses a retained relation whose endpoint was excluded, rather than dropping it silently', async () => {
      const { proposal } = await reconstructed();
      const relation = proposal.content.relations[0]!;

      // Exclude the endpoint but keep the relation: the applied set would not be the reviewed set.
      const decisions: ReviewDecisionInput[] = allItemIds(proposal).map((itemId) => ({
        itemId,
        decision: itemId === relation.fromId ? ('exclude' as const) : ('retain' as const),
      }));

      await expect(
        identity.confirmReview({ proposalId: proposal.id, expectedRevision: 0, decisions, confirmedBy: USER }),
      ).rejects.toThrow(DanglingRelationError);
    });

    it('applies the edited version, not the proposed one', async () => {
      const { personId, proposal } = await reconstructed();
      const activity = proposal.content.activities.find((a) => a.label.startsWith('Contributed'))!;

      const decisions: ReviewDecisionInput[] = allItemIds(proposal).map((itemId) => ({
        itemId,
        decision: itemId === activity.id ? ('edit' as const) : ('retain' as const),
        ...(itemId === activity.id
          ? {
              edit: {
                contribution: 'Contributed to the payments migration, focusing on reconciliation',
                consequence: 'Settlement time fell by 40%',
              },
            }
          : {}),
      }));

      await identity.confirmReview({
        proposalId: proposal.id,
        expectedRevision: 0,
        decisions,
        confirmedBy: USER,
      });

      const state = await identity.getExplicitState(personId);
      const applied = state!.reconstructed.activities.find((a) =>
        a.contribution?.includes('reconciliation'),
      )!;

      expect(applied.consequence).toBe('Settlement time fell by 40%');
      expect(state!.reconstructed.activities.map((a) => a.contribution)).not.toContain(
        'Contributed to the payments migration',
      );
    });

    it('adds user supplements the proposal never contained', async () => {
      const { personId, proposal } = await reconstructed();

      await identity.confirmReview({
        proposalId: proposal.id,
        expectedRevision: 0,
        decisions: retainAll(proposal),
        supplements: [
          { type: 'activity', label: 'Ran the university coding society', contribution: 'Ran the society' },
        ],
        confirmedBy: USER,
      });

      const state = await identity.getExplicitState(personId);
      const supplement = state!.reconstructed.activities.find((a) => a.label.includes('coding society'))!;
      expect(supplement).toBeTruthy();

      // A user-authored fact has provenance too — just not a source quote, because no source said it.
      const provenance = await identity.getProvenance('node', supplement.id);
      expect(provenance[0]!.origin).toBe('user_supplement');
      expect(provenance[0]!.quote).toBeUndefined();
    });

    it('changes nothing and publishes nothing when everything is excluded', async () => {
      const { personId, proposal } = await reconstructed();

      const result = await identity.confirmReview({
        proposalId: proposal.id,
        expectedRevision: 0,
        decisions: allItemIds(proposal).map((itemId) => ({ itemId, decision: 'exclude' as const })),
        confirmedBy: USER,
      });

      expect(result.unchanged).toBe(true);
      const state = await identity.getExplicitState(personId);
      expect(state!.revision).toBe(0);

      // IdentityUpdated means canonical Explicit State changed. Nothing changed.
      const outbox = await db.query('SELECT 1 FROM event_outbox');
      expect(outbox.rowCount).toBe(0);
    });
  });

  describe('sparse activities survive canonicalisation', () => {
    it('keeps absent components absent through confirmation and retrieval', async () => {
      const { personId, proposal } = await reconstructed();

      await identity.confirmReview({
        proposalId: proposal.id,
        expectedRevision: 0,
        decisions: retainAll(proposal),
        confirmedBy: USER,
      });

      const state = await identity.getExplicitState(personId);
      const activity = state!.reconstructed.activities.find((a) =>
        a.contribution?.startsWith('Contributed'),
      )!;

      expect(activity.contribution).toBe('Contributed to the payments migration');
      // The CV stated no outcome and no tools. Canonicalisation must not have supplied either.
      expect(activity.consequence).toBeUndefined();
      expect(activity.capability).toBeUndefined();
      expect('consequence' in activity).toBe(false);
    });

    it('refuses an activity with no components at all, at the database level', async () => {
      const { personId } = await reconstructed();
      const { rows } = await db.query<{ id: string }>('SELECT id FROM identity_person WHERE id = $1', [
        personId,
      ]);
      expect(rows).toHaveLength(1);

      // Sparse is valid; empty is not — and the constraint, not just the code, is what says so.
      await expect(
        db.query(
          `INSERT INTO identity_explicit_node (id, person_id, node_type, label, epistemic_status)
           VALUES ('empty', $1, 'activity', 'Nothing at all', 'observed')`,
          [personId],
        ),
      ).rejects.toThrow(/identity_node_shape/);
    });
  });

  describe('provenance and history', () => {
    it('traces every confirmed fact back to the source passage behind it', async () => {
      const { personId, proposal } = await reconstructed();
      await identity.confirmReview({
        proposalId: proposal.id,
        expectedRevision: 0,
        decisions: retainAll(proposal),
        confirmedBy: USER,
      });

      const state = await identity.getExplicitState(personId);
      const nodes = [...state!.reconstructed.structure, ...state!.reconstructed.activities];
      expect(nodes.length).toBeGreaterThan(0);

      for (const node of nodes) {
        const provenance = await identity.getProvenance('node', node.id);
        expect(provenance.length).toBeGreaterThan(0);

        const [first] = provenance;
        expect(first!.origin).toBe('reconstruction');
        expect(first!.sourceId).toBe(proposal.sourceId);
        // The quote must really be in the CV; provenance you cannot check is not provenance.
        expect(CV).toContain(first!.quote!);
      }
    });

    it('records what was proposed, what changed, and what was excluded', async () => {
      const { proposal } = await reconstructed();
      const edited = proposal.content.activities[0]!;
      const excluded = proposal.content.activities[1]!;
      const orphaned = proposal.content.relations
        .filter((r) => [r.fromId, r.toId].includes(excluded.id))
        .map((r) => r.id);

      const decisions: ReviewDecisionInput[] = allItemIds(proposal).map((itemId) => {
        if (itemId === edited.id) return { itemId, decision: 'edit', edit: { label: 'Reworded by me' } };
        if (itemId === excluded.id || orphaned.includes(itemId)) return { itemId, decision: 'exclude' };
        return { itemId, decision: 'retain' };
      });

      await identity.confirmReview({
        proposalId: proposal.id,
        expectedRevision: 0,
        decisions,
        confirmedBy: USER,
      });

      const review = await identity.getReview(proposal.id);
      expect(review!.confirmedBy).toBe(USER);
      expect(review!.decisions).toHaveLength(decisions.length);

      const editDecision = review!.decisions.find((d) => d.proposalItemId === edited.id)!;
      expect(editDecision.decision).toBe('edit');
      // Both sides survive: what the model said, and what the user made of it.
      expect((editDecision.proposed as { label: string }).label).toBe(edited.label);
      expect((editDecision.edited as { label: string }).label).toBe('Reworded by me');
      expect(editDecision.appliedId).toBeTruthy();

      const excludedDecision = review!.decisions.find((d) => d.proposalItemId === excluded.id)!;
      expect(excludedDecision.decision).toBe('exclude');
      expect(excludedDecision.appliedId).toBeUndefined();
    });

    it('marks the source confirmed only after review, keeping the three facts distinct', async () => {
      const { personId, proposal } = await reconstructed();
      const sources = await db.query<{ id: string }>(
        'SELECT id FROM identity_professional_source WHERE person_id = $1',
        [personId],
      );
      const sourceId = sources.rows[0]!.id;

      const before = await identity.getSourceLifecycle(sourceId);
      expect(before!.reconstruction.status).toBe('succeeded');
      expect(before!.confirmed).toBe(false);

      await identity.confirmReview({
        proposalId: proposal.id,
        expectedRevision: 0,
        decisions: retainAll(proposal),
        confirmedBy: USER,
      });

      const after = await identity.getSourceLifecycle(sourceId);
      expect(after!.captured).toBe(true);
      expect(after!.confirmed).toBe(true);
      expect(after!.reviewId).toBeTruthy();
    });

    it('publishes IdentityUpdated exactly once, only on a change that applied', async () => {
      const { proposal } = await reconstructed();
      await identity.confirmReview({
        proposalId: proposal.id,
        expectedRevision: 0,
        decisions: retainAll(proposal),
        confirmedBy: USER,
      });

      const { rows } = await db.query<{ event_name: string; envelope: Record<string, unknown> }>(
        'SELECT event_name, envelope FROM event_outbox',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.event_name).toBe('IdentityUpdated');

      const payload = (rows[0]!.envelope as { payload: { revision: number; userConfirmed: boolean } }).payload;
      expect(payload.revision).toBe(1);
      expect(payload.userConfirmed).toBe(true);
    });
  });

  describe('correction (UC07)', () => {
    async function confirmed(): Promise<{ personId: string; activity: ActivityNode }> {
      const { personId, proposal } = await reconstructed();
      await identity.confirmReview({
        proposalId: proposal.id,
        expectedRevision: 0,
        decisions: retainAll(proposal),
        confirmedBy: USER,
      });
      const state = await identity.getExplicitState(personId);
      return { personId, activity: state!.reconstructed.activities[0]! };
    }

    it('corrects a fact without another reconstruction', async () => {
      const { personId, activity } = await confirmed();

      const result = await identity.correctNode({
        nodeId: activity.id,
        expectedRevision: activity.revision,
        correctedBy: USER,
        changes: { consequence: 'Cut settlement time by 40%' },
      });

      expect((result.node as ActivityNode).consequence).toBe('Cut settlement time by 40%');

      const state = await identity.getExplicitState(personId);
      const corrected = state!.reconstructed.activities.find((a) => a.id === activity.id)!;
      expect(corrected.consequence).toBe('Cut settlement time by 40%');
      // The contribution was not touched by a correction to a different component.
      expect(corrected.contribution).toBe(activity.contribution);

      // No new source was captured and no reconstruction ran.
      const jobs = await db.query('SELECT 1 FROM identity_reconstruction_job');
      expect(jobs.rowCount).toBe(1);
    });

    it('keeps the original provenance and adds the correction to it', async () => {
      const { activity } = await confirmed();
      await identity.correctNode({
        nodeId: activity.id,
        expectedRevision: activity.revision,
        correctedBy: USER,
        changes: { label: 'Payments migration work' },
      });

      const provenance = await identity.getProvenance('node', activity.id);
      // Where it came from is still recorded — a correction is a change to history, not an erasure.
      expect(provenance.some((p) => p.origin === 'reconstruction')).toBe(true);
      expect(provenance.some((p) => p.origin === 'user_correction')).toBe(true);
    });

    it('records before and after, so a correction can be explained later', async () => {
      const { personId, activity } = await confirmed();
      await identity.correctNode({
        nodeId: activity.id,
        expectedRevision: activity.revision,
        correctedBy: USER,
        changes: { label: 'Payments migration work' },
      });

      const [correction] = await identity.listCorrections(personId);
      expect(correction!.operation).toBe('update');
      expect((correction!.before as { label: string }).label).toBe(activity.label);
      expect((correction!.after as { label: string }).label).toBe('Payments migration work');
    });

    it('adds and removes facts directly', async () => {
      const { personId } = await confirmed();

      const added = await identity.addNode({
        personId,
        type: 'activity',
        label: 'Volunteered as a mentor',
        contribution: 'Mentored two first-year students',
        correctedBy: USER,
      });

      let state = await identity.getExplicitState(personId);
      expect(state!.reconstructed.activities.map((a) => a.label)).toContain('Volunteered as a mentor');

      await identity.removeNode({
        nodeId: added.node!.id,
        expectedRevision: added.node!.revision,
        correctedBy: USER,
      });

      state = await identity.getExplicitState(personId);
      expect(state!.reconstructed.activities.map((a) => a.label)).not.toContain('Volunteered as a mentor');
    });

    it('removes the relations that pointed at a removed fact', async () => {
      const { personId, proposal } = await reconstructed();
      await identity.confirmReview({
        proposalId: proposal.id,
        expectedRevision: 0,
        decisions: retainAll(proposal),
        confirmedBy: USER,
      });

      const before = await identity.getExplicitState(personId);
      const structure = before!.reconstructed.structure[0]!;
      const attached = before!.reconstructed.relations.filter(
        (r) => r.fromNodeId === structure.id || r.toNodeId === structure.id,
      );
      expect(attached.length).toBeGreaterThan(0);

      await identity.removeNode({
        nodeId: structure.id,
        expectedRevision: structure.revision,
        correctedBy: USER,
      });

      const after = await identity.getExplicitState(personId);
      // An edge to a fact that no longer exists claims a connection that no longer exists.
      expect(after!.reconstructed.relations.map((r) => r.id)).not.toContain(attached[0]!.id);
    });

    it('refuses to empty an activity of all three components', async () => {
      const { activity } = await confirmed();
      await expect(
        identity.correctNode({
          nodeId: activity.id,
          expectedRevision: activity.revision,
          correctedBy: USER,
          changes: { contribution: null, capability: null, consequence: null },
        }),
      ).rejects.toThrow(InvalidCorrectionError);
    });

    it('refuses to put activity components on a structure node', async () => {
      const { personId } = await confirmed();
      const state = await identity.getExplicitState(personId);
      const structure = state!.reconstructed.structure[0]!;

      await expect(
        identity.correctNode({
          nodeId: structure.id,
          expectedRevision: structure.revision,
          correctedBy: USER,
          changes: { contribution: 'this is not a thing a structure has' },
        }),
      ).rejects.toThrow(InvalidCorrectionError);
    });
  });

  describe('correction does not touch Learned State', () => {
    it('leaves PCI untouched and absent', async () => {
      const { personId, proposal } = await reconstructed();
      await identity.confirmReview({
        proposalId: proposal.id,
        expectedRevision: 0,
        decisions: retainAll(proposal),
        confirmedBy: USER,
      });

      const state = await identity.getExplicitState(personId);
      await identity.correctNode({
        nodeId: state!.reconstructed.activities[0]!.id,
        expectedRevision: state!.reconstructed.activities[0]!.revision,
        correctedBy: USER,
        changes: { consequence: 'Something the user knows' },
      });

      const durable = await identity.getDurableIdentity(personId);
      // No learned component is returned: PCI is not Durable Identity's to hold (ADR 0030).
      expect('learned' in durable!).toBe(false);
      expect(durable!.explicit.stated).toEqual({});

      // No learning table was created or written by any of the above.
      const { rows } = await db.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND (table_name LIKE '%learned%' OR table_name LIKE '%pci%'
                                             OR table_name LIKE 'memory_%')`,
      );
      expect(rows).toHaveLength(0);
    });

    it('keeps familiar categories out of the schema entirely', async () => {
      // Education / Experience / Projects / Skills are projections (ADR 0009), never stores.
      const { rows } = await db.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public'
            AND (table_name LIKE '%education%' OR table_name LIKE '%experience%'
                 OR table_name LIKE '%project%' OR table_name LIKE '%skill%')`,
      );
      expect(rows).toHaveLength(0);
    });
  });

  describe('concurrency', () => {
    it('rejects a confirmation made against a stale identity revision', async () => {
      const { personId, proposal } = await reconstructed();

      // Someone else moved the identity on between the user reading it and confirming.
      await identity.addNode({
        personId,
        type: 'activity',
        label: 'Added elsewhere',
        contribution: 'Something',
        correctedBy: 'user-2',
      });

      await expect(
        identity.confirmReview({
          proposalId: proposal.id,
          expectedRevision: 0,
          decisions: retainAll(proposal),
          confirmedBy: USER,
        }),
      ).rejects.toThrow(ConcurrencyError);
    });

    it('rejects a correction made against a stale node revision', async () => {
      const { personId, proposal } = await reconstructed();
      await identity.confirmReview({
        proposalId: proposal.id,
        expectedRevision: 0,
        decisions: retainAll(proposal),
        confirmedBy: USER,
      });

      const state = await identity.getExplicitState(personId);
      const activity = state!.reconstructed.activities[0]!;

      await identity.correctNode({
        nodeId: activity.id,
        expectedRevision: activity.revision,
        correctedBy: USER,
        changes: { label: 'First writer wins' },
      });

      // The second writer read the same revision and must not overwrite the first silently.
      await expect(
        identity.correctNode({
          nodeId: activity.id,
          expectedRevision: activity.revision,
          correctedBy: 'user-2',
          changes: { label: 'Second writer clobbers' },
        }),
      ).rejects.toThrow(ConcurrencyError);

      const after = await identity.getNode(activity.id);
      expect(after!.label).toBe('First writer wins');
    });

    it('lets two corrections to different facts proceed', async () => {
      const { personId, proposal } = await reconstructed();
      await identity.confirmReview({
        proposalId: proposal.id,
        expectedRevision: 0,
        decisions: retainAll(proposal),
        confirmedBy: USER,
      });

      const state = await identity.getExplicitState(personId);
      const [first, second] = state!.reconstructed.activities;

      // Node-level guards, so unrelated edits do not fight over one identity-wide lock.
      await Promise.all([
        identity.correctNode({
          nodeId: first!.id,
          expectedRevision: first!.revision,
          correctedBy: USER,
          changes: { label: 'A' },
        }),
        identity.correctNode({
          nodeId: second!.id,
          expectedRevision: second!.revision,
          correctedBy: USER,
          changes: { label: 'B' },
        }),
      ]);

      expect((await identity.getNode(first!.id))!.label).toBe('A');
      expect((await identity.getNode(second!.id))!.label).toBe('B');
    });
  });
});
