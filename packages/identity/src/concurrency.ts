/**
 * Optimistic concurrency, shared across every mutable Identity workflow.
 *
 * Its own module because the rule belongs to all of them and the write services belong to none of
 * each other: confirmation is guarded identity-wide, a correction per node, and a repositioning per
 * lens (ADR 0015). One error class means a caller handles "the world moved" once — and it lets
 * non-canonical modules use the mechanism without importing a canonical write surface.
 */

export class ConcurrencyError extends Error {
  constructor(expected: number, actual: number | undefined) {
    super(
      `Revision ${expected} is stale (current: ${actual ?? 'unknown'}). ` +
        'Someone else changed this identity — re-read it and re-apply your change.',
    );
    this.name = 'ConcurrencyError';
  }
}
