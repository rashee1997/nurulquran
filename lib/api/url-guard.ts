/**
 * Guard for user-supplied AI provider base URLs.
 *
 * The BYOK flow lets a caller pass an OpenAI-compatible `baseUrl` that our server
 * then POSTs to, so an unvalidated value is a server-side request forgery vector.
 * Self-hosted/private endpoints (Ollama on `localhost`, a LAN box) are a legitimate
 * feature, so only the dangerous classes are refused: non-HTTP protocols, embedded
 * credentials, and cloud instance-metadata services.
 */

export class UnsafeProviderUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeProviderUrlError';
  }
}

const BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata.goog',
  'metadata',
  'instance-data',
  'metadata.azure.internal',
  '100.100.100.200', // Alibaba Cloud metadata
  'fd00:ec2::254', // AWS IPv6 metadata
]);

const LINK_LOCAL_PREFIX = '169.254.';

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
}

function isBlockedHost(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.startsWith(LINK_LOCAL_PREFIX)) return true;
  // IPv4-mapped IPv6 form of the link-local range (::ffff:169.254.x.x).
  if (host.startsWith('::ffff:') && host.slice('::ffff:'.length).startsWith(LINK_LOCAL_PREFIX)) {
    return true;
  }
  return false;
}

/**
 * Validates an optional provider base URL.
 * @returns the trimmed URL when safe, or `undefined` when not supplied.
 * @throws {UnsafeProviderUrlError} when the URL targets a blocked endpoint.
 */
export function assertSafeProviderBaseUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new UnsafeProviderUrlError('Provider base URL is not a valid absolute URL.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new UnsafeProviderUrlError('Provider base URL must use http or https.');
  }

  if (parsed.username || parsed.password) {
    throw new UnsafeProviderUrlError('Provider base URL must not embed credentials.');
  }

  if (isBlockedHost(parsed.hostname)) {
    throw new UnsafeProviderUrlError('Provider base URL targets a blocked metadata endpoint.');
  }

  return parsed.toString().replace(/\/$/, '');
}
