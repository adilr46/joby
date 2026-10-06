/**
 * `apps/api` — the HTTP runtime.
 *
 * Still no framework: the route table below is small enough that adding one would be
 * infrastructure ahead of need. Revisit when routing, validation or middleware actually hurt.
 *
 * The API uses domain packages directly, in process. It never calls a domain over HTTP.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createApplication } from '@joby/application';
import { createSocial } from '@joby/social';
import { handleSocialRequest } from './routes/social';
import { handleApplicationRequest } from './routes/application';
import { createSocialActorResolver } from './social-auth';

import { createDatabase, databaseConfigFromEnv, type Database } from '@joby/database';
import { createOpportunity, createOpportunityUnderstanding } from '@joby/opportunity';
import type { OpportunityUnderstandingPort } from '@joby/translation/adaptation';
import { createRouter, OpportunityNotEvaluatableError, OpportunityNotRoutableError } from '@joby/router';
import { LayeredPci } from '@joby/pci';
import { createAdaptation } from '@joby/translation/adaptation';
import {
  ClaudeSurfaceInterpreter,
  CompositeJobyQueryPort,
  DeterministicSurfaceInterpreter,
  createApplicationSessionModule,
  createSurfaceInspectionModule,
  createSurfaceResolutionModule,
  type JobyQuery,
} from '@joby/translation/execution';
import { createIdentityRuntime } from '@joby/identity/runtime';
import { createIdentityRepresentationRuntime } from '@joby/identity/representation/runtime';
import { AnthropicDrivePlanner, PortalBrowserSessionRegistry } from '@joby/portal';

import { handleOpportunityRequest } from './routes/opportunity';
import { handleAdaptationRequest } from './routes/adaptation';
import { handleIdentityRequest } from './routes/identity';
import { handleExecutionRequest } from './routes/execution';

const PORT = Number(process.env.PORT ?? 3001);

const db: Database = createDatabase(databaseConfigFromEnv());
// The HTTP surface serves external and web clients, so it composes from `/runtime`: the domain
// contract plus source acquisition and job inspection. Another *domain* gets `@joby/identity`.
const identity = createIdentityRuntime({ db });
const representations = createIdentityRepresentationRuntime({ db, identity });

/**
 * UC01/UC02 — capture and understanding, wired where both sides may be imported.
 *
 * The capture partition holds raw evidence; the understanding partition reads it through the
 * narrow, read-only port below. Only a composition root may import both, which is what keeps
 * `@joby/translation -> @joby/opportunity` off the package graph.
 */
const opportunityRecords = createOpportunity({ db });
const applications = createApplication({ db });
const resolveSocialActor = createSocialActorResolver();
const understanding = createOpportunityUnderstanding({
  db,
  opportunities: {
    listSummaries: (options) => opportunityRecords.listSummaries(options),
    readEvidence: (opportunityId) => opportunityRecords.readEvidenceText(opportunityId),
  },
});

/**
 * **The External World stream Adaptation reads** (ADR 0031).
 *
 * Opportunity owns the understanding; Adaptation consumes it through a narrow port and performs the
 * person x world contextual interpretation itself. Only a composition root imports both sides, which
 * is what keeps `@joby/translation -> @joby/opportunity` off the package graph.
 */
const opportunities: OpportunityUnderstandingPort = {
  getUnderstanding: async (opportunityId) =>
    (await understanding.getUnderstanding(opportunityId))?.understanding,
};

const social = createSocial({
  db, applications,
  describeOpportunity: async (id, revision) => {
    const stored = await understanding.getUnderstanding(id, revision);
    return stored ? { company: stored.understanding.company, role: stored.understanding.role } : undefined;
  },
});

/**
 * **Router** — which Representation should this opportunity start from? (ADR 0031)
 *
 * The learned model is `LayeredPci` (ADR 0041): Beta-Bernoulli shared population priors, blended
 * with this person's own resolved evidence at read time. With no rows yet migrated or observed it
 * returns the same empty/zero-support answer `NoLearnedPci` always gave, through real SQL against
 * `pci_shared_cell` / `pci_personal_cell` — run `pnpm db:migrate` before starting this process, or
 * every prior read throws instead of returning an honest empty prior. Router already bounds a
 * prior's influence below one covered capability, so a real learned weight changes tie-breaks and
 * never overrules what the posting asks for.
 *
 * Nothing calls `pci.observe` yet — Application's `OutcomeObserved` has no PCI subscriber (ADR
 * 0031 unresolved work). Until that handler exists, both tables stay empty and every prior reads
 * back as `basis: 'shared', sharedSupport: 0`.
 */
const pci = new LayeredPci(db);
const router = createRouter({
  identity: {
    listRoutableRepresentations: async (personId) => {
      const lenses = await representations.listRepresentations(personId);
      const routable = await Promise.all(
        lenses.map(async (lens) => {
          const view = await representations.getRepresentation(lens.id);
          const exposed = (view?.positioning.evidence ?? [])
            .filter((entry) => entry.included)
            .flatMap((entry) => entry.capabilities ?? []);
          return { representationId: lens.id, name: lens.name, exposedCapabilities: exposed };
        }),
      );
      return routable;
    },
  },
  opportunities: {
    getRoutableOpportunity: async (opportunityId) => {
      const stored = await understanding.getUnderstanding(opportunityId);
      if (!stored) return undefined;
      return {
        opportunityId,
        revision: stored.understanding.revision,
        requiredCapabilities: stored.understanding.requiredCapabilities ?? [],
        preferredCapabilities: stored.understanding.preferredCapabilities ?? [],
      };
    },
  },
  priors: {
    weightsFor: async (input) => (await pci.routingPrior(input)).weights,
  },
  opportunityDecisioning: {
    identity: {
      listEvidenceCapabilities: async (personId) => {
        const view = await identity.getPermanentIdentityView(personId);
        if (!view) return [];
        return view.skills.flatMap((skill) =>
          skill.evidencedBy.map((label) => ({
            capability: skill.capability,
            evidenceId: label,
            label,
          })),
        );
      },
      listStatedConditions: async (personId) =>
        (await identity.getExplicitState(personId))?.stated.conditions ?? [],
    },
    opportunities: {
      getEvaluatableOpportunity: async (opportunityId) => {
        const stored = await understanding.getUnderstanding(opportunityId);
        if (!stored) return undefined;
        return {
          opportunityId,
          revision: stored.understanding.revision,
          requiredCapabilities: stored.understanding.requiredCapabilities ?? [],
          preferredCapabilities: stored.understanding.preferredCapabilities ?? [],
          ...(stored.understanding.conditions ? { conditions: stored.understanding.conditions } : {}),
          ...(stored.understanding.responsibilities ? { responsibilities: stored.understanding.responsibilities } : {}),
          ...(stored.understanding.uncertainty ? { uncertainty: stored.understanding.uncertainty } : {}),
        };
      },
    },
  },
});

const adaptation = createAdaptation({
  db,
  identity: {
    personExists: async (personId) => (await identity.getPerson(personId)) !== undefined,
    readStatedContext: async (personId) => (await identity.getExplicitState(personId))?.stated,
    // Adaptation asks for a revision, not a projection of the whole person. How Durable
    // Identity answers that cheaply is its own business (ADR 0030 retrieval semantics).
    readIdentityRevision: async (personId) => (await identity.getExplicitState(personId))?.revision,
    projectIdentity: (personId) => identity.getPermanentIdentityView(personId),
  },
  representations,
  opportunities,
});

const executionSessions = createApplicationSessionModule({ db });
const surfaceInterpreter = process.env.ANTHROPIC_API_KEY
  ? new ClaudeSurfaceInterpreter({ apiKey: process.env.ANTHROPIC_API_KEY })
  : new DeterministicSurfaceInterpreter();
const executionInspection = createSurfaceInspectionModule({
  interpreter: surfaceInterpreter,
  sessions: executionSessions,
});
const executionQuery = new CompositeJobyQueryPort([
  {
    source: 'known_professional_fact',
    resolve: async (query) => matchKnownFact(query, await knownFactsFor(query.personId)),
  },
  {
    source: 'stated_context',
    resolve: async (query) => {
      const stated = (await identity.getExplicitState(query.personId))?.stated;
      if (!stated) return undefined;
      return matchKnownFact(query, [
        ...(stated.careerDirection ? [{ label: 'career direction', value: stated.careerDirection }] : []),
        ...(stated.preferences ?? []).map((value) => ({ label: 'preference', value })),
        ...(stated.constraints ?? []).map((value) => ({ label: 'constraint', value })),
        ...(stated.conditions ?? []).map((condition) => ({ label: condition.kind, value: condition.values.join(' | ') })),
      ]);
    },
  },
  {
    source: 'opportunity_information',
    resolve: async (query) => {
      const opportunity = await opportunities.getUnderstanding(query.opportunityId);
      if (!opportunity) return undefined;
      return matchKnownFact(query, [
        ...(opportunity.role ? [{ label: 'role', value: opportunity.role }] : []),
        ...(opportunity.company ? [{ label: 'company', value: opportunity.company }] : []),
        ...(opportunity.responsibilities ?? []).map((value) => ({ label: 'responsibility', value })),
        ...(opportunity.requiredCapabilities ?? []).map((value) => ({ label: 'required capability', value })),
        ...(opportunity.preferredCapabilities ?? []).map((value) => ({ label: 'preferred capability', value })),
      ]);
    },
  },
  {
    source: 'generated_answer',
    resolve: async (query) => {
      if (query.requirementKind !== 'generated_answer') return undefined;
      const context = (await adaptation.listContexts(query.personId)).find(
        (candidate) => candidate.opportunityId === query.opportunityId,
      );
      if (!context) return undefined;
      const generated = await adaptation.generateRepresentation({
        contextId: context.id,
        surface: 'application_answer',
        question: query.requirementLabel,
        generatedBy: 'execution',
      });
      if (!generated || generated.status !== 'generated') return undefined;
      return generated.draft.generated.map((segment) => segment.text).join('\n\n');
    },
  },
]);
const executionResolution = createSurfaceResolutionModule({
  query: executionQuery,
  sessions: executionSessions,
});
const portal = new PortalBrowserSessionRegistry({
  headless: process.env.JOBY_PORTAL_HEADLESS !== 'false',
});
const drivePlanner = process.env.ANTHROPIC_API_KEY
  ? new AnthropicDrivePlanner({ apiKey: process.env.ANTHROPIC_API_KEY })
  : undefined;

const server = createServer((request: IncomingMessage, response: ServerResponse) => {
  void (async () => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

      if (request.method === 'GET' && url.pathname === '/health') {
        await db.query('SELECT 1');
        return send(response, 200, { status: 'ok' });
      }

      if (request.method === 'GET' && url.pathname === '/routing') {
        const personId = url.searchParams.get('personId');
        const opportunityId = url.searchParams.get('opportunityId');
        if (!personId || !opportunityId) {
          return send(response, 400, { error: "'personId' and 'opportunityId' are required." });
        }
        try {
          return send(response, 200, await router.recommendRepresentation({ personId, opportunityId }));
        } catch (error) {
          if (error instanceof OpportunityNotRoutableError) {
            return send(response, 409, { error: error.message });
          }
          throw error;
        }
      }

      if (request.method === 'POST' && url.pathname === '/routing/opportunities') {
        const body = await readJson(request);
        const personId = String(body.personId ?? '');
        const opportunityIds = Array.isArray(body.opportunityIds) ? body.opportunityIds.map(String) : [];
        if (!personId || opportunityIds.length === 0) {
          return send(response, 400, { error: "'personId' and 'opportunityIds' are required." });
        }
        try {
          return send(
            response,
            200,
            await router.routeOpportunities({
              personId,
              opportunityIds,
              ...(body.comparisonSetId ? { comparisonSetId: String(body.comparisonSetId) } : {}),
            }),
          );
        } catch (error) {
          if (error instanceof OpportunityNotEvaluatableError) {
            return send(response, 409, { error: error.message });
          }
          throw error;
        }
      }

      if (url.pathname === '/opportunities' || url.pathname.startsWith('/opportunities/')) {
        return await handleOpportunityRequest({
          request,
          response,
          url,
          opportunities: opportunityRecords,
          understanding,
        });
      }

      if (url.pathname.startsWith('/identity/')) {
        return await handleIdentityRequest({ request, response, url, identity, representations });
      }

      if (url.pathname.startsWith('/social/')) {
        return await handleSocialRequest({ request, response, url, social, resolveActor: resolveSocialActor });
      }
      if (url.pathname.startsWith('/applications/')) {
        return await handleApplicationRequest({ request, response, url, applications, resolveActor: resolveSocialActor });
      }

      if (url.pathname.startsWith('/adaptation/')) {
        return await handleAdaptationRequest({ request, response, url, adaptation });
      }

      if (url.pathname.startsWith('/execution/')) {
        return await handleExecutionRequest({
          request,
          response,
          url,
          sessions: executionSessions,
          inspection: executionInspection,
          resolution: executionResolution,
          portal,
          drivePlanner,
          knownFactsFor,
          opportunityContextFor: opportunities.getUnderstanding,
        });
      }

      return send(response, 404, { error: 'not found' });
    } catch (error) {
      console.error('[api] request failed', error);
      return send(response, 500, { error: 'internal error' });
    }
  })();
});

export function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

server.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[api] ${signal} — shutting down`);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await portal.closeAll();
  await db.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

async function knownFactsFor(personId: string): Promise<readonly { readonly label: string; readonly value: string }[]> {
  const view = await identity.getPermanentIdentityView(personId);
  if (!view) return [];
  return [
    ...view.education.flatMap(viewFacts),
    ...view.experience.flatMap(viewFacts),
    ...view.projects.flatMap(viewFacts),
    ...view.achievements.flatMap(viewFacts),
    ...view.skills.map((skill) => ({ label: skill.capability, value: skill.capability })),
    ...view.evidence.map((entry) => ({ label: entry.label, value: entry.quote ?? entry.label })),
  ];
}

function viewFacts(entry: {
  readonly title: string;
  readonly detail?: string;
  readonly capabilities?: readonly string[];
  readonly activities?: readonly {
    readonly title: string;
    readonly detail?: string;
    readonly capabilities?: readonly string[];
  }[];
}): readonly { readonly label: string; readonly value: string }[] {
  return [
    { label: entry.title, value: [entry.title, entry.detail].filter(Boolean).join(': ') },
    ...(entry.capabilities ?? []).map((capability) => ({ label: capability, value: capability })),
    ...(entry.activities ?? []).flatMap(viewFacts),
  ];
}

function matchKnownFact(
  query: JobyQuery,
  facts: readonly { readonly label: string; readonly value: string }[],
): string | undefined {
  const wanted = normalize(query.requirementLabel);
  const exact = facts.find((fact) => normalize(fact.label) === wanted);
  if (exact) return exact.value;
  const contained = facts.find((fact) => {
    const label = normalize(fact.label);
    return label.length > 3 && (wanted.includes(label) || label.includes(wanted));
  });
  return contained?.value;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
