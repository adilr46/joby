import { createDatabase } from '@joby/database';
import { createIdentity } from '@joby/identity';
import { createAdaptation } from '@joby/translation/adaptation';
import { DeterministicCvExtractor, IdentityService } from '@joby/identity/runtime';
import { FakeOpportunityUnderstandingPort } from '@joby/translation/testing';

const db = createDatabase({ connectionString: process.env.DATABASE_URL! });
const identity = createIdentity(db, { extractor: new DeterministicCvExtractor() });

const CV = 'Education\nUniversity of Bristol, 2022 - 2026\n- Studied compilers\n\nProjects\nRota scheduler\n- Wrote a constraint solver for shift allocation\n';
const { personId } = await identity.captureSource({ contentType: 'text/plain', content: Buffer.from(CV) });
await new IdentityService({ db, extractor: new DeterministicCvExtractor() }).runReconstruction();
const proposal = (await identity.listProposals(personId))[0]!;
await identity.confirmReview({
  proposalId: proposal.id, expectedRevision: 0, confirmedBy: 'user-1',
  decisions: [...proposal.content.structure, ...proposal.content.activities, ...proposal.content.relations]
    .map((i) => ({ itemId: i.id, decision: 'retain' as const })),
});

await identity.setStatedContext({
  personId, expectedRevision: 1, statedBy: 'user-1',
  careerDirection: 'Markets, ideally rates',
  constraints: ['I need to keep Fridays free'],
  conditions: [
    { kind: 'duration', values: ['12 months'] },
    { kind: 'work_arrangement', values: ['Hybrid', 'Remote'] },
    { kind: 'start_date', values: ['September 2026'] },
    { kind: 'location', values: ['Bristol', 'Bath'], note: 'I can travel occasionally' },
  ],
});

const lens = await identity.createRepresentation({ personId, name: 'Markets', purpose: 'Sales & trading placements.', createdBy: 'user-1' });

const opportunities = new FakeOpportunityUnderstandingPort([{
  opportunityId: 'barclays-markets', revision: 1,
  role: 'Markets Placement', company: 'Barclays',
  requiredCapabilities: ['Python', 'Statistics'],
  conditions: { duration: ['12 months'], work_arrangement: ['Hybrid'], start_date: ['September 2026'], location: ['London'] },
  applicationQuestions: ['Why this desk?'],
  attribution: ['posting: careers.barclays/1'],
  uncertainty: ['Sponsorship policy is not stated'],
}]);

const adaptation = createAdaptation({ db, identity, opportunities });
const view = await adaptation.createContext({ personId, opportunityId: 'barclays-markets', representationId: lens.id, createdBy: 'user-1' });

console.log('context:', { id: view.context.id.slice(0, 8), lens: view.prior?.name, oppRev: view.context.opportunityRevision, idRev: view.context.identityRevision });
console.log('\nAligned');
for (const c of view.intersection.aligned) console.log('  ✓', c.summary);
console.log('Conflict');
for (const c of view.intersection.conflicts) console.log('  ⚠', c.summary, c.note ? `(note: ${c.note})` : '');
console.log('Uncertain');
for (const c of view.intersection.uncertain) console.log('  ?', c.summary);
console.log('Other constraints:', view.intersection.otherConstraints);
console.log('Posting uncertainty:', view.opportunity.uncertainty);
console.log('blocksApplication:', view.intersection.blocksApplication);
console.log('carries evidence?', JSON.stringify(view).includes('Rota scheduler') ? 'YES (bug)' : 'no');
await db.close();
