/**
 * Written representation end to end (UC10, UC11).
 *
 * The scenario the slice exists for:
 *
 *   request cover letter -> motivation missing -> Joby asks -> answered -> ready
 *     -> grounded personalised draft
 *   request an answer    -> reuses the same opportunity's input -> constrained answer
 *
 * Plus the case that matters most: a question asking about something the person has never
 * confirmed, where the honest output is "no", not a plausible paragraph.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '@joby/database';
import { createIdentity, type DurableIdentityModule } from '@joby/identity';
import { createAdaptation, type AdaptationModule } from '@joby/translation/adaptation';
import {
  createIdentityRepresentation,
  type IdentityRepresentationModule,
} from '@joby/identity/representation';
import { createIdentityRuntime, DeterministicCvExtractor } from '@joby/identity/runtime';
import { FakeOpportunityIntelligencePort } from '@joby/translation/testing';

import { connectTestDatabase, hasDatabase, truncateAll, truncateIdentity } from './support/database';
import {
  adaptationIdentityReader,
  adaptationRepresentationReader,
  combineIdentityModules,
  type TestIdentityModules,
} from './support/identity-modules';

const describeIntegration = hasDatabase ? describe : (describe.skip.bind(null) as typeof describe);

if (!hasDatabase) {
  console.warn('\n[tests] SKIPPING written representation tests: DATABASE_URL is not set.\n');
}

describeIntegration('written representation (UC10, UC11)', () => {
  let db: Database;
  let identity: TestIdentityModules;
  let durable: DurableIdentityModule;
  let representations: IdentityRepresentationModule;
  let adaptation: AdaptationModule;
  let opportunities: FakeOpportunityIntelligencePort;

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
    opportunities = new FakeOpportunityIntelligencePort([
      {
        opportunityId: 'barclays-markets',
        revision: 1,
        role: 'Markets Placement',
        company: 'Barclays',
        requiredCapabilities: ['Python'],
        applicationQuestions: ['Why do you want to join our markets division?'],
        attribution: ['posting: careers.barclays/1'],
      },
    ]);
    adaptation = createAdaptation({
      db,
      identity: adaptationIdentityReader(durable),
      representations: adaptationRepresentationReader(representations),
      opportunities,
    });
  });

  /**
   * The fixture the slice is specified against: professional evidence, two writing references, an
   * opportunity, and an Adaptation Context with a shaped lens.
   */
  async function establishScenario(): Promise<{ personId: string; contextId: string }> {
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

    await identity.addNode({
      personId,
      type: 'activity',
      label: 'Built a rota optimiser',
      contribution: 'Wrote the shift-allocation solver behind the rota scheduler',
      capability: ['Python'],
      correctedBy: 'user-1',
    });

    // How this person writes — persistent, user-owned, and never a fact.
    await identity.addRepresentationReference({
      personId,
      kind: 'writing_sample',
      label: 'Society newsletter piece',
      content: 'I like problems where the constraints are real and the feedback is immediate.',
      providedBy: 'user-1',
    });
    await identity.addRepresentationReference({
      personId,
      kind: 'cover_letter',
      label: 'Last summer internship letter',
      content: 'I led the entire trading desk and transformed their P&L.',
      providedBy: 'user-1',
    });

    const lens = await identity.createRepresentation({
      personId,
      name: 'Markets',
      createdBy: 'user-1',
    });
    const view = await adaptation.createContext({
      personId,
      opportunityId: 'barclays-markets',
      representationId: lens.id,
      createdBy: 'user-1',
    });
    return { personId, contextId: view.context.id };
  }

  describe('representation references', () => {
    it('are readable by Adaptation and are never professional facts', async () => {
      const { personId } = await establishScenario();

      const references = await identity.listRepresentationReferences(personId);
      expect(references).toHaveLength(2);

      // The old letter claims something extravagant and untrue. It is stored as *writing*, and it
      // reaches Explicit State nowhere: nothing reconstructs from a reference.
      const state = (await identity.getExplicitState(personId))!;
      const labels = [...state.reconstructed.structure, ...state.reconstructed.activities].map(
        (node) => node.label,
      );
      expect(labels.join(' ')).not.toMatch(/trading desk/i);

      const { rows } = await db.query<{ count: string }>(
        'SELECT count(*) FROM identity_reconstruction_job WHERE person_id = $1',
        [personId],
      );
      // One job, from the CV. Adding two references scheduled nothing.
      expect(rows[0]!.count).toBe('1');
    });

    it('deduplicate identical material and can be removed by the person', async () => {
      const { personId } = await establishScenario();
      const again = await identity.addRepresentationReference({
        personId,
        kind: 'writing_sample',
        label: 'Same words again',
        content: 'I like problems where the constraints are real and the feedback is immediate.',
        providedBy: 'user-1',
      });

      expect(await identity.listRepresentationReferences(personId)).toHaveLength(2);
      expect(await identity.removeRepresentationReference(again.id)).toBe(true);
      expect(await identity.listRepresentationReferences(personId)).toHaveLength(1);
    });
  });

  describe('UC11 — the cover letter, through the elicitation loop', () => {
    it('asks rather than inventing, then writes from what it was told', async () => {
      const { contextId } = await establishScenario();

      // 1. Joby has professional truth and no idea why this person wants this job.
      const first = (await adaptation.generateRepresentation({
        contextId,
        surface: 'cover_letter',
        generatedBy: 'user-1',
      }))!;
      expect(first.status).toBe('needs_input');
      if (first.status !== 'needs_input') throw new Error('unreachable');
      expect(first.readiness.missing.map((request) => request.kind)).toEqual([
        'motivation',
        'timing',
      ]);

      // 2. It answers one, and is still not satisfied. The loop is not one question long.
      await adaptation.provideApplicationInput({
        contextId,
        kind: 'motivation',
        prompt: first.readiness.missing[0]!.prompt,
        answer: 'I want to work on rates because I like problems with real constraints.',
        providedBy: 'user-1',
      });
      const second = (await adaptation.assessReadiness({ contextId, surface: 'cover_letter' }))!;
      expect(second.readiness.ready).toBe(false);
      expect(second.readiness.missing.map((request) => request.kind)).toEqual(['timing']);

      // 3. Answered, reassessed, satisfied.
      await adaptation.provideApplicationInput({
        contextId,
        kind: 'timing',
        prompt: second.readiness.missing[0]!.prompt,
        answer: 'My placement year runs from September 2026.',
        providedBy: 'user-1',
      });

      const generated = (await adaptation.generateRepresentation({
        contextId,
        surface: 'cover_letter',
        generatedBy: 'user-1',
      }))!;
      expect(generated.status).toBe('generated');
      if (generated.status !== 'generated') throw new Error('unreachable');

      const text = generated.draft.generated.map((segment) => segment.text).join(' ');
      // Their words, their evidence. Nothing else.
      expect(text).toMatch(/real constraints/);
      expect(text).toMatch(/September 2026/);
      expect(text).toMatch(/shift-allocation solver|rota/i);

      // Every professional claim traces to a confirmed fact.
      for (const segment of generated.draft.generated) {
        for (const nodeId of segment.groundedInNodeIds) {
          expect(await identity.getNode(nodeId)).toBeTruthy();
        }
      }

      // The extravagant claim in their old letter is nowhere near the output.
      expect(text).not.toMatch(/trading desk/i);
      expect(generated.references.provisional).toBe(true);
      expect(generated.draft.submitted).toBe(false);
    });

    it('does not manufacture motivation from professional fit', async () => {
      const { contextId } = await establishScenario();

      const outcome = (await adaptation.generateRepresentation({
        contextId,
        surface: 'cover_letter',
        generatedBy: 'user-1',
      }))!;

      // The person's evidence matches the role well. That is not a reason to say they want it.
      expect(outcome.status).toBe('needs_input');
      if (outcome.status !== 'needs_input') throw new Error('unreachable');
      expect(outcome.readiness.missing[0]!.why).toMatch(/not evidence that you want it/);
      expect(await adaptation.listDrafts(contextId)).toHaveLength(0);
    });
  });

  describe('UC10 — the application answer', () => {
    async function readyContext(): Promise<string> {
      const { contextId } = await establishScenario();
      await adaptation.provideApplicationInput({
        contextId,
        kind: 'motivation',
        prompt: 'Why this role?',
        answer: 'I want to work on rates because I like problems with real constraints.',
        providedBy: 'user-1',
      });
      return contextId;
    }

    it('reuses input already given for the same opportunity', async () => {
      const contextId = await readyContext();

      // The motivation was elicited for the cover letter. Asking again for the answer would be a
      // product failure, and two generators inventing separate motivations would be worse.
      const outcome = (await adaptation.generateRepresentation({
        contextId,
        surface: 'application_answer',
        question: 'Why do you want to join our markets division?',
        generatedBy: 'user-1',
      }))!;

      expect(outcome.status).toBe('generated');
      if (outcome.status !== 'generated') throw new Error('unreachable');
      const text = outcome.draft.generated.map((segment) => segment.text).join(' ');
      expect(text).toMatch(/real constraints/);
      expect(outcome.provided.map((given) => given.kind)).toEqual(['motivation']);
    });

    it('respects a word limit, and refuses to exceed it', async () => {
      const contextId = await readyContext();

      const generous = (await adaptation.generateRepresentation({
        contextId,
        surface: 'application_answer',
        question: 'Why do you want to join our markets division?',
        constraints: { wordLimit: 200 },
        generatedBy: 'user-1',
      }))!;
      expect(generous.status).toBe('generated');

      // A limit no honest draft can meet is a refusal, not a truncation that changes what was said.
      await expect(
        adaptation.generateRepresentation({
          contextId,
          surface: 'application_answer',
          question: 'Why do you want to join our markets division?',
          constraints: { wordLimit: 3 },
          generatedBy: 'user-1',
        }),
      ).rejects.toThrow(/limit is 3/);
    });

    it('reports an unsupported competency instead of writing one', async () => {
      const contextId = await readyContext();

      const outcome = (await adaptation.generateRepresentation({
        contextId,
        surface: 'application_answer',
        question: 'Describe your experience with Rust.',
        constraints: { competency: 'Rust', requiresExample: true },
        generatedBy: 'user-1',
      }))!;

      expect(outcome.status).toBe('generated');
      if (outcome.status !== 'generated') throw new Error('unreachable');
      // **The negative case.** Nothing in this person's confirmed history mentions Rust, so the
      // readiness says so and the draft contains no Rust claim. It is not asked for either: being
      // told in a chat box is not confirmation.
      expect(outcome.readiness.unsupported).toEqual(['Rust']);
      const text = outcome.draft.generated.map((segment) => segment.text).join(' ');
      expect(text).not.toMatch(/rust/i);
    });
  });

  describe('drafts, edits and boundaries', () => {
    /** Scenario plus the answers, stopping short of generating. */
    async function readyCoverLetter(): Promise<{ personId: string; contextId: string }> {
      const { personId, contextId } = await establishScenario();
      for (const [kind, answer] of [
        ['motivation', 'I want to work on rates.'],
        ['timing', 'My placement year runs from September 2026.'],
      ] as const) {
        await adaptation.provideApplicationInput({
          contextId,
          kind,
          prompt: 'asked',
          answer,
          providedBy: 'user-1',
        });
      }
      return { personId, contextId };
    }

    async function generatedCoverLetter(): Promise<{
      personId: string;
      contextId: string;
      draftId: string;
      revision: number;
    }> {
      const { personId, contextId } = await readyCoverLetter();
      const outcome = (await adaptation.generateRepresentation({
        contextId,
        surface: 'cover_letter',
        generatedBy: 'user-1',
      }))!;
      if (outcome.status !== 'generated') throw new Error('expected a draft');
      return { personId, contextId, draftId: outcome.draft.id, revision: outcome.draft.revision };
    }

    it('keeps the user\'s edit beside what Joby wrote', async () => {
      const { draftId, revision } = await generatedCoverLetter();

      const edited = await adaptation.editDraft({
        draftId,
        expectedRevision: revision,
        editedBy: 'user-1',
        segments: [
          {
            text: 'I want to work on rates, specifically inflation.',
            groundedInNodeIds: [],
            groundedInInput: ['motivation'],
          },
        ],
      });

      expect(edited.edited![0]!.text).toMatch(/inflation/);
      // What Joby wrote survives beside it: the two must stay distinguishable for the later record.
      expect(edited.generated.length).toBeGreaterThan(1);
      expect(edited.editedBy).toBe('user-1');

      await expect(
        adaptation.editDraft({
          draftId,
          expectedRevision: revision,
          editedBy: 'user-2',
          segments: [{ text: 'Mine.', groundedInNodeIds: [], groundedInInput: ['motivation'] }],
        }),
      ).rejects.toThrow(/stale/i);
    });

    it('refuses an edit that grounds itself in a fact the person has not confirmed', async () => {
      const { draftId, revision } = await generatedCoverLetter();

      // A person may write what they like in their own document — but Joby will not *store it as
      // grounded* in something that does not exist.
      await expect(
        adaptation.editDraft({
          draftId,
          expectedRevision: revision,
          editedBy: 'user-1',
          segments: [{ text: 'I led a desk.', groundedInNodeIds: ['n-ghost'], groundedInInput: [] }],
        }),
      ).rejects.toThrow(/must trace to a confirmed fact/);
    });

    it('mutates neither Explicit State, Stated Context nor Learned State', async () => {
      // Snapshot *after* the identity is established, so this measures generation and editing —
      // not the confirmation that legitimately publishes `IdentityUpdated`.
      const { personId, contextId } = await readyCoverLetter();
      const before = (await identity.getExplicitState(personId))!;
      const outboxBefore = await db.query<{ count: string }>('SELECT count(*) FROM event_outbox');

      const outcome = (await adaptation.generateRepresentation({
        contextId,
        surface: 'cover_letter',
        generatedBy: 'user-1',
      }))!;
      if (outcome.status !== 'generated') throw new Error('expected a draft');
      const { id: draftId, revision } = outcome.draft;

      await adaptation.editDraft({
        draftId,
        expectedRevision: revision,
        editedBy: 'user-1',
        segments: [{ text: 'Mine.', groundedInNodeIds: [], groundedInInput: ['motivation'] }],
      });

      const after = (await identity.getExplicitState(personId))!;
      // Elicited meaning is contextual. It does not become what is true about the person, and an
      // edit teaches Joby nothing.
      expect(after.revision).toBe(before.revision);
      expect(after.reconstructed).toEqual(before.reconstructed);
      expect(after.stated).toEqual(before.stated);
      // Durable Identity exposes no learned component: PCI is Memory / PCI's (ADR 0030).
      expect('learned' in (await identity.getDurableIdentity(personId))!).toBe(false);

      const outboxAfter = await db.query<{ count: string }>('SELECT count(*) FROM event_outbox');
      expect(outboxAfter.rows[0]!.count).toBe(outboxBefore.rows[0]!.count);
    });

    it('creates no Application Record and marks nothing submitted', async () => {
      const { contextId, draftId } = await generatedCoverLetter();

      const draft = (await adaptation.getDraft(draftId))!;
      // Generation is not submission. There is no column that could say otherwise.
      expect(draft.submitted).toBe(false);

      // `execution_session` now exists (Execution's Application Session, ADR 0031) — deliberately,
      // and it is temporary runtime state, not an Application Record. What this generation path
      // must still never create is a *record of submission*.
      const { rows } = await db.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name LIKE '%application_record%'`,
      );
      expect(rows).toEqual([]);

      // …and the draft carries what a later Application Record will need to freeze.
      expect(draft.contextId).toBe(contextId);
      expect(draft.surface).toBe('cover_letter');
      expect(draft.writer).toBe('deterministic');
      expect(draft.generated.flatMap((segment) => segment.groundedInNodeIds).length).toBeGreaterThan(0);
    });

    it('keeps both surfaces compatible with one Adapted State', async () => {
      const { contextId } = await generatedCoverLetter();
      const answer = (await adaptation.generateRepresentation({
        contextId,
        surface: 'application_answer',
        question: 'Describe a technical project you built.',
        generatedBy: 'user-1',
      }))!;
      if (answer.status !== 'generated') throw new Error('expected a draft');

      const drafts = await adaptation.listDrafts(contextId);
      expect(drafts.map((draft) => draft.surface).sort()).toEqual([
        'application_answer',
        'cover_letter',
      ]);

      // Both stand on the same confirmed facts, so they cannot develop contradictory positioning.
      const letter = drafts.find((draft) => draft.surface === 'cover_letter')!;
      const nodesIn = (draft: typeof letter) =>
        new Set(draft.generated.flatMap((segment) => segment.groundedInNodeIds));
      const shared = [...nodesIn(answer.draft)].filter((nodeId) => nodesIn(letter).has(nodeId));
      expect(shared.length).toBeGreaterThan(0);
    });
  });
});
