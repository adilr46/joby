/** Closed legacy event-owner namespace; not the canonical semantic topology (ADR 0029). */

export const MODULE_NAMES = [
  'durable_identity',
  'identity_representation',
  'adaptation',
  'opportunity',
  'application',
  'portal',
  'memory',
] as const;

export type ModuleName = (typeof MODULE_NAMES)[number];
