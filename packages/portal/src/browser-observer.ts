// The DOM reader below is evaluated inside Playwright's browser context. This repository's Node
// TypeScript config intentionally does not include DOM libs, so that small function is kept
// type-loose while the public adapter contract remains typed.
// @ts-nocheck

import type { PageObservation, PageObservationElement } from '@joby/translation/execution';
import { DnsEgressGuard } from './egress-guard';

export const BROWSER_LIKE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export interface BrowserFrameLike {
  url(): string;
  evaluate<T>(fn: () => T): Promise<T>;
}

export interface BrowserPageLike extends BrowserFrameLike {
  goto(url: string, options: { waitUntil: 'domcontentloaded'; timeout: number }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  frames?(): BrowserFrameLike[];
}

export interface BrowserContextLike {
  route(pattern: string, handler: (route: BrowserRouteLike) => Promise<void> | void): Promise<void>;
  newPage(): Promise<BrowserPageLike>;
  close?(): Promise<void>;
}

export interface BrowserRouteLike {
  request(): { url(): string };
  abort(reason?: string): Promise<void> | void;
  continue(): Promise<void> | void;
}

export interface BrowserLike {
  newContext(options: { userAgent: string; locale: string }): Promise<BrowserContextLike>;
  close(): Promise<void>;
}

export interface BrowserLauncher {
  launch(options: { headless: boolean }): Promise<BrowserLike>;
}

export interface PortalPageObserver {
  observe(input: { readonly url: string }): Promise<PageObservation>;
}

export interface PlaywrightPortalObserverOptions {
  readonly launcher?: BrowserLauncher;
  readonly headless?: boolean;
  readonly timeoutMs?: number;
  readonly hydrationWaitMs?: number;
  readonly guard?: DnsEgressGuard;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_HYDRATION_WAIT_MS = 2_000;

export class PlaywrightPortalObserver implements PortalPageObserver {
  readonly #launcher?: BrowserLauncher;
  readonly #headless: boolean;
  readonly #timeoutMs: number;
  readonly #hydrationWaitMs: number;
  readonly #guard: DnsEgressGuard;

  constructor(options: PlaywrightPortalObserverOptions = {}) {
    this.#launcher = options.launcher;
    this.#headless = options.headless ?? true;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#hydrationWaitMs = options.hydrationWaitMs ?? DEFAULT_HYDRATION_WAIT_MS;
    this.#guard = options.guard ?? new DnsEgressGuard();
  }

  async observe(input: { readonly url: string }): Promise<PageObservation> {
    await this.#guard.validate(input.url);
    const launcher = this.#launcher ?? await loadPlaywrightChromium();
    const browser = await launcher.launch({ headless: this.#headless });
    let context: BrowserContextLike | undefined;
    try {
      context = await browser.newContext({ userAgent: BROWSER_LIKE_USER_AGENT, locale: 'en-US' });
      await context.route('**/*', async (route) => {
        const url = route.request().url();
        try {
          await this.#guard.validate(url);
          await route.continue();
        } catch {
          await route.abort('blockedbyclient');
        }
      });
      const page = await context.newPage();
      await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: this.#timeoutMs });
      await page.waitForTimeout(this.#hydrationWaitMs);
      await this.#guard.validate(page.url());
      return observeBestFrame(page);
    } finally {
      await context?.close?.().catch(() => undefined);
      await browser.close().catch(() => undefined);
    }
  }
}

/**
 * Observer for a page that is already open and being acted on by the same composition root.
 * This is the runtime partner for `PlaywrightPortalActionExecutor`: actions mutate the current page,
 * then this observer reads that same page for verification and the next loop step.
 */
export class PlaywrightCurrentPageObserver {
  readonly #page: Pick<BrowserPageLike, 'url' | 'waitForTimeout' | 'evaluate'>;
  readonly #hydrationWaitMs: number;
  readonly #guard: DnsEgressGuard;

  constructor(options: {
    readonly page: Pick<BrowserPageLike, 'url' | 'waitForTimeout' | 'evaluate'>;
    readonly hydrationWaitMs?: number;
    readonly guard?: DnsEgressGuard;
  }) {
    this.#page = options.page;
    this.#hydrationWaitMs = options.hydrationWaitMs ?? DEFAULT_HYDRATION_WAIT_MS;
    this.#guard = options.guard ?? new DnsEgressGuard();
  }

  async observe(_input?: { readonly session?: unknown }): Promise<PageObservation> {
    await this.#page.waitForTimeout(this.#hydrationWaitMs);
    const finalUrl = this.#page.url();
    await this.#guard.validate(finalUrl);
    return observeBestFrame(this.#page);
  }
}

async function loadPlaywrightChromium(): Promise<BrowserLauncher> {
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<{ chromium: BrowserLauncher }>;
    const mod = await dynamicImport('playwright');
    return mod.chromium as BrowserLauncher;
  } catch {
    throw new Error('playwright is not installed; add it before using PlaywrightPortalObserver');
  }
}

interface DomObservation {
  readonly title: string;
  readonly elements: readonly PageObservationElement[];
}

export function normalizeDomObservation(raw: DomObservation, finalUrl: string): PageObservation {
  return {
    url: finalUrl,
    ...(raw.title ? { title: raw.title } : {}),
    elements: raw.elements,
  };
}

export async function observeBestFrame(page: Pick<BrowserPageLike, 'url' | 'evaluate' | 'frames'>): Promise<PageObservation> {
  const frames = typeof page.frames === 'function' ? page.frames() : [page];
  let best: PageObservation | undefined;
  let bestScore = -1;

  for (const frame of frames) {
    try {
      const observation = normalizeDomObservation(await frame.evaluate(readDomForObservation), frame.url());
      const score = observation.elements.filter((element) => !['static_text', 'link', 'button'].includes(element.kind)).length;
      if (score > bestScore) {
        best = observation;
        bestScore = score;
      }
    } catch {
      // Detached/cross-origin frames can disappear while a page settles; skip and keep searching.
    }
  }

  return best ?? normalizeDomObservation(await page.evaluate(readDomForObservation), page.url());
}

export function readDomForObservation(): DomObservation {
  const visible = (element: Element): boolean => {
    const html = element as HTMLElement;
    const style = window.getComputedStyle(html);
    return style.display !== 'none' && style.visibility !== 'hidden' && html.getClientRects().length > 0;
  };
  const clean = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const pure = (node: Element | null): string => {
    if (!node) return '';
    const clone = node.cloneNode(true) as Element;
    clone.querySelectorAll?.('input, select, textarea, option, button, [role=option], [class*="menu" i]').forEach((child) => child.remove());
    return clean(clone.textContent);
  };
  const fieldGroup = (element: Element): Element | null =>
    element.closest('[class*="field-entry" i], [class*="fieldEntry" i], [class*="form-group" i], [class*="question" i], [class*="field__" i], [class*="__field" i], fieldset, [class*="field" i]');
  const goodLabel = (value: string | null | undefined): string => {
    const trimmed = clean(value);
    if (!trimmed || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) return '';
    if (/^(start typing|select\b|choose|search\b|type\b|--|please select|e\.?g\.?)/i.test(trimmed)) return '';
    return trimmed;
  };
  const labelFor = (element: Element): string => {
    const html = element as HTMLElement;
    const aria = html.getAttribute('aria-label');
    if (goodLabel(aria)) return goodLabel(aria);
    const labelledBy = html.getAttribute('aria-labelledby');
    if (labelledBy) {
      const text = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ');
      if (goodLabel(text)) return goodLabel(text);
    }
    const id = html.getAttribute('id');
    const explicit = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
    if (goodLabel(pure(explicit))) return goodLabel(pure(explicit));
    if (goodLabel(pure(html.closest('label')))) return goodLabel(pure(html.closest('label')));
    const grouped = fieldGroup(element)?.querySelector('label, legend, [class*="question-title" i], [class*="heading" i], [class*="label" i], [class*="title" i]');
    if (goodLabel(pure(grouped ?? null))) return goodLabel(pure(grouped ?? null));
    let cursor: Element | null = element.parentElement;
    for (let i = 0; i < 4 && cursor; i += 1, cursor = cursor.parentElement) {
      const nearby = cursor.querySelector('label, legend, [class*="label" i], [class*="title" i], h3, h4, h5');
      if (goodLabel(pure(nearby))) return goodLabel(pure(nearby));
    }
    return goodLabel(html.getAttribute('placeholder')) || goodLabel(html.getAttribute('title')) || goodLabel((html as HTMLInputElement).name);
  };
  const cssString = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const selectorFor = (element: Element, index: number): string => {
    const html = element as HTMLElement;
    const id = html.getAttribute('id');
    if (id) return `#${CSS.escape(id)}`;
    const name = html.getAttribute('name');
    if (name) return `[name="${cssString(name)}"]`;
    const testId = html.getAttribute('data-testid');
    if (testId) return `[data-testid="${cssString(testId)}"]`;

    const tag = element.tagName.toLowerCase();
    return `:nth-match(${tag}, ${index + 1})`;
  };
  const kindFor = (element: Element): PageObservationElement['kind'] => {
    const tag = element.tagName.toLowerCase();
    const inputType = (element.getAttribute('type') || 'text').toLowerCase();
    if (tag === 'textarea') return 'textarea';
    if (tag === 'select') return 'select';
    if (tag === 'button') return 'button';
    if (tag === 'a') return 'link';
    if (element.getAttribute('role') === 'combobox') return 'select';
    if ((element as HTMLElement).isContentEditable) return 'textarea';
    if (inputType === 'checkbox') return 'checkbox';
    if (inputType === 'radio') return 'radio';
    if (inputType === 'file') return 'file_upload';
    if (inputType === 'submit' || inputType === 'button') return 'button';
    return 'text_input';
  };

  const controls = Array.from(document.querySelectorAll('input, textarea, select, button, a[href], [role="button"], [role="combobox"], [contenteditable="true"]'))
    .filter((element) => !element.closest('nav, header, footer, [aria-hidden="true"]'))
    .filter(visible)
    .map((element, index): PageObservationElement => {
      const html = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      const options = element.tagName.toLowerCase() === 'select'
        ? Array.from((html as HTMLSelectElement).options).map((option) => option.textContent?.trim() || option.value).filter(Boolean)
        : undefined;
      return {
        id: selectorFor(element, index),
        kind: kindFor(element),
        label: labelFor(element),
        name: html.getAttribute('name') || undefined,
        value: 'value' in html ? String(html.value ?? '') : undefined,
        options,
        required: html.hasAttribute('required') || html.getAttribute('aria-required') === 'true',
        text: element.tagName.toLowerCase() === 'a' || element.tagName.toLowerCase() === 'button'
          ? (element.textContent || '').replace(/\s+/g, ' ').trim()
          : undefined,
      };
    });

  const root = document.querySelector('main, [role="main"], article') || document.body;
  const staticText = (root?.textContent || '').replace(/\s+/g, ' ').trim();
  const elements = [...controls];
  if (staticText) {
    elements.push({ id: 'page-static-text', kind: 'static_text', text: staticText.slice(0, 2_000) });
  }
  return {
    title: (document.querySelector('h1')?.textContent || document.title || '').replace(/\s+/g, ' ').trim(),
    elements,
  };
}
