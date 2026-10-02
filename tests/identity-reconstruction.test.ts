/**
 * Identity Slice 1 (UC01–UC03), against a real database.
 *
 * The invariant under test, above all others: **no AI-generated fact becomes canonical Explicit
 * State.** Everything else here — atomic capture, failure preserving the source, idempotency —
 * exists so that invariant survives the ways this pipeline actually breaks.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '@joby/database';
import { UnsupportedSourceError } from '@joby/identity';
// Construction and adapters come from the runtime entry point, the same way `apps/*` composes them.
import {
  DeterministicCvExtractor,
  createIdentityRuntime,
  type DurableIdentityRuntime,
  type CvExtractor,
  type ExtractionResult,
} from '@joby/identity/runtime';

import { connectTestDatabase, hasDatabase, truncateIdentity } from './support/database';

const describeIntegration = hasDatabase ? describe : (describe.skip.bind(null) as typeof describe);

if (!hasDatabase) {
  console.warn(
    '\n[tests] SKIPPING identity integration tests: DATABASE_URL is not set.\n' +
      '        Run `pnpm db:up` and set DATABASE_URL to run them.\n',
  );
}

const CV = [
  'Education',
  'University of Bristol, 2022 - 2026',
  '- Studied compilers',
  '',
  'Experience',
  'Placement at Acme Ltd, 2024',
  '- Contributed to the payments migration',
].join('\n');

const cvBuffer = () => Buffer.from(CV, 'utf8');

/** An extractor that always fails, for the failure path. */
class FailingExtractor implements CvExtractor {
  readonly name = 'failing';
  async extract(): Promise<ExtractionResult> {
    throw new Error('model unavailable');
  }
}

describeIntegration('identity: source → reconstruction → proposal', () => {
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
    identity = createIdentityRuntime({ db, extractor: new DeterministicCvExtractor() });
  });

  describe('capture (UC01–UC02)', () => {
    it('creates the Person and Durable Identity root on first capture', async () => {
      const result = await identity.captureSource({ contentType: 'text/plain', content: cvBuffer() });

      const person = await identity.getPerson(result.personId);
      expect(person?.durableIdentityId).toBeTruthy();

      // No account, email or verification data may exist anywhere in the ontology (ADR 0010).
      const { rows } = await db.query<{ column_name: string }>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_name IN (
            'identity_person',
            'identity_durable_identity',
            'identity_explicit_node',
            'identity_relation',
            'identity_provenance'
          )`,
      );
      const names = rows.map((r) => r.column_name).join(' ');
      expect(names).not.toMatch(/email|verif|password|token|account/i);
    });

    it('preserves the CV byte for byte, as a source and not as identity', async () => {
      const { source } = await identity.captureSource({
        contentType: 'text/plain',
        content: cvBuffer(),
        filename: 'cv.txt',
      });

      const { rows } = await db.query<{ content: Buffer }>(
        'SELECT content FROM identity_professional_source WHERE id = $1',
        [source.id],
      );
      expect(rows[0]!.content.toString('utf8')).toBe(CV);
      expect(source.byteSize).toBe(cvBuffer().byteLength);
      expect(source.visibility).toBe('private');
    });

    it('writes the source and its reconstruction job in one transaction', async () => {
      const { source, job } = await identity.captureSource({ contentType: 'text/plain', content: cvBuffer() });

      // A captured source with no scheduled reconstruction is the state this must make unreachable.
      expect(job.sourceId).toBe(source.id);
      expect(job.status).toBe('pending');

      const orphans = await db.query(
        `SELECT s.id FROM identity_professional_source s
           LEFT JOIN identity_reconstruction_job j ON j.source_id = s.id
          WHERE j.id IS NULL`,
      );
      expect(orphans.rowCount).toBe(0);
    });

    it('does not capture a second copy, or a second job, for the same bytes', async () => {
      const first = await identity.captureSource({ contentType: 'text/plain', content: cvBuffer() });
      const second = await identity.captureSource({
        personId: first.personId,
        contentType: 'text/plain',
        content: cvBuffer(),
      });

      expect(second.duplicate).toBe(true);
      expect(second.source.id).toBe(first.source.id);
      expect(second.job.id).toBe(first.job.id);
      expect((await db.query('SELECT 1 FROM identity_professional_source')).rowCount).toBe(1);
    });

    it('retains a PDF verbatim while reconstruction reads its extracted text layer', async () => {
      const pdf = Buffer.from('%PDF-1.7\noriginal CV bytes');
      const { personId, source } = await identity.captureSource({
        contentType: 'application/pdf', content: pdf, extractedText: cvBuffer(), filename: 'cv.pdf',
      });
      const { rows } = await db.query<{ content: Buffer; extracted_text: Buffer }>(
        'SELECT content, extracted_text FROM identity_professional_source WHERE id = $1', [source.id],
      );
      expect(rows[0]!.content).toEqual(pdf);
      expect(rows[0]!.extracted_text).toEqual(cvBuffer());

      expect(await identity.runReconstruction()).toEqual({ claimed: 1, succeeded: 1, failed: 0, skipped: 0 });
      expect(await identity.listProposals(personId)).toHaveLength(1);
    });

    it('rejects an unsupported content type without storing anything', async () => {
      await expect(
        identity.captureSource({ contentType: 'application/msword', content: cvBuffer() }),
      ).rejects.toThrow(UnsupportedSourceError);

      expect((await db.query('SELECT 1 FROM identity_person')).rowCount).toBe(0);
    });

    it('rejects a PDF without extracted text without storing anything', async () => {
      await expect(identity.captureSource({ contentType: 'application/pdf', content: Buffer.from('%PDF') }))
        .rejects.toThrow('needs extracted text');
      expect((await db.query('SELECT 1 FROM identity_person')).rowCount).toBe(0);
    });
  });

  describe('reconstruction (UC03)', () => {
    it('produces a reviewable proposal and leaves canonical state untouched', async () => {
      const { personId, source, job } = await identity.captureSource({
        contentType: 'text/plain',
        content: cvBuffer(),
      });

      const run = await identity.runReconstruction();
      expect(run).toEqual({ claimed: 1, succeeded: 1, failed: 0, skipped: 0 });

      const proposals = await identity.listProposals(personId);
      expect(proposals).toHaveLength(1);

      const proposal = proposals[0]!;
      expect(proposal.status).toBe('proposed');
      expect(proposal.sourceId).toBe(source.id);
      expect(proposal.jobId).toBe(job.id);
      expect(proposal.extractor).toBe('deterministic');
      expect(proposal.content.structure.length).toBeGreaterThan(0);
      expect(proposal.content.activities.length).toBeGreaterThan(0);
      expect(proposal.content.relations.length).toBeGreaterThan(0);

      // THE invariant: extraction wrote nothing canonical. Since Release 2 the tables for it
      // exist, so this asserts they are still empty — the stronger claim, and the one that keeps
      // meaning as the system grows.
      const canonical = await db.query<{ nodes: string; relations: string; provenance: string; reviews: string }>(
        `SELECT (SELECT count(*) FROM identity_explicit_node)  AS nodes,
                (SELECT count(*) FROM identity_relation)       AS relations,
                (SELECT count(*) FROM identity_provenance)     AS provenance,
                (SELECT count(*) FROM identity_review)         AS reviews`,
      );
      expect(canonical.rows[0]).toEqual({ nodes: '0', relations: '0', provenance: '0', reviews: '0' });

      // And the identity revision never moved: nothing about the person changed.
      const { rows } = await db.query<{ revision: number }>(
        'SELECT revision FROM identity_durable_identity WHERE person_id = $1',
        [personId],
      );
      expect(rows[0]!.revision).toBe(0);
    });

    it('keeps every proposed fact traceable to the source text', async () => {
      const { personId } = await identity.captureSource({ contentType: 'text/plain', content: cvBuffer() });
      await identity.runReconstruction();

      const { content } = (await identity.listProposals(personId))[0]!;
      for (const item of [...content.structure, ...content.activities, ...content.relations]) {
        expect(item.sources.length).toBeGreaterThan(0);
        // The quoted evidence must really appear in the CV — provenance that cannot be checked
        // cannot be confirmed, which makes the proposal unreviewable.
        expect(CV).toContain(item.sources[0]!.quote);
      }
    });

    it('preserves a sparse activity through storage and retrieval', async () => {
      const { personId } = await identity.captureSource({ contentType: 'text/plain', content: cvBuffer() });
      await identity.runReconstruction();

      const { content } = (await identity.listProposals(personId))[0]!;
      const activity = content.activities.find((a) => a.contribution?.startsWith('Contributed'))!;

      expect(activity.contribution).toBe('Contributed to the payments migration');
      // The round trip through JSONB must not have materialised the absent components.
      expect(activity.consequence).toBeUndefined();
      expect(activity.capability).toBeUndefined();
    });

    it('keeps the three lifecycle facts distinct', async () => {
      const { source } = await identity.captureSource({ contentType: 'text/plain', content: cvBuffer() });

      const before = await identity.getSourceLifecycle(source.id);
      expect(before).toMatchObject({ captured: true, confirmed: false });
      expect(before!.reconstruction.status).toBe('pending');
      expect(before!.proposalId).toBeUndefined();

      await identity.runReconstruction();

      const after = await identity.getSourceLifecycle(source.id);
      expect(after!.captured).toBe(true);
      expect(after!.reconstruction.status).toBe('succeeded');
      expect(after!.proposalId).toBeTruthy();
      // A generated reconstruction is not a confirmed one, and nothing may conflate them.
      expect(after!.confirmed).toBe(false);
    });
  });

  describe('failure and retry', () => {
    it('preserves the source and the failure reason, and can be retried', async () => {
      const broken = createIdentityRuntime({ db, extractor: new FailingExtractor() });
      const { source, job, personId } = await broken.captureSource({
        contentType: 'text/plain',
        content: cvBuffer(),
      });

      const run = await broken.runReconstruction();
      expect(run).toMatchObject({ claimed: 1, failed: 1, succeeded: 0 });

      const failed = await broken.getReconstructionJob(job.id);
      expect(failed!.status).toBe('failed');
      expect(failed!.lastError).toContain('model unavailable');

      // The upload survives the failure — which is the only reason a retry is possible at all.
      const content = await db.query('SELECT content FROM identity_professional_source WHERE id = $1', [
        source.id,
      ]);
      expect(content.rowCount).toBe(1);
      expect(await broken.listProposals(personId)).toHaveLength(0);

      // Retry with a working extractor.
      expect(await identity.retryReconstruction(job.id)).toBe(true);
      await identity.runReconstruction();

      expect((await identity.getReconstructionJob(job.id))!.status).toBe('succeeded');
      expect(await identity.listProposals(personId)).toHaveLength(1);
    });

    it('does not retry a job that has not failed', async () => {
      const { job } = await identity.captureSource({ contentType: 'text/plain', content: cvBuffer() });
      expect(await identity.retryReconstruction(job.id)).toBe(false);
    });
  });

  describe('at-least-once survival', () => {
    it('produces exactly one proposal when the same job is delivered twice', async () => {
      const { personId, job } = await identity.captureSource({
        contentType: 'text/plain',
        content: cvBuffer(),
      });

      await identity.runReconstruction();
      // Force redelivery, as an abandoned claim or a crash before completion would.
      await db.query(
        `UPDATE identity_reconstruction_job SET status = 'pending', claimed_at = NULL WHERE id = $1`,
        [job.id],
      );
      const second = await identity.runReconstruction();

      expect(second).toMatchObject({ claimed: 1, skipped: 1, succeeded: 0 });
      expect(await identity.listProposals(personId)).toHaveLength(1);
      expect((await identity.getReconstructionJob(job.id))!.status).toBe('succeeded');
    });

    it('does not hand the same job to two concurrent runners', async () => {
      await identity.captureSource({ contentType: 'text/plain', content: cvBuffer() });

      const [a, b] = await Promise.all([identity.runReconstruction(), identity.runReconstruction()]);
      expect(a.claimed + b.claimed).toBe(1);
    });

    it('reclaims a job abandoned by a worker that died mid-extraction', async () => {
      const { job } = await identity.captureSource({ contentType: 'text/plain', content: cvBuffer() });

      // Simulate the crash: claimed, then nothing.
      await db.query(
        `UPDATE identity_reconstruction_job SET status = 'processing', claimed_at = now() - interval '1 hour'
          WHERE id = $1`,
        [job.id],
      );

      const run = await identity.runReconstruction();
      expect(run).toMatchObject({ claimed: 1, succeeded: 1 });
    });
  });

  describe('reprocessing the same CV', () => {
    it('is idempotent — the same bytes yield the same proposal content', async () => {
      const first = await identity.captureSource({ contentType: 'text/plain', content: cvBuffer() });
      await identity.runReconstruction();
      const firstProposal = (await identity.listProposals(first.personId))[0]!;

      // A different person uploading the identical CV: a separate source, same extraction.
      const second = await identity.captureSource({ contentType: 'text/plain', content: cvBuffer() });
      await identity.runReconstruction();
      const secondProposal = (await identity.listProposals(second.personId))[0]!;

      expect(second.source.checksum).toBe(first.source.checksum);
      expect(secondProposal.content.activities.map((a) => a.label)).toEqual(
        firstProposal.content.activities.map((a) => a.label),
      );
    });
  });
});
