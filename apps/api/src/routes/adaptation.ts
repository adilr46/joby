/**
 * Adaptation HTTP routes — Module 1, Context Interpretation.
 *
 * | Method | Path | Purpose |
 * |---|---|---|
 * | POST | `/adaptation/contexts` | UC01 — create the context for one opportunity |
 * | GET | `/adaptation/contexts/:id` | UC02–UC04 — the context, re-derived on read |
 * | GET | `/adaptation/contexts/:id/adapted-state` | UC05–UC08 — `A^C`, composed on request |
 * | GET | `/adaptation/persons/:id/contexts` | That person's adaptation contexts |
 * | GET | `/adaptation/contexts/:id/readiness` | UC10/UC11 — is there enough to write without inventing? |
 * | POST | `/adaptation/contexts/:id/input` | Answer one of Joby's questions |
 * | POST | `/adaptation/contexts/:id/generate` | Generate a draft, or return the questions |
 * | GET | `/adaptation/contexts/:id/drafts` | Drafts for this opportunity |
 * | PATCH | `/adaptation/drafts/:id` | Apply the person's edit |
 *
 * The response carries aligned, conflicting, uncertain and neutral conditions, and
 * `blocksApplication: false`. The decision to pursue is the person's; nothing here filters, disables
 * or gates.
 *
 * Adaptation reads opportunity understanding through a port supplied by the composition root, now
 * backed by real captured-and-interpreted understanding. It never interprets a job description
 * itself.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  InvalidAdaptationContextError,
  AdaptationConcurrencyError,
  OpportunityNotUnderstoodError,
  WritingError,
  type AdaptationModule,
  type ApplicationInputKind,
  type CreateAdaptationContextInput,
  type DraftSegment,
  type RepresentationSurface,
  type SurfaceConstraints,
} from '@joby/translation/adaptation';

interface RouteContext {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly url: URL;
  readonly adaptation: AdaptationModule;
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks);
  if (body.byteLength === 0) return {};
  try {
    return JSON.parse(body.toString('utf8')) as Record<string, unknown>;
  } catch (error) {
    throw new InvalidAdaptationContextError(`Body is not valid JSON: ${String(error)}`);
  }
}

export async function handleAdaptationRequest(context: RouteContext): Promise<void> {
  const { request, response, url, adaptation } = context;
  const [, resource, id, action] = url.pathname.split('/').filter(Boolean);

  try {
    if (request.method === 'POST' && resource === 'contexts' && !id) {
      const body = (await readJson(request)) as unknown as CreateAdaptationContextInput;
      const view = await adaptation.createContext({
        personId: String(body.personId ?? ''),
        opportunityId: String(body.opportunityId ?? ''),
        createdBy: String(body.createdBy ?? 'user'),
        ...(body.representationId ? { representationId: body.representationId } : {}),
      });
      // Temporary contextual state, labelled at the boundary so nothing reads it as person-state.
      return send(response, 201, { ...view, canonical: false });
    }

    if (request.method === 'GET' && resource === 'contexts' && id && !action) {
      const view = await adaptation.getContext(id);
      return view
        ? send(response, 200, { ...view, canonical: false })
        : send(response, 404, { error: 'adaptation context not found' });
    }

    // `A^C` — composed on request from the lens, the canonical snapshot and this context. Stored
    // nowhere, so it cannot drift; no document is rendered here.
    if (request.method === 'GET' && resource === 'contexts' && id && action === 'adapted-state') {
      const adapted = await adaptation.composeAdaptedState(id);
      return adapted
        ? send(response, 200, { ...adapted, canonical: false })
        : send(response, 404, { error: 'adaptation context not found' });
    }

    if (request.method === 'GET' && resource === 'contexts' && id && action === 'readiness') {
      const surface = (url.searchParams.get('surface') ?? 'cover_letter') as RepresentationSurface;
      const question = url.searchParams.get('question');
      const assessed = await adaptation.assessReadiness({
        contextId: id,
        surface,
        ...(question ? { question } : {}),
      });
      return assessed
        ? send(response, 200, assessed)
        : send(response, 404, { error: 'adaptation context not found' });
    }

    if (request.method === 'POST' && resource === 'contexts' && id && action === 'input') {
      const body = await readJson(request);
      const provided = await adaptation.provideApplicationInput({
        contextId: id,
        kind: String(body.kind ?? '') as ApplicationInputKind,
        prompt: String(body.prompt ?? ''),
        answer: String(body.answer ?? ''),
        providedBy: String(body.providedBy ?? 'user'),
      });
      return send(response, 200, { contextId: id, provided });
    }

    if (request.method === 'POST' && resource === 'contexts' && id && action === 'generate') {
      const body = await readJson(request);
      const outcome = await adaptation.generateRepresentation({
        contextId: id,
        surface: String(body.surface ?? 'cover_letter') as RepresentationSurface,
        generatedBy: String(body.generatedBy ?? 'user'),
        ...(body.question ? { question: String(body.question) } : {}),
        ...(body.constraints ? { constraints: body.constraints as SurfaceConstraints } : {}),
      });
      if (!outcome) return send(response, 404, { error: 'adaptation context not found' });

      // 200 either way: questions are a designed outcome, not an error. The status field says which.
      return send(response, 200, { ...outcome, canonical: false, submitted: false });
    }

    if (request.method === 'GET' && resource === 'contexts' && id && action === 'drafts') {
      return send(response, 200, { contextId: id, drafts: await adaptation.listDrafts(id) });
    }

    if (request.method === 'PATCH' && resource === 'drafts' && id && !action) {
      const body = await readJson(request);
      const draft = await adaptation.editDraft({
        draftId: id,
        expectedRevision: Number(body.expectedRevision),
        segments: (body.segments ?? []) as DraftSegment[],
        editedBy: String(body.editedBy ?? 'user'),
      });
      return send(response, 200, draft);
    }

    if (request.method === 'GET' && resource === 'persons' && id && action === 'contexts') {
      return send(response, 200, { personId: id, contexts: await adaptation.listContexts(id) });
    }

    return send(response, 404, { error: 'not found' });
  } catch (error) {
    // 422, not 404: the opportunity may exist, but Opportunity understanding is not available yet.
    // Adaptation does not read a job description itself.
    if (error instanceof OpportunityNotUnderstoodError) {
      return send(response, 422, { error: error.message });
    }
    if (error instanceof InvalidAdaptationContextError) {
      return send(response, 422, { error: error.message });
    }
    // 422, not 400: the request was well-formed. It asked Joby to interpret a posting, which is a
    // different domain's work.
    // 422: the request was fine, the draft was not — a claim with nothing behind it, or a limit
    // that cannot be met honestly. Nothing was stored.
    if (error instanceof WritingError) return send(response, 422, { error: error.message });
    if (error instanceof AdaptationConcurrencyError) return send(response, 409, { error: error.message });
    throw error;
  }
}
