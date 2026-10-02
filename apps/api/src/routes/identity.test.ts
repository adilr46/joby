import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import type { DurableIdentityRuntime } from '@joby/identity/runtime';
import type { IdentityRepresentationRuntime } from '@joby/identity/representation/runtime';
import { handleIdentityRequest } from './identity';

async function request(path: string) {
  const incoming = Readable.from([]) as IncomingMessage;
  incoming.method = 'GET';
  const response = { writeHead: vi.fn(), end: vi.fn() };
  await handleIdentityRequest({
    request: incoming,
    response: response as unknown as ServerResponse,
    url: new URL(`http://localhost${path}`),
    identity: {} as DurableIdentityRuntime,
    representations: {} as IdentityRepresentationRuntime,
  });
  return response;
}

describe('identity import UI', () => {
  it('serves the CV intake page and its separately loaded assets', async () => {
    const page = await request('/identity/import');
    expect(page.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': expect.stringContaining("script-src 'self'"),
    }));
    expect(page.end.mock.calls[0]![0].toString()).toContain('Create your Joby');

    const script = await request('/identity/import.js');
    expect(script.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'content-type': 'text/javascript; charset=utf-8',
    }));
    expect(script.end.mock.calls[0]![0].toString()).toContain("fetch('/identity/sources'");

    const stylesheet = await request('/identity/import.css');
    expect(stylesheet.writeHead).toHaveBeenCalledWith(200, expect.anything());

    const proposal = await request('/identity/proposal');
    expect(proposal.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'content-type': 'text/html; charset=utf-8',
    }));
    expect(proposal.end.mock.calls[0]![0].toString()).toContain('Step 2 of 33');
  });
});
