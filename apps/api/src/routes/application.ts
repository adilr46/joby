import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { ApplicationNotFoundError, InvalidApplicationInputError, InterviewStageNotFoundError, INTERVIEW_STAGE_KINDS, type ApplicationModule, type InterviewStageKind, type TimelineStage } from '@joby/application';

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}
export async function handleApplicationRequest(context: {
  request: IncomingMessage; response: ServerResponse; url: URL; applications: ApplicationModule;
  resolveActor: (request: IncomingMessage) => Promise<string | undefined>;
}) {
  const { request, response, url, applications, resolveActor } = context;
  const assets: Record<string, [string, string]> = {
    '/applications/manual': ['manual.html', 'text/html; charset=utf-8'],
    '/applications/manual.js': ['manual.js', 'text/javascript; charset=utf-8'],
    '/applications/manual.css': ['manual.css', 'text/css; charset=utf-8'],
  };
  const asset = assets[url.pathname];
  if (request.method === 'GET' && asset) {
    response.writeHead(200, { 'content-type': asset[1], 'cache-control': 'no-store',
      'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'" });
    response.end(await readFile(new URL(`../../../web/public/${asset[0]}`, import.meta.url)));
    return;
  }
  const personId = await resolveActor(request);
  if (!personId) return send(response, 401, { error: 'Sign in to save an application.' });
  try {
    if (request.method !== 'POST') return send(response, 404, { error: 'not found' });
    const progress = /^\/applications\/([^/]+)\/progress$/.exec(url.pathname);
    const interview = /^\/applications\/([^/]+)\/interviews$/.exec(url.pathname);
    const reflection = /^\/applications\/([^/]+)\/interviews\/([^/]+)\/reflection$/.exec(url.pathname);
    if (url.pathname !== '/applications/manual' && !progress && !interview && !reflection) return send(response, 404, { error: 'not found' });
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > 8192) throw new InvalidApplicationInputError('Request is too large.');
      chunks.push(bytes);
    }
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      body = parsed as Record<string, unknown>;
    } catch { throw new InvalidApplicationInputError('Expected a JSON object.'); }
    const stage = body.stage as TimelineStage;
    const occurredAt = body.occurredAt as string | undefined;
    if (progress) return send(response, 200, await applications.recordOwnedProgress({ personId,
      applicationId: progress[1]!, stage, occurredAt }));
    if (interview) {
      const kind = body.kind as InterviewStageKind;
      if (!(INTERVIEW_STAGE_KINDS as readonly string[]).includes(kind)) throw new InvalidApplicationInputError('Unsupported interview kind.');
      if (!Array.isArray(body.observations) || body.observations.some((entry) => typeof entry !== 'string')) {
        throw new InvalidApplicationInputError('observations must be an array of factual strings.');
      }
      return send(response, 201, await applications.recordOwnedInterviewStage({ personId, applicationId: interview[1]!, kind,
        observations: body.observations, ...(occurredAt ? { occurredAt } : {}) }));
    }
    if (reflection) {
      if (typeof body.reflection !== 'string' || body.reflection.trim().length === 0) throw new InvalidApplicationInputError('reflection must be a non-empty string.');
      return send(response, 200, await applications.attachOwnedInterviewReflection({ personId, applicationId: reflection[1]!,
        stageId: reflection[2]!, reflection: body.reflection }));
    }
    return send(response, 201, await applications.recordExternalApplication({ personId, company: body.company as string,
      role: body.role as string, stage, occurredAt, requestId: body.requestId as string }));
  } catch (error) {
    if (error instanceof InvalidApplicationInputError) return send(response, 400, { error: error.message });
    if (error instanceof ApplicationNotFoundError) return send(response, 404, { error: 'Application not found.' });
    if (error instanceof InterviewStageNotFoundError) return send(response, 404, { error: 'Interview stage not found.' });
    throw error;
  }
}
