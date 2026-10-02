import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/** Bootstrap service credentials until the API has sessions. Missing config fails closed.
 * Provision high-entropy bearer tokens server-side; never expose the map to clients.
 */
export function createSocialActorResolver(raw = process.env.JOBY_SOCIAL_ACTORS) {
  const entries: unknown = raw ? JSON.parse(raw) : {};
  if (!entries || typeof entries !== 'object' || Array.isArray(entries) ||
      Object.entries(entries).some(([token, person]) => token.length < 32 || typeof person !== 'string' || !person.trim())) {
    throw new Error('JOBY_SOCIAL_ACTORS must map tokens of at least 32 characters to person ids.');
  }
  const actors = Object.entries(entries).map(([token, person]) => ({ token: Buffer.from(token), person: person as string }));
  return async (request: IncomingMessage): Promise<string | undefined> => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return undefined;
    const token = Buffer.from(header.slice(7));
    return actors.find(actor => actor.token.length === token.length && timingSafeEqual(actor.token, token))?.person;
  };
}
