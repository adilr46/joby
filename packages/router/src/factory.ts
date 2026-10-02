import { Router, type RouterOptions } from './router';

/**
 * Compose Router.
 *
 * Readers are supplied by the caller, so `@joby/router` depends on neither Identity nor Opportunity:
 * only an app composition root imports both sides.
 */
export function createRouter(options: RouterOptions): Router {
  return new Router(options);
}
