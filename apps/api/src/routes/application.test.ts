import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import type { ApplicationModule } from '@joby/application';
import { handleApplicationRequest } from './application';

async function call(path: string, body: string, actor?: string, method = 'POST') {
  const request = Readable.from([body]) as IncomingMessage;
  request.method = method;
  const response = { writeHead: vi.fn(), end: vi.fn() };
  const applications = {
    recordExternalApplication: vi.fn(async () => ({})),
    recordOwnedProgress: vi.fn(async () => ({})),
    recordOwnedInterviewStage: vi.fn(async () => ({})),
    attachOwnedInterviewReflection: vi.fn(async () => ({})),
  };
  await handleApplicationRequest({ request, response: response as unknown as ServerResponse,
    url: new URL(`http://localhost${path}`), applications: applications as unknown as ApplicationModule, resolveActor: async () => actor });
  return { response, applications };
}
describe('manual Application HTTP surface', () => {
  it('requires authentication before accepting progress', async () => {
    const result = await call('/applications/manual', '{}');
    expect(result.response.writeHead).toHaveBeenCalledWith(401, expect.anything());
    expect(result.applications.recordExternalApplication).not.toHaveBeenCalled();
  });
  it('uses the trusted actor and passes labels and stage to Application', async () => {
    const result = await call('/applications/manual', JSON.stringify({ personId: 'victim', company: 'Acme', role: 'Engineer', stage: 'offer', requestId: 'r' }), 'alice');
    expect(result.applications.recordExternalApplication).toHaveBeenCalledWith({ personId: 'alice', company: 'Acme', role: 'Engineer', stage: 'offer', requestId: 'r', occurredAt: undefined });
  });
  it('routes subsequent progress through owner authorization in Application', async () => {
    const result = await call('/applications/app/progress', '{"stage":"interviewing"}', 'alice');
    expect(result.applications.recordOwnedProgress).toHaveBeenCalledWith({ personId: 'alice', applicationId: 'app', stage: 'interviewing', occurredAt: undefined });
  });
  it('records factual interview observations through the authenticated Application capability', async () => {
    const result = await call('/applications/app/interviews', '{"kind":"video","observations":["Asked about system design."],"occurredAt":"2026-09-30"}', 'alice');
    expect(result.applications.recordOwnedInterviewStage).toHaveBeenCalledWith({
      personId: 'alice', applicationId: 'app', kind: 'video', observations: ['Asked about system design.'], occurredAt: '2026-09-30',
    });
  });
  it('attaches reflection separately from an interview observation', async () => {
    const result = await call('/applications/app/interviews/stage/reflection', '{"reflection":"I should make the trade-off clearer."}', 'alice');
    expect(result.applications.attachOwnedInterviewReflection).toHaveBeenCalledWith({
      personId: 'alice', applicationId: 'app', stageId: 'stage', reflection: 'I should make the trade-off clearer.',
    });
  });
  it('rejects malformed and oversized payloads', async () => {
    for (const body of ['null', '[]', '{', 'x'.repeat(9000)]) {
      expect((await call('/applications/manual', body, 'alice')).response.writeHead).toHaveBeenCalledWith(400, expect.anything());
    }
  });
  it('serves an accessible form and its external script without embedding private data', async () => {
    const page = await call('/applications/manual', '', undefined, 'GET');
    expect(page.response.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'content-type': 'text/html; charset=utf-8' }));
    expect(page.response.end.mock.calls[0]![0].toString()).toContain('name="company"');
    const script = await call('/applications/manual.js', '', undefined, 'GET');
    expect(script.response.writeHead).toHaveBeenCalledWith(200, expect.anything());
  });
});
