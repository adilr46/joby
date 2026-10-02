import type { IncomingMessage, ServerResponse } from 'node:http';
import { SocialInputError, SocialNotFoundError, type Cohort, type SocialModule } from '@joby/social';

export interface SocialRouteContext {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  social: SocialModule;
  /** Trusted server authentication adapter. Never resolve identity from request body/query. */
  resolveActor: (request: IncomingMessage) => Promise<string | undefined>;
}
function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}
async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 16_384) throw new SocialInputError('Request body too large.');
    chunks.push(bytes);
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new SocialInputError('Expected a JSON object.'); }
}
function string(body: Record<string, unknown>, key: string): string {
  if (typeof body[key] !== 'string' || !body[key].trim()) throw new SocialInputError(`${key} is required.`);
  return body[key] as string;
}
export async function handleSocialRequest({ request, response, url, social, resolveActor }: SocialRouteContext): Promise<void> {
  const personId = await resolveActor(request);
  if (!personId) return send(response, 401, { error: 'Authentication required.' });
  try {
    const path = url.pathname;
    if (path === '/social/cohorts' && request.method === 'GET') return send(response, 200, await social.memberships(personId));
    if (path === '/social/audiences' && request.method === 'GET') return send(response, 200, await social.audiences(personId));
    if (path === '/social/profile' && request.method === 'GET') return send(response, 200, await social.profile(personId, url.searchParams.get('personId') ?? personId));
    if (path === '/social/cohorts' && request.method === 'POST') {
      const body = await readJson(request);
      return send(response, 201, await social.join(personId, body as unknown as Cohort));
    }
    if (path === '/social/cohorts' && request.method === 'DELETE') {
      await social.leave(personId, string(await readJson(request), 'cohortId'));
      return send(response, 200, { removed: true });
    }
    if (path === '/social/signals' && request.method === 'GET') return send(response, 200, await social.ownSignals(personId));
    if (path === '/social/shares' && request.method === 'POST') {
      const body = await readJson(request);
      await social.share(personId, string(body, 'applicationId'), string(body, 'signalId'), string(body, 'cohortId'));
      return send(response, 201, { shared: true });
    }
    if (path === '/social/shares' && request.method === 'DELETE') {
      await social.hide(personId, string(await readJson(request), 'signalId'));
      return send(response, 200, { removed: true });
    }
    if (path === '/social/feed' && request.method === 'GET') {
      const cohortId = url.searchParams.get('cohortId');
      const filter = {
        company: url.searchParams.get('company') ?? undefined,
        milestone: url.searchParams.get('milestone') ?? undefined,
      };
      return send(response, 200, cohortId ? await social.feed(personId, cohortId, filter) : await social.selectFeed(personId, filter));
    }
    if (path === '/social/links' && request.method === 'POST') {
      const body = await readJson(request);
      return send(response, 200, await social.link(personId, string(body, 'cohortId'), string(body, 'signalId')));
    }
    if (path === '/social/links' && request.method === 'DELETE') {
      await social.unlink(personId, string(await readJson(request), 'signalId'));
      return send(response, 200, { linked: false });
    }
    return send(response, 404, { error: 'not found' });
  } catch (error) {
    if (error instanceof SocialInputError) return send(response, 400, { error: error.message });
    if (error instanceof SocialNotFoundError) return send(response, 404, { error: error.message });
    throw error;
  }
}
