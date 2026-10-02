/**
 * Adaptation Module 1 — Context Interpretation (UC01–UC04), end to end.
 *
 *   P_i(E_t) + C_opportunity + C_user  ->  a legible adaptation context
 *
 * The pure comparison is unit-tested next to the code. What this file proves is the part that only
 * shows up when the pieces are wired together: that the context holds **references, not copies**,
 * that it reads Identity through the public contract, that it writes nothing canonical, and that a
 * conflict stops nothing.
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
  console.warn('\n[tests] SKIPPING Adaptation context tests: DATABASE_URL is not set.\n');
}

describeIntegration('Adaptation Module 1 — context interpretation', () => {
  let db: Database;
  let identity: TestIdentityModules;
  let durable: DurableIdentityModule;
  let representations: IdentityRepresentationModule;
  let opportunities: FakeOpportunityIntelligencePort;
  let adaptation: AdaptationModule;

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
        opportunityId: 'opp-markets',
        revision: 2,
        role: 'Markets Placement',
        company: 'A Bank',
        requiredCapabilities: ['Python'],
        conditions: {
          duration: ['12 months'],
          work_arrangement: ['Hybrid'],
          start_date: ['September 2026'],
          location: ['London'],
        },
        attribution: ['posting: careers.example/1'],
        uncertainty: ['Sponsorship policy is not stated'],
      },
    ]);

    // The composition root's job: it imports both sides and wires the port. `packages/identity`
    // imports Intelligence nowhere, which is what keeps the package graph acyclic (ADR 0012).
    adaptation = createAdaptation({
      db,
      identity: adaptationIdentityReader(durable),
      representations: adaptationRepresentationReader(representations),
      opportunities,
    });
  });

  /** A person with confirmed canonical facts and stated conditions. */
  async function establishPerson(): Promise<string> {
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

    await identity.setStatedContext({
      personId,
      expectedRevision: 1,
      statedBy: 'user-1',
      careerDirection: 'Markets, ideally rates',
      constraints: ['I need to keep Fridays free'],
      conditions: [
        { kind: 'duration', values: ['12 months'] },
        { kind: 'work_arrangement', values: ['Hybrid', 'Remote'] },
        { kind: 'start_date', values: ['September 2026'] },
        { kind: 'location', values: ['Bristol', 'Bath'], note: 'I can travel occasionally' },
      ],
    });
    return personId;
  }

  describe('UC-X — the person states their situation', () => {
    it('writes X, and only the user can', async () => {
      const personId = await establishPerson();
      const state = (await identity.getExplicitState(personId))!;

      expect(state.stated.careerDirection).toBe('Markets, ideally rates');
      expect(state.stated.conditions?.map((condition) => condition.kind).sort()).toEqual([
        'duration',
        'location',
        'start_date',
        'work_arrangement',
      ]);
      // X is canonical Explicit State, so stating something moves the identity revision.
      expect(state.revision).toBe(2);
    });

    it('refuses a condition kind Joby cannot compare, and points at constraints', async () => {
      const personId = await establishPerson();
      await expect(
        identity.setStatedContext({
          personId,
          expectedRevision: 2,
          statedBy: 'user-1',
          conditions: [{ kind: 'salary' as never, values: ['£30k'] }],
        }),
      ).rejects.toThrow(/not a condition kind Joby can compare/);
    });

    it('leaves omitted components alone rather than clearing them', async () => {
      const personId = await establishPerson();
      await identity.setStatedContext({
        personId,
        expectedRevision: 2,
        statedBy: 'user-1',
        careerDirection: 'Rates specifically',
      });

      const state = (await identity.getExplicitState(personId))!;
      expect(state.stated.careerDirection).toBe('Rates specifically');
      // Conditions were not mentioned, so they are untouched — not silently wiped by a caller who
      // only meant to change one thing.
      expect(state.stated.conditions).toHaveLength(4);
      expect(state.stated.constraints).toEqual(['I need to keep Fridays free']);
    });

    it('removes only fields the person explicitly clears, leaving absence unknown', async () => {
      const personId = await establishPerson();
      const result = await identity.setStatedContext({
        personId,
        expectedRevision: 2,
        statedBy: 'user-1',
        careerDirection: null,
        constraints: [],
        conditions: [],
      });

      expect(result.revision).toBe(3);
      expect(result.stated.careerDirection).toBeUndefined();
      expect(result.stated.constraints).toBeUndefined();
      expect(result.stated.conditions).toBeUndefined();
      // Omitted means preserve, not clear.
      expect(result.stated.preferences).toBeUndefined();

      const view = await adaptation.createContext({
        personId,
        opportunityId: 'opp-markets',
        createdBy: 'user-1',
      });
      expect(view.intersection.aligned).toHaveLength(0);
      expect(view.intersection.conflicts).toHaveLength(0);
      // Cleared conditions leave the person with no view on what the posting states, so those four
      // conditions read as neutral information about the role. **Nothing is inferred back**: an
      // absent condition is not treated as acceptance, and not treated as a problem.
      expect(view.intersection.uncertain).toHaveLength(0);
      expect(view.intersection.neutral).toHaveLength(4);
    });

    it('does not revise or publish when the operative context is unchanged', async () => {
      const personId = await establishPerson();
      const beforeEvents = await db.query<{ count: string }>('SELECT count(*) FROM event_outbox');

      const result = await identity.setStatedContext({
        personId,
        expectedRevision: 2,
        statedBy: 'user-1',
        careerDirection: '  Markets, ideally rates  ',
        constraints: ['I need to keep Fridays free'],
        conditions: [
          { kind: 'location', values: ['Bristol', 'Bath'], note: 'I can travel occasionally' },
          { kind: 'duration', values: ['12 months'] },
          { kind: 'work_arrangement', values: ['Hybrid', 'Remote'] },
          { kind: 'start_date', values: ['September 2026'] },
        ],
      });

      expect(result.revision).toBe(2);
      const afterEvents = await db.query<{ count: string }>('SELECT count(*) FROM event_outbox');
      expect(afterEvents.rows[0]!.count).toBe(beforeEvents.rows[0]!.count);
    });

    it('maintains a Stated Context revision independent of canonical graph revisions', async () => {
      const personId = await establishPerson();
      const first = await db.query<{ revision: number }>(
        'SELECT revision FROM identity_stated_context WHERE person_id = $1',
        [personId],
      );
      expect(first.rows[0]!.revision).toBe(1);

      const node = (await identity.getExplicitState(personId))!.reconstructed.activities[0]!;
      await identity.correctNode({
        nodeId: node.id,
        expectedRevision: node.revision,
        correctedBy: 'user-1',
        changes: { label: `${node.label} corrected` },
      });

      const afterGraphChange = await db.query<{ revision: number }>(
        'SELECT revision FROM identity_stated_context WHERE person_id = $1',
        [personId],
      );
      expect(afterGraphChange.rows[0]!.revision).toBe(1);

      await identity.setStatedContext({
        personId,
        expectedRevision: 3,
        statedBy: 'user-1',
        careerDirection: 'Rates specifically',
      });
      const afterStatedChange = await db.query<{ revision: number }>(
        'SELECT revision FROM identity_stated_context WHERE person_id = $1',
        [personId],
      );
      expect(afterStatedChange.rows[0]!.revision).toBe(2);
    });

    it('rejects commands without an explicit user-authored change', async () => {
      const personId = await establishPerson();

      await expect(
        identity.setStatedContext({
          personId,
          expectedRevision: 2,
          statedBy: 'user-1',
        }),
      ).rejects.toThrow(/State at least one Stated Context field/);

      await expect(
        identity.setStatedContext({
          personId,
          expectedRevision: 2,
          statedBy: '   ',
          careerDirection: 'Markets',
        }),
      ).rejects.toThrow(/statedBy may not be blank/);

      await expect(
        identity.setStatedContext({
          personId,
          expectedRevision: 2,
          statedBy: 'user-1',
          conditions: [
            { kind: 'location', values: ['London'] },
            { kind: 'location', values: ['Bristol'] },
          ],
        }),
      ).rejects.toThrow(/appears more than once/);
    });
  });

  describe('UC01 — creating the adaptation context', () => {
    it('establishes the scope: lens, opportunity, conditions, revisions', async () => {
      const personId = await establishPerson();
      const lens = await identity.createRepresentation({
        personId,
        name: 'Markets',
        createdBy: 'user-1',
      });

      const view = await adaptation.createContext({
        personId,
        opportunityId: 'opp-markets',
        representationId: lens.id,
        createdBy: 'user-1',
      });

      expect(view.context.opportunityId).toBe('opp-markets');
      expect(view.context.representationId).toBe(lens.id);
      expect(view.context.opportunityRevision).toBe(2);
      expect(view.context.identityRevision).toBe(
        (await identity.getExplicitState(personId))!.revision,
      );
      expect(view.prior?.name).toBe('Markets');
    });

    it('works without a lens, because the prior is optional', async () => {
      const personId = await establishPerson();
      const view = await adaptation.createContext({
        personId,
        opportunityId: 'opp-markets',
        createdBy: 'user-1',
      });

      // Applying to something outside every lens a person keeps is a normal case (ADR 0016).
      expect(view.context.representationId).toBeUndefined();
      expect(view.prior).toBeUndefined();
      expect(view.intersection.aligned.length).toBeGreaterThan(0);
    });

    it('adapts nothing about the professional identity', async () => {
      const personId = await establishPerson();
      const view = await adaptation.createContext({
        personId,
        opportunityId: 'opp-markets',
        createdBy: 'user-1',
      });

      // Module 1 makes the situation legible. Selecting, interpreting or composing evidence is
      // Module 2, and none of it exists yet — the context carries no evidence at all.
      const serialised = JSON.stringify(view);
      expect(serialised).not.toContain('Rota scheduler');
      expect(serialised).not.toContain('University of Bristol');
      expect(Object.keys(view).sort()).toEqual(['context', 'intersection', 'opportunity', 'user']);
    });

    it('refuses an opportunity without Opportunity Intelligence', async () => {
      const personId = await establishPerson();
      // Adaptation does not read a job description. If there is no understanding, there is no
      // context — it does not fall back to interpreting raw text itself.
      await expect(
        adaptation.createContext({ personId, opportunityId: 'opp-unknown', createdBy: 'user-1' }),
      ).rejects.toThrow(/Intelligence supplies it/);
    });

    it('keeps one scope per opportunity', async () => {
      const personId = await establishPerson();
      await adaptation.createContext({ personId, opportunityId: 'opp-markets', createdBy: 'user-1' });
      await adaptation.createContext({ personId, opportunityId: 'opp-markets', createdBy: 'user-1' });

      // A second scope for the same application would leave later modules with no way to choose.
      expect(await adaptation.listContexts(personId)).toHaveLength(1);
    });
  });

  describe('UC02–UC04 — the context is legible, and derived', () => {
    it('surfaces aligned, conflicting, uncertain and neutral conditions', async () => {
      const personId = await establishPerson();
      const view = await adaptation.createContext({
        personId,
        opportunityId: 'opp-markets',
        createdBy: 'user-1',
      });

      expect(view.intersection.aligned.map((item) => item.kind).sort()).toEqual([
        'duration',
        'start_date',
        'work_arrangement',
      ]);
      expect(view.intersection.conflicts.map((item) => item.summary)).toEqual([
        'Location: the posting says London; you have said Bristol or Bath.',
      ]);
      // This person has stated a view on everything the posting states, so nothing is neutral and
      // nothing is uncertain — the four categories are populated by the situation, not by defaults.
      expect(view.intersection.neutral).toHaveLength(0);
      expect(view.intersection.uncertain).toHaveLength(0);
      expect(view.intersection.otherConstraints).toEqual(['I need to keep Fridays free']);
      // What Opportunity Intelligence was unsure about, verbatim and unmapped, beside the comparison.
      expect(view.intersection.postingUncertainty).toEqual(['Sponsorship policy is not stated']);
      expect(view.opportunity.uncertainty).toEqual(['Sponsorship policy is not stated']);

      // Relevant neutral opportunity information a reader needs, carried without being compared.
      expect(view.opportunity.role).toBe('Markets Placement');
      expect(view.opportunity.requiredCapabilities).toEqual(['Python']);
    });

    it('never blocks the application on a conflict', async () => {
      const personId = await establishPerson();
      const view = await adaptation.createContext({
        personId,
        opportunityId: 'opp-markets',
        createdBy: 'user-1',
      });

      // ConstraintConflict ≠ ApplicationBlock. The conflict is named; the decision stays the
      // person's, and nothing in the output can express a gate.
      expect(view.intersection.conflicts).toHaveLength(1);
      expect(view.intersection.blocksApplication).toBe(false);
    });

    it('re-derives on read, so an edited condition shows up with no refresh', async () => {
      const personId = await establishPerson();
      const created = await adaptation.createContext({
        personId,
        opportunityId: 'opp-markets',
        createdBy: 'user-1',
      });
      expect(created.intersection.conflicts.map((item) => item.kind)).toEqual(['location']);

      // The person decides they would move to London after all.
      const revision = (await identity.getExplicitState(personId))!.revision;
      await identity.setStatedContext({
        personId,
        expectedRevision: revision,
        statedBy: 'user-1',
        conditions: [
          { kind: 'location', values: ['London', 'Bristol'] },
          { kind: 'duration', values: ['12 months'] },
        ],
      });

      const after = (await adaptation.getContext(created.context.id))!;
      // Nothing was refreshed, invalidated or regenerated: the context holds references, so it
      // simply reads differently.
      expect(after.intersection.conflicts).toHaveLength(0);
      expect(after.intersection.aligned.map((item) => item.kind).sort()).toEqual([
        'duration',
        'location',
      ]);
    });

    it('holds references and revisions, never copies', async () => {
      const personId = await establishPerson();
      await adaptation.createContext({ personId, opportunityId: 'opp-markets', createdBy: 'user-1' });

      const { rows } = await db.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'adaptation_context'
          ORDER BY column_name`,
      );
      // Pinned. A role, company, requirement, condition or capability column here would make
      // Adaptation a second opportunity store — or a second copy of the person.
      expect(rows.map((row) => row.column_name)).toEqual([
        'created_at',
        'created_by',
        'id',
        'identity_revision',
        'opportunity_id',
        'opportunity_revision',
        'person_id',
        'representation_id',
      ]);
    });
  });

  // --- Module 2: Context Adaptation (UC05–UC08, ADR 0019) ------------------------------------

  describe('adapting the representation to the opportunity', () => {
    /**
     * A lens that leads with the rota scheduler and hides the options pricer.
     *
     * The pricer is canonical and confirmed — the person simply does not lead with it in this
     * general positioning. That is what makes it the fallback-recovery case.
     */
    async function shapedLens(personId: string): Promise<string> {
      const created = await identity.createRepresentation({
        personId,
        name: 'Markets',
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
          { nodeId: node('Built a rota optimiser'), priority: 0 },
          // Canonical, confirmed, and deliberately not led with in this general positioning.
          { nodeId: node('Built an options pricer'), included: false },
        ],
      });
      return created.id;
    }

    /**
     * A person whose confirmed history contains more than their Markets lens exposes.
     *
     * Both activities are user-supplemented with explicit capability components, so the tests turn
     * on canonical capabilities rather than on whatever the deterministic extractor happens to infer.
     */
    async function establishRicherPerson(): Promise<string> {
      const personId = await establishPerson();
      await identity.addNode({
        personId,
        type: 'activity',
        label: 'Built a rota optimiser',
        contribution: 'Wrote the shift-allocation solver behind the rota scheduler',
        capability: ['Python', 'Optimisation'],
        correctedBy: 'user-1',
      });
      await identity.addNode({
        personId,
        type: 'activity',
        label: 'Built an options pricer',
        contribution: 'Built a Black-Scholes pricer for a university trading society',
        capability: ['Derivatives', 'Statistics'],
        correctedBy: 'user-1',
      });
      return personId;
    }

    it('composes from the representation alone when it already covers the opportunity', async () => {
      const personId = await establishRicherPerson();
      const lens = await shapedLens(personId);
      opportunities.set({
        opportunityId: 'opp-python',
        revision: 1,
        role: 'Quant Developer Placement',
        company: 'A Bank',
        requiredCapabilities: ['Python'],
      });
      const view = await adaptation.createContext({
        personId,
        opportunityId: 'opp-python',
        representationId: lens,
        createdBy: 'user-1',
      });

      const adapted = (await adaptation.composeAdaptedState(view.context.id))!;

      // **The normal path.** The lens covered it, so Durable Identity was never consulted beyond it.
      expect(adapted.recoveryUsed).toBe(false);
      expect(adapted.elements.every((element) => element.origin === 'representation')).toBe(true);
      expect(adapted.elements[0]!.speaksTo).toEqual(['Python']);
    });

    it('does not retrieve the canonical reservoir at all when the lens covers the posting', async () => {
      // **Authority is not eager retrieval.** Durable Identity stays the authoritative reservoir,
      // but an adaptation whose lens already speaks to everything asked would fetch the whole person
      // and read none of it. This counts the calls, because "we only consult it when needed" is a
      // claim about behaviour and the previous implementation made it in a comment while loading
      // unconditionally.
      const personId = await establishRicherPerson();
      const lens = await shapedLens(personId);
      opportunities.set({
        opportunityId: 'opp-covered',
        revision: 1,
        role: 'Quant Developer Placement',
        company: 'A Bank',
        requiredCapabilities: ['Python'],
      });

      const base = adaptationIdentityReader(durable);
      let reservoirReads = 0;
      const counted = createAdaptation({
        db,
        identity: {
          ...base,
          projectIdentity: (id) => {
            reservoirReads += 1;
            return base.projectIdentity(id);
          },
        },
        representations: adaptationRepresentationReader(representations),
        opportunities,
      });

      const view = await counted.createContext({
        personId,
        opportunityId: 'opp-covered',
        representationId: lens,
        createdBy: 'user-1',
      });
      const adapted = (await counted.composeAdaptedState(view.context.id))!;

      expect(adapted.recoveryUsed).toBe(false);
      expect(reservoirReads).toBe(0);
      // The revision it is against is still recorded, so the context remains reproducible.
      expect(adapted.identityRevision).toBeGreaterThan(0);
    });

    it('retrieves the reservoir the moment the posting asks about something the lens hides', async () => {
      // The other half of the same rule. Skipping retrieval here would turn a positioning choice
      // into an evidence boundary, which is the failure ADR 0015 exists to prevent.
      const personId = await establishRicherPerson();
      const lens = await shapedLens(personId);
      opportunities.set({
        opportunityId: 'opp-uncovered',
        revision: 1,
        role: 'Derivatives Placement',
        company: 'A Bank',
        requiredCapabilities: ['Derivatives'],
      });

      const base = adaptationIdentityReader(durable);
      let reservoirReads = 0;
      const counted = createAdaptation({
        db,
        identity: {
          ...base,
          projectIdentity: (id) => {
            reservoirReads += 1;
            return base.projectIdentity(id);
          },
        },
        representations: adaptationRepresentationReader(representations),
        opportunities,
      });

      const view = await counted.createContext({
        personId,
        opportunityId: 'opp-uncovered',
        representationId: lens,
        createdBy: 'user-1',
      });
      const adapted = (await counted.composeAdaptedState(view.context.id))!;

      expect(reservoirReads).toBeGreaterThan(0);
      expect(adapted.recoveryUsed).toBe(true);
    });

    it('recovers canonical evidence when the lens does not expose what the role asks for', async () => {
      const personId = await establishRicherPerson();
      const lens = await shapedLens(personId);
      opportunities.set({
        opportunityId: 'opp-derivatives',
        revision: 1,
        role: 'Derivatives Placement',
        company: 'A Bank',
        requiredCapabilities: ['Derivatives'],
      });
      const view = await adaptation.createContext({
        personId,
        opportunityId: 'opp-derivatives',
        representationId: lens,
        createdBy: 'user-1',
      });

      const adapted = (await adaptation.composeAdaptedState(view.context.id))!;

      // **The fallback path.** The lens hides the pricer; the role asks for derivatives; the
      // evidence is canonical and confirmed, so it comes back — hiding is a positioning prior, never
      // an evidence boundary (ADR 0015).
      expect(adapted.recoveryUsed).toBe(true);
      const recovered = adapted.elements.filter((element) => element.origin === 'recovered');
      expect(recovered.map((element) => element.canonicalTitle)).toEqual(['Built an options pricer']);
      expect(recovered[0]!.speaksTo).toEqual(['Derivatives']);

      // Traceable to the confirmed fact it came from.
      const state = (await identity.getExplicitState(personId))!;
      const canonical = new Set(
        [...state.reconstructed.structure, ...state.reconstructed.activities].map((n) => n.id),
      );
      for (const element of adapted.elements) expect(canonical.has(element.nodeId)).toBe(true);
      expect(await identity.getNode(recovered[0]!.nodeId)).toBeTruthy();
    });

    it('does not drag in canonical evidence the opportunity never asked about', async () => {
      const personId = await establishRicherPerson();
      const lens = await shapedLens(personId);
      opportunities.set({
        opportunityId: 'opp-derivatives',
        revision: 1,
        role: 'Derivatives Placement',
        company: 'A Bank',
        requiredCapabilities: ['Derivatives'],
      });
      const view = await adaptation.createContext({
        personId,
        opportunityId: 'opp-derivatives',
        representationId: lens,
        createdBy: 'user-1',
      });

      const adapted = (await adaptation.composeAdaptedState(view.context.id))!;
      const recovered = adapted.elements.filter((element) => element.origin === 'recovered');

      // The degree is canonical and entirely absent from this adaptation: recovery closes the gap
      // the assessment found, and does not re-solve Durable Identity on the way past.
      expect(recovered).toHaveLength(1);
      expect(recovered.map((element) => element.canonicalTitle)).not.toContain(
        'University of Bristol',
      );
    });

    it('reports an ask nothing in the person\'s history evidences', async () => {
      const personId = await establishRicherPerson();
      const lens = await shapedLens(personId);
      opportunities.set({
        opportunityId: 'opp-rust',
        revision: 1,
        role: 'Systems Placement',
        company: 'A Bank',
        requiredCapabilities: ['Rust'],
      });
      const view = await adaptation.createContext({
        personId,
        opportunityId: 'opp-rust',
        representationId: lens,
        createdBy: 'user-1',
      });

      const adapted = (await adaptation.composeAdaptedState(view.context.id))!;

      // Nothing is invented to cover it, and the gap is named rather than quietly dropped.
      expect(adapted.assessment.unevidenced).toEqual(['Rust']);
      expect(adapted.recoveryUsed).toBe(false);
    });

    it('mutates neither the representation nor Durable Identity', async () => {
      const personId = await establishRicherPerson();
      const lens = await shapedLens(personId);
      opportunities.set({
        opportunityId: 'opp-derivatives',
        revision: 1,
        role: 'Derivatives Placement',
        company: 'A Bank',
        requiredCapabilities: ['Derivatives'],
      });
      const view = await adaptation.createContext({
        personId,
        opportunityId: 'opp-derivatives',
        representationId: lens,
        createdBy: 'user-1',
      });

      const lensBefore = (await identity.getRepresentation(lens))!;
      const stateBefore = (await identity.getExplicitState(personId))!;
      const outboxBefore = await db.query<{ count: string }>('SELECT count(*) FROM event_outbox');

      await adaptation.composeAdaptedState(view.context.id);

      const lensAfter = (await identity.getRepresentation(lens))!;
      const stateAfter = (await identity.getExplicitState(personId))!;

      // Recovering evidence the lens hides does not un-hide it: the person's general positioning is
      // theirs, and one opportunity does not rewrite it.
      expect(lensAfter.representation.revision).toBe(lensBefore.representation.revision);
      expect(lensAfter.positioning.decisions).toEqual(lensBefore.positioning.decisions);
      expect(lensAfter.positioning.evidence.find((e) => !e.included)).toBeDefined();

      expect(stateAfter.revision).toBe(stateBefore.revision);
      expect(stateAfter.reconstructed).toEqual(stateBefore.reconstructed);
      // Durable Identity exposes no learned component at all: PCI is Memory / PCI's, not held
      // here (ADR 0030). Adaptation could not write it through this authority if it tried.
      expect('learned' in (await identity.getDurableIdentity(personId))!).toBe(false);

      const outboxAfter = await db.query<{ count: string }>('SELECT count(*) FROM event_outbox');
      expect(outboxAfter.rows[0]!.count).toBe(outboxBefore.rows[0]!.count);
    });

    it('stores nothing: the state is composed on request', async () => {
      const personId = await establishRicherPerson();
      const lens = await shapedLens(personId);
      opportunities.set({
        opportunityId: 'opp-derivatives',
        revision: 1,
        role: 'Derivatives Placement',
        company: 'A Bank',
        requiredCapabilities: ['Derivatives'],
      });
      const view = await adaptation.createContext({
        personId,
        opportunityId: 'opp-derivatives',
        representationId: lens,
        createdBy: 'user-1',
      });
      await adaptation.composeAdaptedState(view.context.id);

      const { rows } = await db.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name LIKE 'adaptation_%'`,
      );
      // `A^C` itself is still derived — no table holds it, so ADR 0013 §10's retention and
      // versioning questions stay deferred. The other two tables hold what **cannot** be
      // recomputed: what the person told Joby, and the drafts they edited (ADR 0022).
      expect(rows.map((row) => row.table_name).sort()).toEqual([
        'adaptation_application_input',
        'adaptation_context',
        'adaptation_representation_draft',
      ]);
    });

    it('carries the interpreted context without letting a conflict gate anything', async () => {
      const personId = await establishRicherPerson();
      const lens = await shapedLens(personId);
      const view = await adaptation.createContext({
        personId,
        opportunityId: 'opp-markets',
        representationId: lens,
        createdBy: 'user-1',
      });

      const adapted = (await adaptation.composeAdaptedState(view.context.id))!;

      // Conditions inform the adaptation and never stop it: the location conflict is present in the
      // context, and the Adapted State was composed regardless.
      expect(adapted.user.conditions.location).toEqual(['Bristol', 'Bath']);
      expect(adapted.opportunity.conditions.location).toEqual(['London']);
      expect(adapted.elements.length).toBeGreaterThan(0);
    });

    it('composes without a lens at all', async () => {
      const personId = await establishRicherPerson();
      const view = await adaptation.createContext({
        personId,
        opportunityId: 'opp-markets',
        createdBy: 'user-1',
      });

      const adapted = (await adaptation.composeAdaptedState(view.context.id))!;

      // No lens means no baseline, so there is no default surface to start from and everything the
      // role asks for is a gap. Adaptation falls back to the reservoir — and it is still
      // **selective**: only what the posting actually asks about, never the whole identity.
      expect(adapted.representationId).toBeUndefined();
      expect(adapted.assessment.baseline).toEqual([]);
      expect(adapted.elements.every((element) => element.origin === 'recovered')).toBe(true);
      expect(adapted.elements.map((element) => element.canonicalTitle)).toEqual([
        'Built a rota optimiser',
      ]);
      // The degree, the internship and the options pricer are all canonical and all absent: this
      // posting asks about Python and nothing else.
      expect(JSON.stringify(adapted.elements)).not.toContain('University of Bristol');
      expect(JSON.stringify(adapted.elements)).not.toContain('options pricer');
    });
  });

  describe('Adaptation writes nothing canonical', () => {
    it('leaves Explicit State, Learned State and the outbox untouched', async () => {
      const personId = await establishPerson();
      const before = (await identity.getExplicitState(personId))!;
      const outboxBefore = await db.query<{ count: string }>('SELECT count(*) FROM event_outbox');

      const view = await adaptation.createContext({
        personId,
        opportunityId: 'opp-markets',
        createdBy: 'user-1',
      });
      await adaptation.getContext(view.context.id);

      const after = (await identity.getExplicitState(personId))!;
      expect(after.revision).toBe(before.revision);
      expect(after.reconstructed).toEqual(before.reconstructed);
      expect(after.stated).toEqual(before.stated);
      // Durable Identity exposes no learned component at all: PCI is Memory / PCI's, not held
      // here (ADR 0030). Adaptation could not write it through this authority if it tried.
      expect('learned' in (await identity.getDurableIdentity(personId))!).toBe(false);

      // Assembling a context is not a durable fact about the person, so it is not an event.
      const outboxAfter = await db.query<{ count: string }>('SELECT count(*) FROM event_outbox');
      expect(outboxAfter.rows[0]!.count).toBe(outboxBefore.rows[0]!.count);
    });

    it('cannot write the lens it was given', async () => {
      const personId = await establishPerson();
      const lens = await identity.createRepresentation({
        personId,
        name: 'Markets',
        createdBy: 'user-1',
      });
      const before = (await identity.getRepresentation(lens.id))!;

      await adaptation.createContext({
        personId,
        opportunityId: 'opp-markets',
        representationId: lens.id,
        createdBy: 'user-1',
      });

      const after = (await identity.getRepresentation(lens.id))!;
      // One opportunity does not get to rewrite how someone generally presents themselves. The
      // service holds a read-only reader; there is no write to call.
      expect(after.representation.revision).toBe(before.representation.revision);
      expect(after.positioning.decisions).toEqual(before.positioning.decisions);
      // Sorted, because declaration order is not the point: the point is that every method here is
      // Adaptation-owned — contexts, `A^C`, the routing seam, and UC10/UC11 drafts and elicited
      // input. None of them writes canonical state.
      expect(Object.getOwnPropertyNames(Object.getPrototypeOf(adaptation)).sort()).toEqual([
        'assessReadiness',
        'composeAdaptedState',
        'constructor',
        'createContext',
        'editDraft',
        'generateRepresentation',
        'getContext',
        'getDraft',
        'listContexts',
        'listDrafts',
        'provideApplicationInput',
        'resolveCvPath',
      ]);
    });

    it('refuses a lens that is not this person\'s', async () => {
      const personId = await establishPerson();
      const { personId: otherId } = await identity.captureSource({
        contentType: 'text/plain',
        content: Buffer.from(`${CV}\nOther person`, 'utf8'),
      });
      const otherLens = await identity.createRepresentation({
        personId: otherId,
        name: 'Markets',
        createdBy: 'user-2',
      });

      await expect(
        adaptation.createContext({
          personId,
          opportunityId: 'opp-markets',
          representationId: otherLens.id,
          createdBy: 'user-1',
        }),
      ).rejects.toThrow(/No Identity Representation/);
    });
  });
});
