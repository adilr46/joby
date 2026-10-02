/**
 * Crossing the process boundary.
 *
 * In-process, an event's type is guaranteed by the compiler and no runtime validation is
 * needed. ADR 0002 said the first thing to add if events ever crossed a process boundary
 * would be a runtime check — with the outbox and queue (ADR 0004), they now do. Whatever
 * comes back out of a database column is `unknown` until proven otherwise.
 *
 * This is a shallow structural guard, not a schema registry and not payload validation.
 * It catches corruption and version skew, not semantic mistakes.
 */

import type { AnyJobyEvent } from './event';
import { isEventName } from './names';

export class EventParseError extends Error {
  constructor(message: string, readonly raw: unknown) {
    super(`Malformed event envelope: ${message}`);
    this.name = 'EventParseError';
  }
}

export function serializeEvent(event: AnyJobyEvent): string {
  return JSON.stringify(event);
}

/** Parse and shallowly validate an envelope read back from storage or the queue. */
export function parseEvent(raw: string | unknown): AnyJobyEvent {
  let value: unknown = raw;

  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch (error) {
      throw new EventParseError(`not valid JSON (${String(error)})`, raw);
    }
  }

  if (typeof value !== 'object' || value === null) {
    throw new EventParseError('not an object', raw);
  }

  const candidate = value as Record<string, unknown>;

  for (const field of ['id', 'occurredAt', 'personId'] as const) {
    if (typeof candidate[field] !== 'string' || candidate[field] === '') {
      throw new EventParseError(`missing or empty '${field}'`, raw);
    }
  }

  // An unknown name means this process is older than the event that produced it.
  if (typeof candidate.name !== 'string' || !isEventName(candidate.name)) {
    throw new EventParseError(`unknown event name '${String(candidate.name)}'`, raw);
  }

  if (typeof candidate.payload !== 'object' || candidate.payload === null) {
    throw new EventParseError('missing payload', raw);
  }

  if (typeof candidate.metadata !== 'object' || candidate.metadata === null) {
    throw new EventParseError('missing metadata', raw);
  }

  return candidate as unknown as AnyJobyEvent;
}
