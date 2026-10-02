/**
 * Execution HTTP routes — application-session automation over live portal pages.
 *
 * | Method | Path | Purpose |
 * |---|---|---|
 * | POST | `/execution/sessions` | Create/resume an Execution session and open a guarded browser page |
 * | GET | `/execution/sessions/:id` | Read the durable Execution session |
 * | POST | `/execution/sessions/:id/prefill` | Inspect and resolve fields without acting on the portal |
 * | POST | `/execution/sessions/:id/run` | Run deterministic observe/resolve/fill/verify loop |
 * | POST | `/execution/sessions/:id/fill` | Alias of `run` with `submit: false` |
 * | POST | `/execution/sessions/:id/drive` | Stream submit-safe agentic drive steps |
 * | POST | `/execution/sessions/:id/handoff` | Bring the real browser forward for human review |
 * | POST | `/execution/sessions/:id/close` | Release the browser runtime for this session |
 *
 * These routes expose operational state. They do not record submitted reality in Application; that
 * boundary is still only crossed by an explicit submitter/recorder.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  drivePortalSession,
  looksLikeApplicationObservation,
  type DriveGoal,
  type DrivePlanner,
  type PortalBrowserSessionRegistry,
} from '@joby/portal';
import {
  SessionNotFoundError,
  createApplicationAutomationRunner,
  createSurfaceExecutionModule,
  createSurfaceLoopModule,
  type ApplicationSessionModule,
  type SurfaceInspectionModule,
  type SurfaceResolutionModule,
} from '@joby/translation/execution';

interface RouteContext {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly url: URL;
  readonly sessions: ApplicationSessionModule;
  readonly inspection: SurfaceInspectionModule;
  readonly resolution: SurfaceResolutionModule;
  readonly portal: PortalBrowserSessionRegistry;
  readonly drivePlanner?: DrivePlanner;
  readonly knownFactsFor: (personId: string) => Promise<readonly { readonly label: string; readonly value: string }[]>;
  readonly opportunityContextFor: (opportunityId: string) => Promise<{
    readonly revision?: number;
    readonly role?: string;
    readonly company?: string;
  } | undefined>;
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
    throw new Error(`Body is not valid JSON: ${String(error)}`);
  }
}

export async function handleExecutionRequest(context: RouteContext): Promise<void> {
  const { request, response, url, sessions, inspection, resolution, portal, drivePlanner, knownFactsFor, opportunityContextFor } = context;
  const [, resource, id, action] = url.pathname.split('/').filter(Boolean);

  try {
    if (request.method === 'POST' && resource === 'sessions' && !id) {
      const body = await readJson(request);
      const personId = String(body.personId ?? '');
      const opportunityId = String(body.opportunityId ?? '');
      const applicationUrl = String(body.applicationUrl ?? body.url ?? '');
      if (!personId || !opportunityId || !applicationUrl) {
        return send(response, 400, { error: "'personId', 'opportunityId' and 'applicationUrl' are required." });
      }

      const opportunity = await opportunityContextFor(opportunityId);
      const session = await sessions.createOrResumeSession({
        personId,
        opportunityId,
        opportunityRevision: Number(body.opportunityRevision ?? opportunity?.revision ?? 1),
        ...(opportunity?.role ? { role: opportunity.role } : {}),
        ...(opportunity?.company ? { company: opportunity.company } : {}),
        ...(body.applicationId ? { applicationId: String(body.applicationId) } : {}),
      });
      const opened = await portal.open({ executionSessionId: session.id, url: applicationUrl });
      const updated = await sessions.updatePortalContext({
        sessionId: session.id,
        portalKind: 'browser',
        currentStepId: opened.observation.url,
      });

      return send(response, 201, {
        session: updated,
        observation: opened.observation,
        fields: opened.observation.elements,
        needsDrive: !looksLikeApplicationObservation(opened.observation),
      });
    }

    if (request.method === 'GET' && resource === 'sessions' && id && !action) {
      const session = await sessions.getSession(id);
      return session ? send(response, 200, session) : send(response, 404, { error: 'execution session not found' });
    }

    if (request.method === 'POST' && resource === 'sessions' && id && action === 'prefill') {
      const session = await requireSession(sessions, id);
      const observation = await portal.observe(id);
      const knownFacts = await knownFactsFor(session.personId);
      const inspected = await inspection.inspectSurface({ sessionId: id, observation, knownFacts });
      const resolved = await resolution.resolveRequirements({ sessionId: id });
      return send(response, 200, {
        status: resolved.needsUser.length > 0 ? 'needs_input' : 'ready',
        session: resolved.session,
        surface: inspected.surface,
        resolved: resolved.resolved,
        pendingQuestions: resolved.needsUser,
      });
    }

    if (request.method === 'POST' && resource === 'sessions' && id && (action === 'run' || action === 'fill')) {
      const session = await requireSession(sessions, id);
      if (!portal.get(id)) {
        return send(response, 409, { error: 'portal browser session is not open; call POST /execution/sessions first.' });
      }
      const body = await readJson(request);
      const execution = createSurfaceExecutionModule({ executor: portal.executor(id), sessions });
      const loop = createSurfaceLoopModule({ inspection, resolution, execution, sessions });
      const runner = createApplicationAutomationRunner({
        observer: portal.observer(id),
        loop,
        sessions,
      });
      const result = await runner.run({
        sessionId: id,
        maxSteps: Number(body.maxSteps ?? 12),
        submit: false,
        knownFacts: await knownFactsFor(session.personId),
      });
      return send(response, 200, result);
    }

    if (request.method === 'POST' && resource === 'sessions' && id && action === 'drive') {
      if (!drivePlanner) {
        return send(response, 501, { error: 'agentic drive needs ANTHROPIC_API_KEY to be configured.' });
      }
      const portalSession = portal.get(id);
      if (!portalSession) {
        return send(response, 409, { error: 'portal browser session is not open; call POST /execution/sessions first.' });
      }
      const body = await readJson(request);
      response.writeHead(200, {
        'content-type': 'application/x-ndjson',
        'cache-control': 'no-store',
      });
      const emit = (event: unknown) => response.write(`${JSON.stringify(event)}\n`);

      try {
        const goal = body.goal === 'full' ? 'full' : 'reach';
        const result = await drivePortalSession({
          page: portalSession.page,
          planner: drivePlanner,
          goal,
          budget: Number(body.budget ?? body.maxSteps ?? (goal === 'full' ? 16 : 7)),
          answers: Array.isArray(body.answers)
            ? body.answers.map((answer) => ({
                label: String((answer as { label?: unknown }).label ?? ''),
                value: String((answer as { value?: unknown }).value ?? ''),
              }))
            : [],
          isFormReady: async () => looksLikeApplicationObservation(await portal.observe(id)),
          emit: (step) => emit({ t: 'step', ...step }),
        });

        if (!result.reached) {
          emit({ t: 'error', message: result.reason, turns: result.turns });
        } else {
          const observation = await portal.observe(id);
          emit({
            t: 'done',
            reached: true,
            reason: result.reason,
            turns: result.turns,
            observation,
            fields: observation.elements,
          });
        }
      } catch (error) {
        emit({ t: 'error', message: error instanceof Error ? error.message : 'drive failed' });
      } finally {
        response.end();
      }
      return;
    }

    if (request.method === 'POST' && resource === 'sessions' && id && action === 'handoff') {
      await requireSession(sessions, id);
      return send(response, 200, await portal.handoff(id));
    }

    if (request.method === 'POST' && resource === 'sessions' && id && action === 'close') {
      await portal.close(id);
      return send(response, 200, { closed: true });
    }

    return send(response, 404, { error: 'not found' });
  } catch (error) {
    if (error instanceof SessionNotFoundError) return send(response, 404, { error: error.message });
    if (error instanceof Error && error.message.startsWith('No portal browser session')) {
      return send(response, 409, { error: error.message });
    }
    if (error instanceof Error && error.message.startsWith('Body is not valid JSON')) {
      return send(response, 422, { error: error.message });
    }
    throw error;
  }
}

async function requireSession(sessions: ApplicationSessionModule, sessionId: string) {
  const session = await sessions.getSession(sessionId);
  if (!session) throw new SessionNotFoundError(sessionId);
  return session;
}
