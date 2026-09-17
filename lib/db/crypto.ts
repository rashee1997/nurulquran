/**
 * Web Crypto API wrappers for browser-side AES-GCM encryption and decryption.
 * Used for securing user API keys (BYOK) in IndexedDB without exposing raw credentials.
 */

const SALT = new Uint8Array([78, 117, 114, 117, 108, 81, 117, 114, 97, 110, 45, 83, 101, 99, 114, 101]); // "NurulQuran-Secre"
const ITERATIONS = 100000;

/**
 * Derives an AES-GCM CryptoKey from a device-bound fingerprint or user passphrase
 */
async function deriveKey(passphrase?: string): Promise<CryptoKey> {
  // Use user-provided passphrase or a deterministic browser-device signature
  const baseKeyMaterial = passphrase || (typeof window !== 'undefined' ? `${window.navigator.userAgent}-${window.location.host}-quran-salt` : 'fallback-key-seed');
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(baseKeyMaterial),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: SALT,
      iterations: ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts plain text using AES-GCM
 * Returns base64 encoded payload formatted as `iv:ciphertext`
 */
export async function encryptSecret(plainText: string, passphrase?: string): Promise<string> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    // Server-side fallback or environment without subtle crypto
    return Buffer.from(plainText).toString('base64');
  }

  const key = await deriveKey(passphrase);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  
  const encryptedContent = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv
    },
    key,
    enc.encode(plainText)
  );

  const ivBase64 = btoa(String.fromCharCode(...Array.from(iv)));
  const cipherBase64 = btoa(String.fromCharCode(...Array.from(new Uint8Array(encryptedContent))));

  return `${ivBase64}:${cipherBase64}`;
}

/**
 * Decrypts AES-GCM encrypted payload
 */
export async function decryptSecret(encryptedPayload: string, passphrase?: string): Promise<string> {
  if (!encryptedPayload) return '';

  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    return Buffer.from(encryptedPayload, 'base64').toString('utf-8');
  }

  // Check if standard iv:ciphertext format
  if (!encryptedPayload.includes(':')) {
    try {
      return atob(encryptedPayload);
    } catch {
      return encryptedPayload;
    }
  }

  try {
    const [ivBase64, cipherBase64] = encryptedPayload.split(':');
    const iv = new Uint8Array(atob(ivBase64).split('').map(c => c.charCodeAt(0)));
    const cipherBytes = new Uint8Array(atob(cipherBase64).split('').map(c => c.charCodeAt(0)));

    const key = await deriveKey(passphrase);
    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv
      },
      key,
      cipherBytes
    );

    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (error) {
    console.error('Decryption failed, treating as plaintext or raw base64:', error);
    try {
      return atob(encryptedPayload);
    } catch {
      return encryptedPayload;
    }
  }
}

export const encryptApiKey = encryptSecret;
export const decryptApiKey = decryptSecret;
