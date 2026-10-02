/**
 * The envelope every Joby event travels in.
 *
 * Everything here is JSON-serialisable on purpose. The dispatcher is in-process today
 * (see ADR 0002), but an event that cannot survive serialisation cannot later be handled
 * asynchronously without changing what it means.
 */

import type { ModuleName } from './domains';

/** Who or what caused the event. */
export type EventActor =
  | { readonly kind: 'user'; readonly userId: string }
  | { readonly kind: 'system'; readonly component: string };

export interface EventMetadata {
  /** Runtime that published the event. */
  readonly source: 'api' | 'worker' | 'web' | 'system';
  /** The module that owns this event type and is responsible for publishing it. */
  readonly owner: ModuleName;
  readonly actor: EventActor;
  /** Ties together everything that happened as part of one user-visible operation. */
  readonly correlationId?: string;
  /** The id of the event that led to this one, if any. */
  readonly causationId?: string;
}

/**
 * A fact about something that already happened and is already durably true.
 *
 * Payloads carry identifiers rather than object graphs: a handler re-reads current state
 * from the owning module rather than trusting a snapshot taken at publish time.
 */
export interface EventEnvelope<TName extends string, TPayload> {
  readonly id: string;
  readonly name: TName;
  /** ISO-8601, UTC. When the fact became true, not when it was dispatched. */
  readonly occurredAt: string;
  /** Joby is person-centric: every event is about exactly one person. */
  readonly personId: string;
  readonly payload: TPayload;
  readonly metadata: EventMetadata;
}

export function newEventId(): string {
  return globalThis.crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
