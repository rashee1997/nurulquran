/**
 * Web Crypto API wrappers for browser-side AES-GCM protection of user-supplied (BYOK)
 * API keys stored in IndexedDB.
 *
 * THREAT MODEL — read this before describing these keys as "secure":
 * Key material is derived from a device fingerprint (user agent + origin) and a fixed,
 * source-visible salt. This keeps a raw secret from sitting in IndexedDB as plaintext,
 * so casually inspecting browser storage or a database dump does not hand over a usable
 * key. It does NOT defend against script running on this origin (which can derive the
 * same key), and it is not a replacement for server-side secret storage. Anything that
 * needs a stronger guarantee must pass a user passphrase — `deriveKey(passphrase)`
 * already supports that path.
 */

/** Tag used when WebCrypto is unavailable and the value could only be encoded. */
const PLAIN_PREFIX = 'plain:';

const SALT = new TextEncoder().encode('NurulQuran-Secret');
const ITERATIONS = 100_000;

/** Base64-encodes a UTF-8 string without relying on deprecated escape helpers. */
function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** Decodes base64 back into a UTF-8 string. Throws on invalid input. */
function decodeBase64Utf8(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function hasWebCrypto(): boolean {
  return typeof window !== 'undefined' && Boolean(window.crypto?.subtle);
}

/**
 * Derives an AES-GCM CryptoKey from a device fingerprint or a caller-supplied
 * passphrase. Must run in a context that exposes `crypto.subtle`.
 */
async function deriveKey(passphrase?: string): Promise<CryptoKey> {
  const baseKeyMaterial =
    passphrase ||
    (typeof window !== 'undefined'
      ? `${window.navigator.userAgent}-${window.location.host}-quran-salt`
      : 'fallback-key-seed');

  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(baseKeyMaterial),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: SALT,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Protects plain text with AES-GCM.
 * Returns `iv:ciphertext`, both base64, or a `plain:`-tagged base64 string when
 * WebCrypto is unavailable (that case is an encoding, not encryption).
 */
export async function encryptSecret(plainText: string, passphrase?: string): Promise<string> {
  if (!hasWebCrypto()) {
    console.warn('WebCrypto unavailable — the value was only base64-encoded, not encrypted.');
    return `${PLAIN_PREFIX}${encodeBase64Utf8(plainText)}`;
  }

  const key = await deriveKey(passphrase);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const encryptedContent = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plainText)
  );

  const ivBase64 = encodeBase64Utf8(String.fromCharCode(...Array.from(iv)));
  const cipherBase64 = encodeBase64Utf8(String.fromCharCode(...Array.from(new Uint8Array(encryptedContent))));

  return `${ivBase64}:${cipherBase64}`;
}

/**
 * Reads back a value written by `encryptSecret`.
 * Returns an empty string when the payload cannot be read — callers must treat that as
 * "no usable key" rather than silently sending a corrupted credential upstream.
 */
export async function decryptSecret(encryptedPayload: string, passphrase?: string): Promise<string> {
  if (!encryptedPayload) return '';

  // Written without WebCrypto: no key material involved.
  if (encryptedPayload.startsWith(PLAIN_PREFIX)) {
    try {
      return decodeBase64Utf8(encryptedPayload.slice(PLAIN_PREFIX.length));
    } catch {
      return '';
    }
  }

  if (!hasWebCrypto()) return '';

  // Legacy values were stored as bare base64 with no IV.
  if (!encryptedPayload.includes(':')) {
    try {
      return decodeBase64Utf8(encryptedPayload);
    } catch {
      return '';
    }
  }

  try {
    const [ivBase64, cipherBase64] = encryptedPayload.split(':');
    if (!ivBase64 || !cipherBase64) return '';

    const iv = Uint8Array.from(atob(ivBase64), (char) => char.charCodeAt(0));
    const cipherBytes = Uint8Array.from(atob(cipherBase64), (char) => char.charCodeAt(0));

    const key = await deriveKey(passphrase);
    const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBytes);

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('Stored credential could not be decrypted:', error);
    return '';
  }
}

export const encryptApiKey = encryptSecret;
export const decryptApiKey = decryptSecret;
