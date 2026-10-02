const PRIVATE_HOST_PATTERNS = [
  /^localhost$/,
  /^localhost\.localdomain$/,
  /^0\.0\.0\.0$/,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^::1$/,
  /^::$/,
  /^fc[0-9a-f]{2}:/,
  /^fe80:/,
] as const;

export type EgressGuardCode = 'invalid_url' | 'unsupported_protocol' | 'blocked_host' | 'dns_no_addresses';

export interface EgressGuardRejection {
  readonly code: EgressGuardCode;
  readonly reason: string;
}

function normalizeHost(rawHostname: string): string {
  let host = rawHostname.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (host.endsWith('.')) host = host.slice(0, -1);
  return host;
}

function mappedIpv4(host: string): string | undefined {
  const dotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(host);
  if (dotted) return dotted[1];

  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  if (!hex) return undefined;
  const a = Number.parseInt(hex[1]!, 16);
  const b = Number.parseInt(hex[2]!, 16);
  return `${(a >> 8) & 0xff}.${a & 0xff}.${(b >> 8) & 0xff}.${b & 0xff}`;
}

function isPrivateHost(host: string): boolean {
  const normalized = normalizeHost(host);
  const candidates = [normalized, mappedIpv4(normalized)].filter((value): value is string => Boolean(value));
  return candidates.some((candidate) => PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(candidate)));
}

export function rejectPrivateOrInvalid(url: string): EgressGuardRejection | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { code: 'invalid_url', reason: 'invalid URL' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { code: 'unsupported_protocol', reason: `unsupported protocol ${parsed.protocol}` };
  }

  if (isPrivateHost(parsed.hostname)) {
    return { code: 'blocked_host', reason: `blocked host ${parsed.hostname}` };
  }

  return undefined;
}

export interface HostResolver {
  resolve(hostname: string): Promise<readonly string[]>;
}

export class DnsEgressGuard {
  readonly #resolver: HostResolver;
  readonly #cache = new Map<string, readonly string[]>();

  constructor(resolver: HostResolver = new NodeHostResolver()) {
    this.#resolver = resolver;
  }

  async validate(url: string): Promise<void> {
    const literal = rejectPrivateOrInvalid(url);
    if (literal) throw new EgressGuardError(literal);

    const parsed = new URL(url);
    const hostname = normalizeHost(parsed.hostname);
    let addresses = this.#cache.get(hostname);
    if (!addresses) {
      addresses = await this.#resolver.resolve(hostname);
      this.#cache.set(hostname, addresses);
    }

    if (addresses.length === 0) {
      throw new EgressGuardError({ code: 'dns_no_addresses', reason: `DNS resolution returned no addresses for ${hostname}` });
    }

    const blocked = addresses.find((address) => isPrivateHost(address));
    if (blocked) {
      throw new EgressGuardError({ code: 'blocked_host', reason: `blocked private target IP ${blocked}` });
    }
  }
}

export class EgressGuardError extends Error {
  readonly code: EgressGuardCode;

  constructor(rejection: EgressGuardRejection) {
    super(rejection.reason);
    this.name = 'EgressGuardError';
    this.code = rejection.code;
  }
}

class NodeHostResolver implements HostResolver {
  async resolve(hostname: string): Promise<readonly string[]> {
    const dns = await import('node:dns/promises');
    const [ipv4, ipv6, lookup] = await Promise.all([
      dns.resolve4(hostname).catch(() => []),
      dns.resolve6(hostname).catch(() => []),
      dns.lookup(hostname, { all: true }).then((rows) => rows.map((row) => row.address)).catch(() => []),
    ]);
    return [...new Set([...ipv4, ...ipv6, ...lookup])];
  }
}
