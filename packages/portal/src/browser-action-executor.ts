import type { PortalAction, PortalActionExecutor, PortalActionOutcome } from '@joby/translation/execution';

export interface ActionPageLike {
  fill(selector: string, value: string): Promise<void>;
  selectOption(selector: string, value: string): Promise<unknown>;
  check(selector: string): Promise<void>;
  uncheck(selector: string): Promise<void>;
  setInputFiles(selector: string, files: string | readonly string[]): Promise<void>;
}

export class PlaywrightPortalActionExecutor implements PortalActionExecutor {
  readonly #page: ActionPageLike;
  readonly #selectorFor: (surfaceElementId: string) => string;

  constructor(dependencies: {
    readonly page: ActionPageLike;
    readonly selectorFor?: (surfaceElementId: string) => string;
  }) {
    this.#page = dependencies.page;
    this.#selectorFor = dependencies.selectorFor ?? ((id) => id);
  }

  async execute(action: PortalAction): Promise<PortalActionOutcome> {
    const selector = this.#selectorFor(action.surfaceElementId);
    try {
      if (action.type === 'fill') await this.#page.fill(selector, action.value);
      else if (action.type === 'select') await this.#page.selectOption(selector, action.value);
      else if (action.type === 'check') {
        if (['false', 'no', '0', 'unchecked'].includes(action.value.trim().toLowerCase())) await this.#page.uncheck(selector);
        else await this.#page.check(selector);
      } else {
        await this.#page.setInputFiles(selector, action.value);
      }
      return { surfaceElementId: action.surfaceElementId, status: 'executed' };
    } catch (error) {
      return {
        surfaceElementId: action.surfaceElementId,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
