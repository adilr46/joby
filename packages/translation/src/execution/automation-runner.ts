import type { ApplicationSession } from './session';
import type { ApplicationSessionModule } from './session-contract';
import type { PageObservation } from './surface-observation';
import type { ExecutionStepOutcome, SurfaceLoopModule } from './surface-loop';

export interface AutomationPageObserver {
  observe(input: { readonly session: ApplicationSession }): Promise<PageObservation>;
}

export interface AutomationSubmitter {
  /**
   * Explicit final submission boundary. The browser loop may reach `submission_ready`; it may not
   * submit unless the caller supplies this port and passes `submit: true`.
   */
  submit(input: { readonly session: ApplicationSession; readonly observation: PageObservation }): Promise<AutomationSubmitResult>;
}

export interface AutomationSubmitResult {
  readonly submitted: boolean;
  readonly reason?: string;
}

export interface RunApplicationAutomationInput {
  readonly sessionId: string;
  readonly maxSteps?: number;
  readonly submit?: boolean;
  readonly knownFacts?: readonly { readonly label: string; readonly value: string }[];
}

export type ApplicationAutomationOutcome =
  | { readonly status: 'waiting_for_user'; readonly session: ApplicationSession; readonly step: ExecutionStepOutcome }
  | { readonly status: 'submission_ready'; readonly session: ApplicationSession; readonly step: ExecutionStepOutcome }
  | { readonly status: 'submitted'; readonly session: ApplicationSession; readonly submission: AutomationSubmitResult }
  | { readonly status: 'needs_repair'; readonly session: ApplicationSession; readonly step: ExecutionStepOutcome }
  | { readonly status: 'blocked'; readonly session: ApplicationSession; readonly step: ExecutionStepOutcome }
  | { readonly status: 'step_limit_reached'; readonly session: ApplicationSession };

export interface ApplicationAutomationRunner {
  run(input: RunApplicationAutomationInput): Promise<ApplicationAutomationOutcome>;
}

const DEFAULT_MAX_STEPS = 12;

export class BrowserApplicationAutomationRunner implements ApplicationAutomationRunner {
  readonly #observer: AutomationPageObserver;
  readonly #loop: SurfaceLoopModule;
  readonly #sessions: ApplicationSessionModule;
  readonly #submitter?: AutomationSubmitter;

  constructor(dependencies: {
    readonly observer: AutomationPageObserver;
    readonly loop: SurfaceLoopModule;
    readonly sessions: ApplicationSessionModule;
    readonly submitter?: AutomationSubmitter;
  }) {
    this.#observer = dependencies.observer;
    this.#loop = dependencies.loop;
    this.#sessions = dependencies.sessions;
    this.#submitter = dependencies.submitter;
  }

  async run(input: RunApplicationAutomationInput): Promise<ApplicationAutomationOutcome> {
    const maxSteps = input.maxSteps ?? DEFAULT_MAX_STEPS;
    let session = await this.#require(input.sessionId);

    for (let i = 0; i < maxSteps; i += 1) {
      const observation = await this.#observer.observe({ session });
      const step = await this.#loop.step({
        sessionId: session.id,
        observation,
        postActionObservation: async () => this.#observer.observe({ session }),
        ...(input.knownFacts ? { knownFacts: input.knownFacts } : {}),
      });
      session = step.session;

      if (step.status === 'waiting_for_user') return { status: 'waiting_for_user', session, step };
      if (step.status === 'needs_repair') return { status: 'needs_repair', session, step };
      if (step.status === 'blocked') return { status: 'blocked', session, step };
      if (step.status === 'submission_ready') {
        if (!input.submit || !this.#submitter) return { status: 'submission_ready', session, step };
        const fresh = await this.#observer.observe({ session });
        const submission = await this.#submitter.submit({ session, observation: fresh });
        if (!submission.submitted) return { status: 'submission_ready', session, step };
        session = await this.#sessions.setExecutionLevel({ sessionId: session.id, level: 'submitted' });
        return { status: 'submitted', session, submission };
      }
    }

    return { status: 'step_limit_reached', session };
  }

  async #require(sessionId: string): Promise<ApplicationSession> {
    const session = await this.#sessions.getSession(sessionId);
    if (!session) throw new Error(`No execution session '${sessionId}'.`);
    return session;
  }
}

export function createApplicationAutomationRunner(dependencies: {
  readonly observer: AutomationPageObserver;
  readonly loop: SurfaceLoopModule;
  readonly sessions: ApplicationSessionModule;
  readonly submitter?: AutomationSubmitter;
}): ApplicationAutomationRunner {
  return new BrowserApplicationAutomationRunner(dependencies);
}
