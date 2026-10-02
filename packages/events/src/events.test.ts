/**
 * The first execution of `packages/events`. Until now it was source that had never run.
 *
 * These cover the properties other code depends on, not the class shapes: delivery filtering
 * (the thing that stops a handler running twice), failure isolation, and envelope round-trip
 * across the process boundary.
 */

import { describe, expect, it, vi } from 'vitest';

import { createEvent } from './event';
import { InProcessEventDispatcher } from './dispatcher';
import type { EventHandler } from './handler';
import { EVENT_NAMES, EVENT_OWNER, isEventName } from './names';
import { EventParseError, parseEvent, serializeEvent } from './serialization';
import { toOutboxRecord } from './outbox';

function identityUpdated() {
  return createEvent('IdentityUpdated', {
    personId: 'person-1',
    payload: { identityId: 'identity-1', changedFields: ['structure'], revision: 2, userConfirmed: true },
    metadata: { source: 'api', actor: { kind: 'user', userId: 'user-1' } },
  });
}

function handler(overrides: Partial<EventHandler<'IdentityUpdated'>> = {}): EventHandler<'IdentityUpdated'> {
  return {
    id: 'test.handler',
    module: 'durable_identity',
    handles: 'IdentityUpdated',
    delivery: 'inline',
    handle: async () => {},
    ...overrides,
  };
}

describe('event contracts', () => {
  it('derives the owning module from the name rather than the caller', () => {
    expect(identityUpdated().metadata.owner).toBe('durable_identity');
    for (const name of EVENT_NAMES) {
      expect(EVENT_OWNER[name]).toBeTruthy();
    }
  });

  it('rejects names outside the closed union', () => {
    expect(isEventName('IdentityUpdated')).toBe(true);
    expect(isEventName('SourceCaptured')).toBe(false);
  });

  it('keeps aggregate-coordination facts owned by their originating modules', () => {
    const removed = createEvent('CanonicalFactRemoved', {
      personId: 'person-1',
      payload: { identityId: 'identity-1', nodeId: 'node-1', revision: 3 },
      metadata: { source: 'api', actor: { kind: 'user', userId: 'user-1' } },
    });
    const revised = createEvent('IdentityRepresentationRevised', {
      personId: 'person-1',
      payload: { representationId: 'representation-1', revision: 4, changedFields: ['decisions'] },
      metadata: { source: 'worker', actor: { kind: 'system', component: 'reconciler' } },
    });

    expect(removed.metadata.owner).toBe('durable_identity');
    expect(revised.metadata.owner).toBe('identity_representation');
  });
});

describe('InProcessEventDispatcher', () => {
  it('refuses a handler whose delivery does not match the runtime', () => {
    // This is what stops a deferrable handler running inline in the API *and* in the worker.
    const inline = new InProcessEventDispatcher({ accepts: 'inline' });
    expect(() => inline.subscribe(handler({ delivery: 'deferrable' }))).toThrow(/only accepts 'inline'/);

    const deferrable = new InProcessEventDispatcher({ accepts: 'deferrable' });
    expect(() => deferrable.subscribe(handler({ delivery: 'inline' }))).toThrow(/only accepts 'deferrable'/);
  });

  it('rejects a duplicate handler id', () => {
    const dispatcher = new InProcessEventDispatcher({ accepts: 'inline' });
    dispatcher.subscribe(handler());
    expect(() => dispatcher.subscribe(handler())).toThrow(/Duplicate event handler id/);
  });

  it('isolates a failing handler from the others and from the publisher', async () => {
    const onError = vi.fn();
    const dispatcher = new InProcessEventDispatcher({ accepts: 'inline', onError });
    const succeeded = vi.fn();

    dispatcher.subscribe(handler({ id: 'a', handle: async () => { throw new Error('boom'); } }));
    dispatcher.subscribe(handler({ id: 'b', handle: succeeded }));

    // publish() is the domain-facing contract: it never rejects and reports nothing.
    await expect(dispatcher.publish(identityUpdated())).resolves.toBeUndefined();
    expect(succeeded).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();

    // dispatch() is the worker's contract: it has to know, to decide ack vs release.
    const result = await dispatcher.dispatch(identityUpdated());
    expect(result.handled).toEqual(['b']);
    expect(result.failed.map((f) => f.handlerId)).toEqual(['a']);
  });

  it('delivers only to handlers of that event name', async () => {
    const dispatcher = new InProcessEventDispatcher({ accepts: 'inline' });
    const other = vi.fn();
    dispatcher.subscribe({ ...handler({ id: 'other' }), handles: 'OutcomeObserved' } as EventHandler);

    await dispatcher.publish(identityUpdated());
    expect(other).not.toHaveBeenCalled();
  });
});

describe('serialization across the process boundary', () => {
  it('round-trips an envelope unchanged', () => {
    const event = identityUpdated();
    expect(parseEvent(serializeEvent(event))).toEqual(event);
  });

  it('accepts an already-parsed object, as read from a jsonb column', () => {
    const event = identityUpdated();
    expect(parseEvent(JSON.parse(serializeEvent(event)))).toEqual(event);
  });

  it.each([
    ['not JSON', '{nope'],
    ['not an object', '"a string"'],
    ['missing id', JSON.stringify({ ...identityUpdated(), id: '' })],
    ['unknown name', JSON.stringify({ ...identityUpdated(), name: 'SomethingNewer' })],
    ['missing payload', JSON.stringify({ ...identityUpdated(), payload: null })],
  ])('rejects %s', (_label, raw) => {
    expect(() => parseEvent(raw)).toThrow(EventParseError);
  });
});

describe('toOutboxRecord', () => {
  it('carries the envelope whole and starts pending with no attempts', () => {
    const event = identityUpdated();
    const record = toOutboxRecord(event);

    expect(record.envelope).toBe(event);
    expect(record.eventId).toBe(event.id);
    expect(record.status).toBe('pending');
    expect(record.attempts).toBe(0);
  });
});
