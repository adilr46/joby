// The small DOM snapshot runs inside Playwright's browser context, while the rest stays typed.
// @ts-nocheck

import type { PageObservation } from '@joby/translation/execution';
import type { PortalBrowserPageLike } from './browser-session-registry';

export type DriveGoal = 'reach' | 'full';

export interface DriveAction {
  readonly action: 'click' | 'type' | 'select' | 'scroll' | 'reached_form' | 'done' | 'stuck';
  readonly ref?: string;
  readonly text?: string;
  readonly value?: string;
  readonly reason?: string;
}

export interface DriveStep {
  readonly turn: number;
  readonly action: string;
  readonly detail: string;
  readonly note?: string;
}

export interface DriveResult {
  readonly reached: boolean;
  readonly turns: number;
  readonly reason: string;
  readonly steps: readonly DriveStep[];
}

export interface DrivePlanner {
  plan(input: {
    readonly prompt: string;
    readonly previousPlannerSessionId?: string;
  }): Promise<{ readonly text: string; readonly plannerSessionId?: string }>;
}

export interface DrivePageLike extends PortalBrowserPageLike {
  locator(selector: string): {
    first(): DriveLocatorLike;
  };
  keyboard: { type(text: string): Promise<void> };
  screenshot?(options: { type: 'jpeg'; quality: number }): Promise<Buffer>;
  evaluate<T>(fn: () => T): Promise<T>;
}

export interface DriveLocatorLike {
  innerText(): Promise<string>;
  getAttribute(name: string): Promise<string | null>;
  scrollIntoViewIfNeeded(): Promise<void>;
  click(options?: { timeout?: number }): Promise<void>;
  fill(text: string): Promise<void>;
  selectOption(value: string | { label: string }): Promise<unknown>;
}

const SUBMIT_RX = /\b(submit|send application|finish( application)?|complete application|apply (and|&) submit|enviar|finalizar)\b/i;

export class AnthropicDrivePlanner implements DrivePlanner {
  readonly #apiKey: string;
  readonly #model: string;
  readonly #fetchImpl: typeof fetch;

  constructor(options: { readonly apiKey: string; readonly model?: string; readonly fetchImpl?: typeof fetch }) {
    this.#apiKey = options.apiKey;
    this.#model = options.model ?? 'claude-opus-5';
    this.#fetchImpl = options.fetchImpl ?? fetch;
  }

  async plan(input: { readonly prompt: string; readonly previousPlannerSessionId?: string }) {
    const response = await this.#fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.#apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.#model,
        max_tokens: 600,
        system: 'Return exactly one JSON object describing one browser action. No prose.',
        messages: [{ role: 'user', content: input.prompt }],
      }),
    });
    if (!response.ok) throw new Error(`Drive planner returned ${response.status}`);
    const body = await response.json() as { content?: Array<{ type: string; text?: string }> };
    return { text: body.content?.find((part) => part.type === 'text')?.text ?? '' };
  }
}

export async function drivePortalSession(input: {
  readonly page: DrivePageLike;
  readonly planner: DrivePlanner;
  readonly goal: DriveGoal;
  readonly isFormReady: () => Promise<boolean>;
  readonly emit?: (step: DriveStep) => void;
  readonly budget?: number;
  readonly answers?: readonly { readonly label: string; readonly value: string }[];
}): Promise<DriveResult> {
  const steps: DriveStep[] = [];
  let plannerSessionId: string | undefined;
  const budget = input.budget ?? (input.goal === 'full' ? 16 : 7);

  for (let turn = 1; turn <= budget; turn += 1) {
    if (input.goal === 'reach' && await input.isFormReady().catch(() => false)) {
      return { reached: true, turns: turn - 1, reason: 'form-reached', steps };
    }

    const snap = await input.page.evaluate(snapshotDom).catch(() => ({ text: '', n: 0 }));
    const prompt = await buildPrompt({
      page: input.page,
      goal: input.goal,
      turn,
      snapshotText: snap.text,
      answers: input.answers ?? [],
    });
    const planned = await input.planner.plan({ prompt, previousPlannerSessionId: plannerSessionId });
    plannerSessionId = planned.plannerSessionId;
    const action = parseAction(planned.text);

    if (!action) {
      const step = { turn, action: 'parse-error', detail: planned.text.slice(0, 120) };
      steps.push(step);
      input.emit?.(step);
      continue;
    }

    if (action.action === 'reached_form') return { reached: true, turns: turn, reason: 'agent-reached', steps };
    if (action.action === 'done') return { reached: true, turns: turn, reason: 'agent-done', steps };
    if (action.action === 'stuck') {
      const step = { turn, action: 'stuck', detail: action.reason ?? 'stuck' };
      steps.push(step);
      input.emit?.(step);
      return { reached: false, turns: turn, reason: action.reason ?? 'stuck', steps };
    }

    const executed = await executeAction(action, input.page);
    const step = { turn, action: action.action, ...executed };
    steps.push(step);
    input.emit?.(step);
  }

  return {
    reached: await input.isFormReady().catch(() => false),
    turns: budget,
    reason: 'budget-exhausted',
    steps,
  };
}

async function buildPrompt(input: {
  readonly page: DrivePageLike;
  readonly goal: DriveGoal;
  readonly turn: number;
  readonly snapshotText: string;
  readonly answers: readonly { readonly label: string; readonly value: string }[];
}): Promise<string> {
  const title = await titleFor(input.page);
  const answers = input.answers
    .filter((answer) => answer.value.trim())
    .map((answer) => `- "${answer.label}": ${answer.value.replace(/\s+/g, ' ').slice(0, 300)}`)
    .join('\n');
  const goalText = input.goal === 'reach'
    ? 'Your goal: navigate to the actual fillable job application form. Do not fill anything yet. Reply {"action":"reached_form"} once the application form is visible.'
    : `Your goal: fill this job application with the candidate answers below. Skip file uploads. NEVER submit; reply {"action":"done"} when everything is filled.\nANSWERS:\n${answers || '(no answers provided)'}`;

  if (input.turn > 1) {
    return `New page state after your last action.
Page: "${title}" (${input.page.url()})
Elements:
${input.snapshotText}

Reply with exactly one action JSON object.`;
  }

  return `You are an agent driving a real browser for a job seeker. We execute your actions; the human submits at the end.
${goalText}

You NEVER submit a form. There is no submit action.
Reply with exactly one action as JSON, nothing else:
{"action":"click","ref":"e3"}
{"action":"type","ref":"e4","text":"..."}
{"action":"select","ref":"e9","value":"..."}
{"action":"scroll"}
{"action":"reached_form"}
{"action":"done"}
{"action":"stuck","reason":"login/captcha/dead-end"}

Page: "${title}" (${input.page.url()})
Elements:
${input.snapshotText}`;
}

function parseAction(text: string): DriveAction | undefined {
  const match = text.match(/\{[\s\S]*?\}/);
  if (!match) return undefined;
  try {
    const parsed = JSON.parse(match[0]) as DriveAction;
    return typeof parsed.action === 'string' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function executeAction(action: DriveAction, page: DrivePageLike): Promise<{ detail: string; note?: string }> {
  try {
    const loc = action.ref ? page.locator(`[data-co-ref="${cssAttr(action.ref)}"]`).first() : undefined;
    if (action.action === 'click' && loc) {
      const text = await loc.innerText().catch(() => '') || await loc.getAttribute('value').catch(() => '') || '';
      if (SUBMIT_RX.test(text)) {
        return { detail: `blocked submit "${text.slice(0, 40)}"`, note: 'refused to click a submit control; the human submits' };
      }
      await loc.scrollIntoViewIfNeeded().catch(() => undefined);
      await Promise.all([
        page.waitForLoadState?.('domcontentloaded', { timeout: 8_000 }).catch(() => undefined),
        loc.click({ timeout: 6_000 }),
      ]);
      await page.waitForTimeout(700);
      return { detail: `click "${text.slice(0, 40)}"` };
    }
    if (action.action === 'type' && loc) {
      await loc.fill(action.text ?? '').catch(async () => {
        await loc.click();
        await page.keyboard.type(action.text ?? '');
      });
      await page.waitForTimeout(700);
      return { detail: `type into ${action.ref}` };
    }
    if (action.action === 'select' && loc) {
      await loc.selectOption({ label: action.value ?? '' }).catch(() => loc.selectOption(action.value ?? ''));
      await page.waitForTimeout(700);
      return { detail: `select "${action.value ?? ''}"` };
    }
    if (action.action === 'scroll') {
      await page.evaluate(() => window.scrollBy(0, 700)).catch(() => undefined);
      await page.waitForTimeout(700);
      return { detail: 'scroll' };
    }
    return { detail: `unknown action ${action.action}` };
  } catch (error) {
    return { detail: `${action.action} failed: ${error instanceof Error ? error.message.slice(0, 80) : 'error'}` };
  }
}

function snapshotDom(): { text: string; n: number } {
  const clean = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const visible = (element: Element) => {
    const rect = (element as HTMLElement).getBoundingClientRect();
    return (element as HTMLElement).offsetParent !== null && rect.width > 2 && rect.height > 2;
  };
  const selector = 'a, button, input, textarea, select, [role="button"], [role="link"], [role="combobox"], [role="checkbox"], [role="radio"], [contenteditable="true"]';
  const elements = Array.from(document.querySelectorAll(selector)).filter(visible);
  const lines: string[] = [];
  let n = 0;

  for (const element of elements.slice(0, 70)) {
    const tag = element.tagName.toLowerCase();
    const inputType = ((element as HTMLInputElement).type || '').toLowerCase();
    const role = element.getAttribute('role') || (tag === 'a' ? 'link' : tag);
    const label = clean(
      element.getAttribute('aria-label') ||
      (element as HTMLInputElement).placeholder ||
      element.textContent ||
      (element as HTMLInputElement).value ||
      (element as HTMLInputElement).name,
    );
    const kind = tag === 'input' ? inputType || 'text' : tag === 'a' ? 'link' : tag === 'select' ? 'select' : tag === 'textarea' ? 'textarea' : role;
    if (tag === 'input' && ['hidden', 'submit', 'button', 'image', 'reset'].includes(inputType)) {
      lines.push(`[read-only] ${kind} "${label}"`);
      continue;
    }
    const ref = `e${n}`;
    element.setAttribute('data-co-ref', ref);
    lines.push(`[${ref}] ${kind} "${label}"`);
    n += 1;
  }
  return { text: lines.join('\n'), n };
}

async function titleFor(page: DrivePageLike): Promise<string> {
  return page.evaluate(() => document.title || '').catch(() => '');
}

function cssAttr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function looksLikeApplicationObservation(observation: PageObservation): boolean {
  const controls = observation.elements.filter((element) => !['static_text', 'link', 'button'].includes(element.kind));
  if (controls.length === 0) return false;
  const label = (element: { label?: string; text?: string; name?: string }) =>
    `${element.label ?? ''} ${element.text ?? ''} ${element.name ?? ''}`.toLowerCase();
  return controls.some((element) =>
    element.kind === 'file_upload' ||
    /first name|last name|full name|email|e-mail|resume|cv|cover letter|phone|linkedin|github|portfolio|sponsorship|relocat/.test(label(element)),
  );
}
