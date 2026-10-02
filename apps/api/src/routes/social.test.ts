import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import type { SocialModule } from '@joby/social';
import { handleSocialRequest } from './social';
import { createSocialActorResolver } from '../social-auth';

describe('Social HTTP identity boundary', () => {
  async function request(body: string, actor?: string) {
    const req = Readable.from([body]) as IncomingMessage;
    req.method = 'POST';
    const response = { writeHead: vi.fn(), end: vi.fn() };
    const share = vi.fn();
    await handleSocialRequest({ request: req, response: response as unknown as ServerResponse,
      url: new URL('http://localhost/social/shares'), social: { share } as unknown as SocialModule,
      resolveActor: async () => actor });
    return { response, share };
  }
  it('fails closed before domain access', async () => {
    const { response, share } = await request('{}');
    expect(response.writeHead).toHaveBeenCalledWith(401, expect.anything());
    expect(share).not.toHaveBeenCalled();
  });
  it('uses trusted actor, never the claimed body owner', async () => {
    const { share } = await request(JSON.stringify({ personId: 'victim', applicationId: 'a', signalId: 's', cohortId: 'c' }), 'actor');
    expect(share).toHaveBeenCalledWith('actor', 'a', 's', 'c');
  });
  it('rejects malformed and oversized bodies', async () => {
    for (const body of ['null', '[]', '{', 'x'.repeat(17000)]) {
      expect((await request(body, 'actor')).response.writeHead).toHaveBeenCalledWith(400, expect.anything());
    }
  });
  it('requires a provisioned bearer credential', async () => {
    const token = 'a'.repeat(40);
    const resolve = createSocialActorResolver(JSON.stringify({ [token]: 'alice' }));
    expect(await resolve({ headers: { authorization: `Bearer ${token}` } } as IncomingMessage)).toBe('alice');
    expect(await resolve({ headers: { authorization: 'Bearer wrong' } } as IncomingMessage)).toBeUndefined();
    expect(await createSocialActorResolver('{}')({ headers: {} } as IncomingMessage)).toBeUndefined();
  });
  it('routes Link and profile counts through the authenticated actor', async () => {
    const link = vi.fn(async () => ({ linked: true }));
    const profile = vi.fn(async () => ({ personId: 'alice', linkCount: 12 }));
    const social = { link, profile } as unknown as SocialModule;
    for (const [method, path, body] of [
      ['POST', '/social/links', JSON.stringify({ signalId: 'signal', cohortId: 'cohort', personId: 'forged' })],
      ['GET', '/social/profile?personId=alice', ''],
    ]) {
      const req = Readable.from([body]) as IncomingMessage;
      req.method = method;
      const response = { writeHead: vi.fn(), end: vi.fn() };
      await handleSocialRequest({ request: req, response: response as unknown as ServerResponse,
        url: new URL(`http://localhost${path}`), social, resolveActor: async () => 'bob' });
      expect(response.writeHead).toHaveBeenCalledWith(200, expect.anything());
    }
    expect(link).toHaveBeenCalledWith('bob', 'cohort', 'signal');
    expect(profile).toHaveBeenCalledWith('bob', 'alice');
  });
  it('selects an adaptive feed by default and retires interaction routes', async () => {
    const selectFeed = vi.fn(async () => ({ signals: [] }));
    const social = { selectFeed } as unknown as SocialModule;
    for (const [path, status] of [['/social/feed', 200], ['/social/interactions', 404]] as const) {
      const req = Readable.from([]) as IncomingMessage;
      req.method = 'GET';
      const response = { writeHead: vi.fn(), end: vi.fn() };
      await handleSocialRequest({ request: req, response: response as unknown as ServerResponse,
        url: new URL(`http://localhost${path}`), social, resolveActor: async () => 'bob' });
      expect(response.writeHead).toHaveBeenCalledWith(status, expect.anything());
    }
    expect(selectFeed).toHaveBeenCalledWith('bob', { company: undefined, milestone: undefined });
  });
});
