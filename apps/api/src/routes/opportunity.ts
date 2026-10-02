/**
 * Opportunity HTTP routes — UC01 capture, UC02 understand.
 *
 * | Method | Path | Purpose |
 * |---|---|---|
 * | POST | `/opportunities` | UC01 — capture evidence, creating the opportunity |
 * | POST | `/opportunities/:id/evidence` | UC01 — capture further evidence about one |
 * | GET | `/opportunities/:id` | The record and its captured evidence, raw |
 * | GET | `/opportunities/:id/evidence/:evidenceId` | The bytes exactly as captured |
 * | GET | `/opportunities/:id/understanding` | UC02 — the structured understanding |
 * | POST | `/opportunities/:id/understanding` | UC02 — read current evidence into a new revision |
 *
 * **The two halves are separate URLs on purpose.** Raw evidence is served by Opportunity and
 * interpretation by the legacy understanding partition, and no response mixes them: a caller can always tell what the
 * posting said from what Joby made of it.
 *
 * Nothing here involves a person. That is the whole point of this slice — no fit, no ranking, no
 * recommendation, and `mapOpportunityToPerson` is not reachable from any route below.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  EvidenceTooLargeError,
  InterpretationError,
  OpportunityNotCapturedError,
  OpportunityNotFoundError,
  UnsupportedEvidenceError,
  type CaptureEvidenceInput,
  type EvidenceKind,
  type OpportunityModule,
  type OpportunityUnderstandingService,
} from '@joby/opportunity';


interface RouteContext {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly url: URL;
  readonly opportunities: OpportunityModule;
  readonly understanding: OpportunityUnderstandingService;
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
    throw new UnsupportedEvidenceError(`Body is not valid JSON: ${String(error)}`);
  }
}

function optionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new UnsupportedEvidenceError(`'${key}' must be a string.`);
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function readCapture(body: Record<string, unknown>, opportunityId?: string): CaptureEvidenceInput {
  const text = body.text;
  if (typeof text !== 'string' || text.trim() === '') {
    throw new UnsupportedEvidenceError(
      "'text' is required: this is the evidence, retained exactly as given.",
    );
  }
  const source = optionalString(body, 'source');
  if (!source) {
    throw new UnsupportedEvidenceError(
      "'source' is required: evidence with no provenance cannot be traced back to anywhere.",
    );
  }

  return {
    ...(opportunityId ? { opportunityId } : {}),
    source,
    contentType: optionalString(body, 'contentType') ?? 'text/plain',
    content: Buffer.from(text, 'utf8'),
    ...(optionalString(body, 'kind') ? { kind: optionalString(body, 'kind') as EvidenceKind } : {}),
    ...(optionalString(body, 'title') ? { title: optionalString(body, 'title')! } : {}),
    ...(optionalString(body, 'organisation')
      ? { organisation: optionalString(body, 'organisation')! }
      : {}),
    ...(optionalString(body, 'externalRef') ? { externalRef: optionalString(body, 'externalRef')! } : {}),
    ...(optionalString(body, 'uri') ? { uri: optionalString(body, 'uri')! } : {}),
  };
}

export async function handleOpportunityRequest(context: RouteContext): Promise<void> {
  const { request, response, url, opportunities, understanding } = context;
  const [, id, action, evidenceId] = url.pathname.split('/').filter(Boolean);

  try {
    if (request.method === 'POST' && !id) {
      const result = await opportunities.captureEvidence(readCapture(await readJson(request)));
      return send(response, result.duplicate ? 200 : 201, result);
    }

    if (!id) return send(response, 404, { error: 'not found' });

    if (request.method === 'POST' && action === 'evidence') {
      const result = await opportunities.captureEvidence(readCapture(await readJson(request), id));
      return send(response, result.duplicate ? 200 : 201, result);
    }

    if (request.method === 'GET' && action === 'evidence' && evidenceId) {
      const item = await opportunities.getEvidenceContent(evidenceId);
      if (!item || item.opportunityId !== id) return send(response, 404, { error: 'not found' });
      // The bytes exactly as captured, served as what they are rather than re-encoded into JSON.
      response.writeHead(200, { 'content-type': item.contentType });
      return void response.end(item.content);
    }

    if (request.method === 'POST' && action === 'understanding') {
      const stored = await understanding.understand(id);
      return send(response, 201, stored);
    }

    if (request.method === 'GET' && action === 'understanding') {
      const revisionParam = url.searchParams.get('revision');
      const revision = revisionParam === null ? undefined : Number(revisionParam);
      if (revision !== undefined && !Number.isInteger(revision)) {
        return send(response, 400, { error: "'revision' must be an integer." });
      }
      const stored = await understanding.getUnderstanding(id, revision);
      return stored
        ? send(response, 200, stored)
        : send(response, 404, {
            error:
              'No understanding for this opportunity yet. Capture evidence, then POST to this path ' +
              'or let the worker read it.',
          });
    }

    if (request.method === 'GET' && !action) {
      const record = await opportunities.getOpportunity(id);
      return record ? send(response, 200, record) : send(response, 404, { error: 'not found' });
    }

    return send(response, 404, { error: 'not found' });
  } catch (error) {
    if (error instanceof UnsupportedEvidenceError) return send(response, 400, { error: error.message });
    if (error instanceof EvidenceTooLargeError) return send(response, 413, { error: error.message });
    if (error instanceof OpportunityNotFoundError) return send(response, 404, { error: error.message });
    if (error instanceof OpportunityNotCapturedError) return send(response, 409, { error: error.message });
    // A reading Joby refused to store. The evidence is untouched and the request can be retried.
    if (error instanceof InterpretationError) return send(response, 422, { error: error.message });
    throw error;
  }
}
