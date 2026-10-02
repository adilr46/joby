/**
 * `@joby/identity/testing` — test doubles.
 *
 * Separate from the production surfaces so a test double cannot be reached from application code by
 * accident. It was previously exported from the main entry point, where anything could have
 * imported it.
 */

export { FakeGitHubClient } from './github/fake-client';
