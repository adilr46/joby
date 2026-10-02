import type { AutomationPageObserver, PageObservation, PortalActionExecutor } from '@joby/translation/execution';

import { DnsEgressGuard } from './egress-guard';
import {
  BROWSER_LIKE_USER_AGENT,
  observeBestFrame,
  type BrowserContextLike,
  type BrowserLike,
  type BrowserPageLike,
} from './browser-observer';
import { PlaywrightPortalActionExecutor, type ActionPageLike } from './browser-action-executor';
import { enrichObservationFromKnownAts } from './ats-enrichment';

export interface PortalBrowserPageLike extends BrowserPageLike, ActionPageLike {
  locator(selector: string): {
    first(): {
      innerText(): Promise<string>;
      getAttribute(name: string): Promise<string | null>;
      scrollIntoViewIfNeeded(): Promise<void>;
      click(options?: { timeout?: number }): Promise<void>;
      fill(text: string): Promise<void>;
      selectOption(value: string | { label: string }): Promise<unknown>;
    };
  };
  keyboard: { type(text: string): Promise<void> };
  waitForLoadState?(state: 'load' | 'domcontentloaded', options?: { timeout?: number }): Promise<void>;
  bringToFront?(): Promise<void>;
}

export interface PortalBrowserContextLike extends BrowserContextLike {
  newPage(): Promise<PortalBrowserPageLike>;
  newCDPSession?(page: PortalBrowserPageLike): Promise<{
    send(method: string, params?: unknown): Promise<unknown>;
    detach?(): Promise<void>;
  }>;
}

export interface PortalBrowserLike extends BrowserLike {
  newContext(options: {
    userAgent: string;
    locale: string;
    viewport?: { width: number; height: number };
  }): Promise<PortalBrowserContextLike>;
  isConnected?(): boolean;
}

export interface PortalBrowserLauncher {
  launch(options: { headless: boolean; args?: readonly string[]; channel?: string }): Promise<PortalBrowserLike>;
}

export interface PortalBrowserSession {
  readonly executionSessionId: string;
  readonly url: string;
  readonly page: PortalBrowserPageLike;
  readonly context: PortalBrowserContextLike;
  readonly createdAt: number;
}

export interface OpenPortalBrowserSessionResult {
  readonly session: PortalBrowserSession;
  readonly observation: PageObservation;
}

export interface PortalBrowserSessionRegistryOptions {
  readonly launcher?: PortalBrowserLauncher;
  readonly guard?: DnsEgressGuard;
  readonly headless?: boolean;
  readonly timeoutMs?: number;
  readonly hydrationWaitMs?: number;
  readonly idleCloseMs?: number;
  readonly sessionTtlMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_HYDRATION_WAIT_MS = 1_000;
const DEFAULT_IDLE_CLOSE_MS = 5 * 60_000;
const DEFAULT_SESSION_TTL_MS = 15 * 60_000;

export class PortalBrowserSessionRegistry {
  readonly #launcher?: PortalBrowserLauncher;
  readonly #guard: DnsEgressGuard;
  readonly #headless: boolean;
  readonly #timeoutMs: number;
  readonly #hydrationWaitMs: number;
  readonly #idleCloseMs: number;
  readonly #sessionTtlMs: number;
  readonly #sessions = new Map<string, PortalBrowserSession>();
  #browser?: PortalBrowserLike;
  #idleTimer?: ReturnType<typeof setTimeout>;

  constructor(options: PortalBrowserSessionRegistryOptions = {}) {
    this.#launcher = options.launcher;
    this.#guard = options.guard ?? new DnsEgressGuard();
    this.#headless = options.headless ?? true;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#hydrationWaitMs = options.hydrationWaitMs ?? DEFAULT_HYDRATION_WAIT_MS;
    this.#idleCloseMs = options.idleCloseMs ?? DEFAULT_IDLE_CLOSE_MS;
    this.#sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  }

  async open(input: { readonly executionSessionId: string; readonly url: string }): Promise<OpenPortalBrowserSessionResult> {
    this.#prune();
    this.#clearIdleClose();
    await this.close(input.executionSessionId);
    await this.#guard.validate(input.url);

    const browser = await this.#browserInstance();
    const context = await browser.newContext({
      userAgent: BROWSER_LIKE_USER_AGENT,
      locale: 'en-US',
      viewport: { width: 1280, height: 900 },
    });
    await context.route('**/*', async (route) => {
      try {
        await this.#guard.validate(route.request().url());
        await route.continue();
      } catch {
        await route.abort('blockedbyclient');
      }
    });

    const page = await context.newPage();
    try {
      await gotoResilient(page, input.url, this.#timeoutMs);
      const session = {
        executionSessionId: input.executionSessionId,
        url: input.url,
        page,
        context,
        createdAt: Date.now(),
      };
      this.#sessions.set(input.executionSessionId, session);
      return { session, observation: await this.observe(input.executionSessionId) };
    } catch (error) {
      await context.close?.().catch(() => undefined);
      if (this.#sessions.size === 0) this.#scheduleIdleClose();
      throw error;
    }
  }

  get(executionSessionId: string): PortalBrowserSession | undefined {
    this.#prune();
    return this.#sessions.get(executionSessionId);
  }

  observer(executionSessionId: string): AutomationPageObserver {
    return { observe: async () => this.observe(executionSessionId) };
  }

  executor(executionSessionId: string): PortalActionExecutor {
    return new PlaywrightPortalActionExecutor({ page: this.#require(executionSessionId).page });
  }

  async observe(executionSessionId: string): Promise<PageObservation> {
    const session = this.#require(executionSessionId);
    await session.page.waitForTimeout(this.#hydrationWaitMs);
    const finalUrl = session.page.url();
    await this.#guard.validate(finalUrl);
    const observation = await observeBestFrame(session.page);
    return enrichObservationFromKnownAts({ url: session.url, observation, guard: this.#guard });
  }

  async handoff(executionSessionId: string): Promise<{ readonly visible: boolean; readonly reason?: string }> {
    const session = this.#require(executionSessionId);
    if (this.#headless) return { visible: false, reason: 'Browser is running headless; set JOBY_PORTAL_HEADLESS=false for human handoff.' };

    try {
      const cdp = await session.context.newCDPSession?.(session.page);
      const window = await cdp?.send('Browser.getWindowForTarget') as { windowId?: number } | undefined;
      if (window?.windowId !== undefined) {
        await cdp?.send('Browser.setWindowBounds', {
          windowId: window.windowId,
          bounds: { left: 80, top: 60, width: 1280, height: 920, windowState: 'normal' },
        });
      }
      await cdp?.detach?.().catch(() => undefined);
    } catch {
      // CDP repositioning is best effort; bringToFront is still worth trying.
    }

    await session.page.bringToFront?.().catch(() => undefined);
    return { visible: true };
  }

  async close(executionSessionId: string): Promise<void> {
    const session = this.#sessions.get(executionSessionId);
    this.#sessions.delete(executionSessionId);
    await session?.context.close?.().catch(() => undefined);
    if (this.#sessions.size === 0) this.#scheduleIdleClose();
  }

  async closeAll(): Promise<void> {
    for (const id of [...this.#sessions.keys()]) await this.close(id);
    this.#clearIdleClose();
    await this.#browser?.close().catch(() => undefined);
    this.#browser = undefined;
  }

  async #browserInstance(): Promise<PortalBrowserLike> {
    if (this.#browser && (this.#browser.isConnected?.() ?? true)) return this.#browser;
    const launcher = this.#launcher ?? await loadPlaywrightChromium();
    this.#browser = await launcher.launch({
      headless: this.#headless,
      ...(this.#headless ? {} : { channel: 'chrome', args: ['--window-position=-3200,-3200', '--window-size=1280,940'] }),
    });
    return this.#browser;
  }

  #require(executionSessionId: string): PortalBrowserSession {
    const session = this.get(executionSessionId);
    if (!session) throw new Error(`No portal browser session '${executionSessionId}'.`);
    return session;
  }

  #prune(): void {
    const now = Date.now();
    for (const [id, session] of this.#sessions) {
      if (now - session.createdAt > this.#sessionTtlMs) void this.close(id);
    }
  }

  #scheduleIdleClose(): void {
    this.#clearIdleClose();
    this.#idleTimer = setTimeout(() => {
      if (this.#sessions.size > 0) return;
      const browser = this.#browser;
      this.#browser = undefined;
      void browser?.close().catch(() => undefined);
    }, this.#idleCloseMs);
  }

  #clearIdleClose(): void {
    if (this.#idleTimer) clearTimeout(this.#idleTimer);
    this.#idleTimer = undefined;
  }
}

async function gotoResilient(page: PortalBrowserPageLike, url: string, timeoutMs: number): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      await page.waitForLoadState?.('load', { timeout: 8_000 }).catch(() => undefined);
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(800 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not open the portal page.');
}

async function loadPlaywrightChromium(): Promise<PortalBrowserLauncher> {
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<{ chromium: PortalBrowserLauncher }>;
    const mod = await dynamicImport('playwright');
    return mod.chromium as PortalBrowserLauncher;
  } catch {
    throw new Error('playwright is not installed; add it before using PortalBrowserSessionRegistry');
  }
}
