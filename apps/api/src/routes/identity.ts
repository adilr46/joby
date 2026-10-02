/**
 * Identity HTTP routes — for external and web clients. Other domains call the package directly.
 *
 * | Method | Path | Purpose |
 * |---|---|---|
 * | POST | `/identity/sources` | Capture a CV. Creates the Person when `x-person-id` is absent |
 * | GET | `/identity/sources/:id` | The three lifecycle facts for that source |
 * | GET | `/identity/jobs/:id` | Reconstruction progress |
 * | POST | `/identity/jobs/:id/retry` | Re-queue a failed reconstruction |
 * | GET | `/identity/proposals/:id` | The reviewable proposal |
 * | POST | `/identity/proposals/:id/confirm` | Apply a reviewed set atomically |
 * | GET | `/identity/proposals/:id/review` | What was proposed, changed, excluded, confirmed |
 * | GET | `/identity/persons/:id` | Durable Identity — R, X and L as distinct components |
 * | GET | `/identity/persons/:id/explicit-state` | Canonical E = (R, X) |
 * | PUT | `/identity/persons/:id/stated-context` | Write X — direction, preferences, conditions |
 * | GET | `/identity/persons/:id/proposals` | That person's proposals |
 * | GET | `/identity/persons/:id/corrections` | Correction history |
 * | POST | `/identity/persons/:id/nodes` | Add a fact directly |
 * | PATCH | `/identity/nodes/:id` | Correct a fact |
 * | DELETE | `/identity/nodes/:id` | Remove a fact |
 * | GET | `/identity/nodes/:id/provenance` | Where that fact came from |
 * | POST | `/identity/persons/:id/github` | Connect a GitHub account |
 * | GET | `/identity/persons/:id/github-repositories` | What is available, and what is selected |
 * | PUT | `/identity/persons/:id/github-repositories` | Choose which repositories Joby may use |
 * | POST | `/identity/persons/:id/github-ingest` | Capture the selected repositories |
 * | POST | `/identity/persons/:id/github-refresh` | Re-fetch one selected repository |
 * | GET | `/identity/persons/:id/view` | The Permanent Identity View |
 * | POST | `/identity/persons/:id/representations` | Create a named Identity Representation |
 * | GET | `/identity/persons/:id/representations` | That person's Identity Representations |
 * | GET | `/identity/representations/:id` | One representation, derived from current identity |
 * | PATCH | `/identity/representations/:id/decisions` | Include/hide, rank, emphasise, reword |
 * | PUT | `/identity/representations/:id/positioning` | The lens's reusable positioning themes |
 * | GET | `/identity/representations/:id/cv` | The general CV — `?format=json\|tex\|pdf` |
 * | GET | `/identity/representations/:id/prior` | The lens as an Adaptation positioning prior |
 *
 * The upload is a raw body rather than multipart: it needs no parser dependency, and this release
 * accepts text only. Multipart arrives with the file types that require it.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extractPdfText, PdfTextExtractionError, PdfTextExtractorUnavailableError } from '../pdf-text';

import {
  AlreadyConfirmedError,
  ConcurrencyError,
  DanglingRelationError,
  IncompleteReviewError,
  InvalidCorrectionError,
  InvalidStatedContextError,
  MissingPdfTextError,
  NodeNotFoundError,
  PersonNotFoundError,
  ProposalNotFoundError,
  SourceTooLargeError,
  UnknownProposalItemError,
  UnsupportedSourceError,
  type AddNodeInput,
  type ConfirmReviewInput,
  type CorrectNodeInput,
  type SetStatedContextInput,
} from '@joby/identity';
import {
  DuplicateRepresentationError,
  InvalidRepresentationError,
  RepresentationNotFoundError,
  type ApplyRepresentationDecisionsInput,
  type CreateRepresentationInput,
  type SetPositioningInput,
} from '@joby/identity/representation';
import {
  CvCompilationError,
  CvCompilerUnavailableError,
  type IdentityRepresentationRuntime,
} from '@joby/identity/representation/runtime';
import {
  GitHubNotConnectedError,
  RepositoryNotSelectedError,
  type GitHubCredentials,
  type DurableIdentityRuntime,
} from '@joby/identity/runtime';

const MAX_BODY_BYTES = 2 * 1024 * 1024;

interface RouteContext {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly url: URL;
  readonly identity: DurableIdentityRuntime;
  readonly representations: IdentityRepresentationRuntime;
}

const intakeAssets: Record<string, readonly [string, string]> = {
  '/identity/import': ['identity-import.html', 'text/html; charset=utf-8'],
  '/identity/import.js': ['identity-import.js', 'text/javascript; charset=utf-8'],
  '/identity/import.css': ['identity-import.css', 'text/css; charset=utf-8'],
  '/identity/proposal': ['identity-proposal.html', 'text/html; charset=utf-8'],
  '/identity/proposal.js': ['identity-proposal.js', 'text/javascript; charset=utf-8'],
  '/identity/proposal.css': ['identity-proposal.css', 'text/css; charset=utf-8'],
};

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.byteLength;
    // Stop reading rather than buffering an unbounded upload into memory.
    if (size > MAX_BODY_BYTES) throw new SourceTooLargeError(size);
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

export async function handleIdentityRequest(context: RouteContext): Promise<void> {
  const { request, response, url, identity, representations } = context;
  const intakeAsset = intakeAssets[url.pathname];
  if (request.method === 'GET' && intakeAsset) {
    response.writeHead(200, {
      'content-type': intakeAsset[1],
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'",
    });
    response.end(await readFile(new URL(`../../../web/public/${intakeAsset[0]}`, import.meta.url)));
    return;
  }
  const segments = url.pathname.split('/').filter(Boolean); // ['identity', ...]
  const [, resource, id, action] = segments;

  try {
    if (request.method === 'POST' && resource === 'sources' && !id) {
      const content = await readBody(request);
      const contentType = String(request.headers['content-type'] ?? '');
      const extractedText = contentType.split(';')[0]?.trim().toLowerCase() === 'application/pdf'
        ? await extractPdfText(content)
        : undefined;
      const personIdHeader = request.headers['x-person-id'];
      const filename = request.headers['x-filename'];

      const result = await identity.captureSource({
        contentType,
        content,
        ...(extractedText ? { extractedText } : {}),
        ...(typeof personIdHeader === 'string' && personIdHeader ? { personId: personIdHeader } : {}),
        ...(typeof filename === 'string' && filename ? { filename } : {}),
      });

      // 202: the source is durably captured and reconstruction is durably scheduled. It has not
      // run yet, and saying 201 would imply a result that does not exist.
      return send(response, 202, {
        personId: result.personId,
        sourceId: result.source.id,
        jobId: result.job.id,
        capturedAt: result.source.capturedAt,
        duplicate: result.duplicate,
        reconstruction: { status: result.job.status },
      });
    }

    if (request.method === 'GET' && resource === 'sources' && id) {
      const lifecycle = await identity.getSourceLifecycle(id);
      if (!lifecycle) return send(response, 404, { error: 'source not found' });

      // Three separate facts, deliberately not one status field.
      return send(response, 200, {
        source: lifecycle.source,
        captured: lifecycle.captured,
        reconstruction: {
          jobId: lifecycle.reconstruction.id,
          status: lifecycle.reconstruction.status,
          attempts: lifecycle.reconstruction.attempts,
          ...(lifecycle.reconstruction.lastError ? { lastError: lifecycle.reconstruction.lastError } : {}),
        },
        ...(lifecycle.proposalId ? { proposalId: lifecycle.proposalId } : {}),
        confirmed: lifecycle.confirmed,
      });
    }

    if (request.method === 'GET' && resource === 'jobs' && id && !action) {
      const job = await identity.getReconstructionJob(id);
      return job ? send(response, 200, job) : send(response, 404, { error: 'job not found' });
    }

    if (request.method === 'POST' && resource === 'jobs' && id && action === 'retry') {
      const requeued = await identity.retryReconstruction(id);
      return requeued
        ? send(response, 202, { jobId: id, status: 'pending' })
        : send(response, 409, { error: 'job is not in a failed state' });
    }

    if (request.method === 'GET' && resource === 'proposals' && id) {
      const proposal = await identity.getProposal(id);
      if (!proposal) return send(response, 404, { error: 'proposal not found' });

      // Labelled at the boundary so no client can mistake it for confirmed truth.
      return send(response, 200, { ...proposal, canonical: false });
    }

    if (request.method === 'GET' && resource === 'persons' && id && action === 'proposals') {
      const person = await identity.getPerson(id);
      if (!person) return send(response, 404, { error: 'person not found' });
      return send(response, 200, { personId: id, proposals: await identity.listProposals(id) });
    }

    // --- Review and canonical Explicit State ---------------------------------------------

    if (request.method === 'POST' && resource === 'proposals' && id && action === 'confirm') {
      const body = (await readJson(request)) as Omit<ConfirmReviewInput, 'proposalId'>;
      const result = await identity.confirmReview({ ...body, proposalId: id });
      return send(response, 200, result);
    }

    if (request.method === 'GET' && resource === 'proposals' && id && action === 'review') {
      const review = await identity.getReview(id);
      return review ? send(response, 200, review) : send(response, 404, { error: 'not reviewed' });
    }

    if (request.method === 'GET' && resource === 'persons' && id && action === 'explicit-state') {
      const state = await identity.getExplicitState(id);
      return state ? send(response, 200, state) : send(response, 404, { error: 'person not found' });
    }

    // The only path into X, and only the user takes it. No AI route reaches this.
    if (request.method === 'PUT' && resource === 'persons' && id && action === 'stated-context') {
      const body = (await readJson(request)) as Omit<SetStatedContextInput, 'personId'>;
      const result = await identity.setStatedContext({ ...body, personId: id });
      return send(response, 200, result);
    }

    // Durable Identity's own governed components: E and X. No learned state — PCI is Memory /
    // PCI's, not held here (ADR 0030).
    if (request.method === 'GET' && resource === 'persons' && id && !action) {
      const durable = await identity.getDurableIdentity(id);
      return durable ? send(response, 200, durable) : send(response, 404, { error: 'person not found' });
    }

    if (request.method === 'GET' && resource === 'persons' && id && action === 'corrections') {
      return send(response, 200, { personId: id, corrections: await identity.listCorrections(id) });
    }

    if (request.method === 'POST' && resource === 'persons' && id && action === 'nodes') {
      const body = (await readJson(request)) as Omit<AddNodeInput, 'personId'>;
      const result = await identity.addNode({ ...body, personId: id });
      return send(response, 201, result);
    }

    // --- Professional sources beyond the CV, and the projected view ----------------------

    if (request.method === 'POST' && resource === 'persons' && id && action === 'github') {
      const body = (await readJson(request)) as { accountLogin: string };
      return send(response, 200, await identity.connectGitHub(id, String(body.accountLogin)));
    }

    // Listing is not inspecting: it shows what the user can choose from and captures nothing.
    if (request.method === 'GET' && resource === 'persons' && id && action === 'github-repositories') {
      const available = await identity.listAvailableRepositories(id, githubCredentials(request));
      const selections = await identity.listRepositorySelections(id);
      return send(response, 200, { available, selections });
    }

    if (request.method === 'PUT' && resource === 'persons' && id && action === 'github-repositories') {
      const body = (await readJson(request)) as {
        repositories: readonly { fullName: string; selected: boolean; isPrivate?: boolean }[];
      };
      return send(response, 200, { selections: await identity.selectRepositories(id, body.repositories) });
    }

    if (request.method === 'POST' && resource === 'persons' && id && action === 'github-ingest') {
      const body = (await readJson(request)) as { only?: readonly string[] };
      const results = await identity.ingestSelectedRepositories(id, githubCredentials(request), {
        trigger: 'selection_changed',
        ...(body.only ? { only: body.only } : {}),
      });
      return send(response, 202, { results });
    }

    if (request.method === 'POST' && resource === 'persons' && id && action === 'github-refresh') {
      const body = (await readJson(request)) as { fullName: string };
      const result = await identity.refreshRepository(id, githubCredentials(request), String(body.fullName));
      return send(response, 202, result);
    }

    if (request.method === 'GET' && resource === 'persons' && id && action === 'view') {
      const view = await identity.getPermanentIdentityView(id);
      return view ? send(response, 200, view) : send(response, 404, { error: 'person not found' });
    }

    // --- Identity Representations: persistent, reusable, non-canonical lenses --------------

    if (request.method === 'POST' && resource === 'persons' && id && action === 'representations') {
      const body = (await readJson(request)) as Omit<CreateRepresentationInput, 'personId'>;
      const representation = await representations.createRepresentation({
        personId: id,
        name: String(body.name ?? ''),
        createdBy: String(body.createdBy ?? 'user'),
        ...(body.purpose ? { purpose: String(body.purpose) } : {}),
      });
      return send(response, 201, representation);
    }

    if (request.method === 'GET' && resource === 'persons' && id && action === 'representations') {
      const person = await identity.getPerson(id);
      if (!person) return send(response, 404, { error: 'person not found' });
      return send(response, 200, {
        personId: id,
        representations: await representations.listRepresentations(id),
      });
    }

    if (request.method === 'GET' && resource === 'representations' && id && !action) {
      const view = await representations.getRepresentation(id);
      if (!view) return send(response, 404, { error: 'representation not found' });

      // Labelled at the boundary, like a proposal is: persistent does not mean canonical, and a
      // client must not be able to mistake a lens for the person's professional truth.
      return send(response, 200, { ...view, canonical: false });
    }

    if (request.method === 'PATCH' && resource === 'representations' && id && action === 'decisions') {
      const body = (await readJson(request)) as Omit<
        ApplyRepresentationDecisionsInput,
        'representationId'
      >;
      const result = await representations.applyRepresentationDecisions({
        ...body,
        representationId: id,
      });
      return send(response, 200, result);
    }

    if (request.method === 'PUT' && resource === 'representations' && id && action === 'positioning') {
      const body = (await readJson(request)) as Omit<SetPositioningInput, 'representationId'>;
      const result = await representations.setRepresentationPositioning({
        ...body,
        representationId: id,
      });
      return send(response, 200, result);
    }

    // The general CV for a lens. Reusable across every opportunity in that domain — this is not a
    // tailored application document, and it is not what was submitted anywhere.
    if (request.method === 'GET' && resource === 'representations' && id && action === 'cv') {
      const header = {
        ...(url.searchParams.get('fullName') ? { fullName: url.searchParams.get('fullName')! } : {}),
        ...(url.searchParams.get('headline') ? { headline: url.searchParams.get('headline')! } : {}),
        ...(url.searchParams.has('contact')
          ? { contact: url.searchParams.getAll('contact') }
          : {}),
      };
      const rendered = await representations.renderRepresentationCv(id, header);
      if (!rendered) return send(response, 404, { error: 'representation not found' });

      const format = url.searchParams.get('format') ?? 'json';
      if (format === 'tex') {
        response.writeHead(200, { 'content-type': 'application/x-tex' });
        response.end(rendered.latex);
        return;
      }
      if (format === 'pdf') {
        const pdf = await representations.compileCv(rendered.latex);
        response.writeHead(200, {
          'content-type': 'application/pdf',
          'content-disposition': `inline; filename="${rendered.document.representationName}.pdf"`,
        });
        response.end(Buffer.from(pdf));
        return;
      }
      return send(response, 200, { ...rendered.document, canonical: false });
    }

    // `P_i`: how this person generally positions themselves here. Preferences keyed by canonical
    // node id and no evidence — a consumer still has to read Durable Identity.
    if (request.method === 'GET' && resource === 'representations' && id && action === 'prior') {
      const prior = await representations.getRepresentationPrior(id);
      return prior
        ? send(response, 200, prior)
        : send(response, 404, { error: 'representation not found' });
    }

    if (request.method === 'GET' && resource === 'nodes' && id && action === 'provenance') {
      return send(response, 200, { nodeId: id, provenance: await identity.getProvenance('node', id) });
    }

    if (request.method === 'PATCH' && resource === 'nodes' && id) {
      const body = (await readJson(request)) as Omit<CorrectNodeInput, 'nodeId'>;
      const result = await identity.correctNode({ ...body, nodeId: id });
      return send(response, 200, result);
    }

    if (request.method === 'DELETE' && resource === 'nodes' && id) {
      const body = (await readJson(request)) as Record<string, unknown>;
      const result = await identity.removeNode({
        nodeId: id,
        expectedRevision: Number(body.expectedRevision),
        correctedBy: String(body.correctedBy),
      });
      return send(response, 200, result);
    }

    return send(response, 404, { error: 'not found' });
  } catch (error) {
    if (error instanceof UnsupportedSourceError) return send(response, 415, { error: error.message });
    if (error instanceof MissingPdfTextError) return send(response, 422, { error: error.message });
    if (error instanceof PdfTextExtractorUnavailableError) return send(response, 503, { error: error.message });
    if (error instanceof PdfTextExtractionError) return send(response, 422, { error: error.message });
    if (error instanceof SourceTooLargeError) return send(response, 413, { error: error.message });
    if (error instanceof PersonNotFoundError) return send(response, 404, { error: error.message });
    if (error instanceof ProposalNotFoundError) return send(response, 404, { error: error.message });
    if (error instanceof NodeNotFoundError) return send(response, 404, { error: error.message });
    if (error instanceof RepresentationNotFoundError) return send(response, 404, { error: error.message });
    if (error instanceof DuplicateRepresentationError) return send(response, 409, { error: error.message });
    if (error instanceof InvalidRepresentationError) return send(response, 422, { error: error.message });
    if (error instanceof InvalidStatedContextError) return send(response, 422, { error: error.message });

    // 409, not 400: the request was well-formed, but the world moved. The client should re-read
    // and decide again rather than retry blindly.
    if (error instanceof ConcurrencyError) return send(response, 409, { error: error.message });
    if (error instanceof AlreadyConfirmedError) return send(response, 409, { error: error.message });

    if (error instanceof IncompleteReviewError) {
      return send(response, 422, { error: error.message, undecidedItemIds: error.undecidedItemIds });
    }
    if (error instanceof UnknownProposalItemError) {
      return send(response, 422, { error: error.message, itemIds: error.itemIds });
    }
    if (error instanceof DanglingRelationError) return send(response, 422, { error: error.message });
    if (error instanceof InvalidCorrectionError) return send(response, 422, { error: error.message });

    // 503, not 500: the request was right and the document exists — this deployment simply has no
    // LaTeX toolchain. `?format=tex` still works.
    if (error instanceof CvCompilerUnavailableError) return send(response, 503, { error: error.message });
    if (error instanceof CvCompilationError) return send(response, 500, { error: error.message });

    if (error instanceof GitHubNotConnectedError) return send(response, 409, { error: error.message });
    // 403, not 404: the repository may well exist. The user has not permitted Joby to look at it.
    if (error instanceof RepositoryNotSelectedError) return send(response, 403, { error: error.message });

    throw error;
  }
}

/**
 * GitHub credentials come from the request, never from the database.
 *
 * Storing an OAuth token needs a secrets decision nobody has made, so this slice does not store
 * one (plan `004`).
 */
function githubCredentials(request: IncomingMessage): GitHubCredentials {
  const login = request.headers['x-github-login'];
  const token = request.headers['x-github-token'];
  return {
    accountLogin: typeof login === 'string' ? login : '',
    ...(typeof token === 'string' && token ? { token } : {}),
  };
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const body = await readBody(request);
  if (body.byteLength === 0) return {};
  try {
    return JSON.parse(body.toString('utf8'));
  } catch (error) {
    throw new InvalidCorrectionError(`Body is not valid JSON: ${String(error)}`);
  }
}
