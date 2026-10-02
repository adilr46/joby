/**
 * UC01 + UC02 end to end, against a real PostgreSQL.
 *
 * ```text
 * Raw Opportunity → Capture Evidence → Understand → Structured Opportunity
 * ```
 *
 * The assertions that matter most are about the **separation**: what the posting said is retrievable
 * apart from what Joby made of it, an interpretation can never write an opportunity record, and no
 * person appears anywhere in this path.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '@joby/database';
import {
  createOpportunity,
  createOpportunityUnderstanding,
  InterpretationError,
  OpportunityNotCapturedError,
  type OpportunityInterpreter,
  type OpportunityModule,
  type OpportunityUnderstandingService,
} from '@joby/opportunity';


import { connectTestDatabase, hasDatabase, truncateOpportunity } from './support/database';

const describeIntegration = hasDatabase ? describe : (describe.skip.bind(null) as typeof describe);

if (!hasDatabase) {
  console.warn('\n[tests] SKIPPING opportunity understanding tests: DATABASE_URL is not set.\n');
}

const POSTING = `Role: Placement Software Engineer
Company: Acme Trading
Location: London
Duration: 12 months

Requirements
- Python
- Working towards a numerate degree
`;

describeIntegration('capturing and understanding an opportunity', () => {
  let db: Database;
  let opportunities: OpportunityModule;
  let understanding: OpportunityUnderstandingService;

  /** The composition root, exactly as `apps/api` and `apps/worker` build it. */
  const wire = (interpreter?: OpportunityInterpreter): OpportunityUnderstandingService =>
    createOpportunityUnderstanding({
      db,
      opportunities: {
        listSummaries: (options) => opportunities.listSummaries(options),
        readEvidence: (opportunityId) => opportunities.readEvidenceText(opportunityId),
      },
      ...(interpreter ? { interpreter } : {}),
    });

  beforeAll(async () => {
    db = await connectTestDatabase();
    opportunities = createOpportunity({ db });
    understanding = wire();
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await truncateOpportunity(db);
  });

  const capture = (text = POSTING, overrides: Record<string, unknown> = {}) =>
    opportunities.captureEvidence({
      source: 'careers-page',
      contentType: 'text/plain',
      content: Buffer.from(text, 'utf8'),
      ...overrides,
    });

  describe('UC01 — capture evidence', () => {
    it('retains the evidence exactly as it was given', async () => {
      const { opportunity, evidence } = await capture();

      const stored = await opportunities.getEvidenceContent(evidence.id);
      // Byte-for-byte. A posting is edited and deleted; the person may later need to know what it
      // said when they applied.
      expect(stored?.content.toString('utf8')).toBe(POSTING);
      expect(stored?.opportunityId).toBe(opportunity.id);
      expect(stored?.source).toBe('careers-page');
      expect(stored?.capturedAt).toBeTruthy();
    });

    it('captures an opportunity that is not a job posting', async () => {
      // No URL, no deadline, no posting. "Sam mentioned something at Acme" is a real opportunity,
      // and a model that only works with a posting is modelling the posting.
      const { opportunity, evidence } = await capture('Sam says Acme may take a placement student.', {
        kind: 'note',
        source: 'conversation',
      });

      expect(opportunity.id).toBeTruthy();
      expect(evidence.kind).toBe('note');
      expect(evidence.uri).toBeUndefined();
      expect(evidence.externalRef).toBeUndefined();
    });

    it('accumulates several pieces of evidence against one opportunity', async () => {
      const first = await capture();
      await capture('Start date: September 2026\n', {
        opportunityId: first.opportunity.id,
        kind: 'email',
        source: 'recruiter',
      });

      const record = await opportunities.getOpportunity(first.opportunity.id);
      expect(record?.evidence).toHaveLength(2);
      expect(record?.evidence.map((item) => item.source)).toEqual(['careers-page', 'recruiter']);
    });

    it('treats re-capturing the same bytes as one piece of evidence', async () => {
      const first = await capture();
      const again = await capture(POSTING, { opportunityId: first.opportunity.id });

      expect(again.duplicate).toBe(true);
      expect(again.evidence.id).toBe(first.evidence.id);
      expect(await opportunities.listEvidence(first.opportunity.id)).toHaveLength(1);
    });

    it('refuses evidence with no provenance', async () => {
      await expect(capture(POSTING, { source: '   ' })).rejects.toThrow(/provenance/);
    });

    it('captures nothing when the opportunity does not exist', async () => {
      await expect(capture(POSTING, { opportunityId: 'missing' })).rejects.toThrow(/No opportunity/);
    });
  });

  describe('UC02 — understand', () => {
    it('produces a structured understanding from captured evidence', async () => {
      const { opportunity } = await capture();
      const stored = await understanding.understand(opportunity.id);

      expect(stored.understanding.role).toBe('Placement Software Engineer');
      expect(stored.understanding.company).toBe('Acme Trading');
      expect(stored.understanding.requiredCapabilities).toEqual([
        'Python',
        'Working towards a numerate degree',
      ]);
      expect(stored.understanding.conditions?.location).toEqual(['London']);
      expect(stored.understanding.revision).toBe(1);
      expect(stored.interpreter).toBe('deterministic');
    });

    it('represents what the evidence did not say', async () => {
      const { opportunity } = await capture();
      const stored = await understanding.understand(opportunity.id);

      // The actionable unknown. Nothing here is defaulted to "no" — a placement student needs to
      // know sponsorship is unstated, not to be told it is unavailable.
      expect(stored.understanding.conditions?.sponsorship).toBeUndefined();
      expect(stored.understanding.uncertainty).toContain(
        'The evidence does not state sponsorship.',
      );
    });

    it('attributes the understanding to the evidence it was read from', async () => {
      const { opportunity, evidence } = await capture();
      const stored = await understanding.understand(opportunity.id);

      expect(stored.evidenceIds).toEqual([evidence.id]);
      expect(stored.understanding.attribution?.[0]).toContain(evidence.id);
    });

    it('is retrievable afterwards, latest by default and by revision', async () => {
      const { opportunity } = await capture();
      await understanding.understand(opportunity.id);

      const latest = await understanding.getUnderstanding(opportunity.id);
      const first = await understanding.getUnderstanding(opportunity.id, 1);
      expect(latest?.understanding.revision).toBe(1);
      expect(first?.understanding).toEqual(latest?.understanding);
      expect(await understanding.getUnderstanding(opportunity.id, 99)).toBeUndefined();
    });

    it('re-reading unchanged evidence produces no new revision', async () => {
      const { opportunity } = await capture();
      const once = await understanding.understand(opportunity.id);
      const twice = await understanding.understand(opportunity.id);

      // The worker polls. A loop that manufactured a revision per pass would fill the table with
      // identical readings and make `opportunity_revision` meaningless.
      expect(twice.understanding.revision).toBe(once.understanding.revision);
      expect(twice.createdAt).toBe(once.createdAt);
    });

    it('new evidence produces a new revision rather than overwriting the old reading', async () => {
      const { opportunity } = await capture();
      const first = await understanding.understand(opportunity.id);

      await capture('Sponsorship: Not offered\n', {
        opportunityId: opportunity.id,
        kind: 'email',
        source: 'recruiter',
      });
      const second = await understanding.understand(opportunity.id);

      expect(second.understanding.revision).toBe(2);
      expect(second.understanding.conditions?.sponsorship).toEqual(['Not offered']);
      // The earlier reading survives: an Adaptation Context that recorded revision 1 must still be
      // able to retrieve what it actually worked from.
      const original = await understanding.getUnderstanding(opportunity.id, 1);
      expect(original?.understanding.conditions?.sponsorship).toBeUndefined();
      expect(original?.understanding).toEqual(first.understanding);
    });

    it('refuses to understand an opportunity with no captured evidence', async () => {
      await expect(understanding.understand('nothing-here')).rejects.toThrow(
        OpportunityNotCapturedError,
      );
    });

    it('stores nothing when the interpreter returns something unusable', async () => {
      const { opportunity } = await capture();
      const lying: OpportunityInterpreter = {
        name: 'lying',
        interpret: async () => ({
          interpreter: 'lying',
          understanding: { role: 'Invented', attribution: ['[ev-does-not-exist] from nowhere'] },
        }),
      };

      await expect(wire(lying).understand(opportunity.id)).rejects.toThrow(InterpretationError);

      // Nothing partial was written, and the evidence is untouched — so it can be retried.
      expect(await understanding.getUnderstanding(opportunity.id)).toBeUndefined();
      expect(await opportunities.listEvidence(opportunity.id)).toHaveLength(1);
    });

    it('survives an interpreter that throws, leaving the opportunity outstanding', async () => {
      const { opportunity } = await capture();
      const broken: OpportunityInterpreter = {
        name: 'broken',
        interpret: async () => {
          throw new Error('model unavailable');
        },
      };

      await expect(wire(broken).understand(opportunity.id)).rejects.toThrow('model unavailable');
      expect(await understanding.getUnderstanding(opportunity.id)).toBeUndefined();

      // Retried later with a working interpreter, it succeeds — the evidence was preserved.
      const recovered = await understanding.understand(opportunity.id);
      expect(recovered.understanding.revision).toBe(1);
    });
  });

  describe('the worker pass', () => {
    it('understands what is outstanding and skips what is current', async () => {
      const first = await capture();
      const second = await capture('Role: Data Analyst\n');

      const run = await understanding.understandOutstanding({ limit: 10 });
      expect(run.understood).toBe(2);
      expect(run.failed).toBe(0);

      // Second pass, nothing changed: no new revisions.
      const again = await understanding.understandOutstanding({ limit: 10 });
      expect(again.understood).toBe(0);
      expect(again.skipped).toBe(2);

      expect((await understanding.getUnderstanding(first.opportunity.id))?.understanding.revision).toBe(1);
      expect((await understanding.getUnderstanding(second.opportunity.id))?.understanding.revision).toBe(1);
    });

    it('one unreadable opportunity does not stop the batch', async () => {
      const good = await capture();
      const bad = await capture('Role: Data Analyst\n');

      const selective: OpportunityInterpreter = {
        name: 'selective',
        interpret: async (request) => {
          if (request.opportunityId === bad.opportunity.id) throw new Error('nope');
          return {
            interpreter: 'selective',
            understanding: {
              role: 'Read',
              attribution: request.evidence.map((item) => `[${item.evidenceId}] posting`),
            },
          };
        },
      };

      const run = await wire(selective).understandOutstanding({ limit: 10 });
      expect(run.understood).toBe(1);
      expect(run.failed).toBe(1);

      expect(await understanding.getUnderstanding(good.opportunity.id)).toBeDefined();
      // Still outstanding, evidence intact, retried on the next pass.
      expect(await understanding.getUnderstanding(bad.opportunity.id)).toBeUndefined();
      expect(await opportunities.listEvidence(bad.opportunity.id)).toHaveLength(1);
    });
  });

  describe('nothing is stranded', () => {
    it('understands opportunities beyond one batch, rather than only the newest', async () => {
      // The claim in ADR 0028 is that a capture which commits is discoverable on a later pass. A
      // fixed "most recent" window silently broke it: anything that fell out of the window never
      // became recent again, because its evidence never changes. Five opportunities, a batch of two.
      const captured = [];
      for (let index = 0; index < 5; index += 1) {
        captured.push(await capture(`Role: Analyst ${index}\n`));
      }

      let guard = 0;
      for (;;) {
        const run = await understanding.understandOutstanding({ limit: 2 });
        if (run.understood === 0) break;
        expect((guard += 1)).toBeLessThan(10);
      }

      for (const { opportunity } of captured) {
        expect(
          await understanding.getUnderstanding(opportunity.id),
          `opportunity ${opportunity.id} was never understood`,
        ).toBeDefined();
      }
    });

    it('reports no outstanding work once every opportunity is current', async () => {
      await capture();
      await capture('Role: Analyst\n');
      while ((await understanding.understandOutstanding({ limit: 5 })).understood > 0) {
        // drain
      }

      const settled = await understanding.understandOutstanding({ limit: 5 });
      expect(settled.understood).toBe(0);
      expect(settled.failed).toBe(0);
      expect(settled.skipped).toBe(2);
    });
  });

  describe('the boundary between raw and interpreted', () => {
    it('keeps the evidence and the understanding separately retrievable', async () => {
      const { opportunity, evidence } = await capture();
      await understanding.understand(opportunity.id);

      const record = await opportunities.getOpportunity(opportunity.id);
      const read = await understanding.getUnderstanding(opportunity.id);

      // Opportunity returns what was captured and where it came from — and no interpreted value.
      expect(Object.keys(record!.evidence[0]!)).not.toContain('role');
      expect(Object.keys(record!.opportunity)).not.toContain('requiredCapabilities');
      // Opportunity understanding names the evidence it came from rather than copying it.
      expect(read!.evidenceIds).toEqual([evidence.id]);
      expect(JSON.stringify(read!.understanding)).not.toContain('Working towards a numerate degree\n');
    });

    it('understanding an opportunity does not change the opportunity record', async () => {
      const { opportunity } = await capture();
      const before = await opportunities.getOpportunity(opportunity.id);

      await understanding.understand(opportunity.id);

      // The understanding partition has no write path into capture, and this is the consequence.
      expect(await opportunities.getOpportunity(opportunity.id)).toEqual(before);
    });

    it('stores no person anywhere in the path', async () => {
      const { opportunity } = await capture();
      await understanding.understand(opportunity.id);

      for (const table of ['opportunity', 'opportunity_evidence', 'intelligence_opportunity_understanding']) {
        const { rows } = await db.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
          [table],
        );
        // No person-specific judgement happens yet, and no column exists that could hold one.
        expect(rows.map((row) => row.column_name), table).not.toContain('person_id');
      }

      const { rows } = await db.query<{ content: unknown }>(
        `SELECT content FROM intelligence_opportunity_understanding WHERE opportunity_id = $1`,
        [opportunity.id],
      );
      const stored = JSON.stringify(rows[0]!.content);
      for (const forbidden of ['personId', 'fit', 'score', 'rank', 'recommend']) {
        expect(stored.toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase());
      }
    });
  });
});
