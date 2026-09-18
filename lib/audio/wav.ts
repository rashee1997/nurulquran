/**
 * Raw PCM → playable audio.
 *
 * The live-coach capture pipeline stores 16 kHz mono PCM16 samples (no container header),
 * which browsers cannot play directly. Wrapping the samples in a minimal 44-byte WAV header
 * produces a data URL any `<audio>` element can play — entirely on-device, so a learner's
 * own recitation never leaves the browser to be replayed.
 */

const RECORDING_SAMPLE_RATE = 16_000;

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Wraps raw PCM16 base64 (as captured by `useLiveTajweed`) in a WAV container and returns
 * a `data:` URL. Returns null when the input is empty or not valid base64.
 */
export function pcm16Base64ToWavDataUrl(base64: string, sampleRate: number = RECORDING_SAMPLE_RATE): string | null {
  if (base64.length === 0) return null;
  let pcm: Uint8Array;
  try {
    pcm = base64ToBytes(base64);
  } catch {
    return null;
  }
  if (pcm.length === 0 || pcm.length % 2 !== 0) return null;

  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeString = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  const channels = 1;
  const bitsPerSample = 16;
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, pcm.length, true);

  const bytes = new Uint8Array(44 + pcm.length);
  bytes.set(new Uint8Array(header), 0);
  bytes.set(pcm, 44);

  // Chunked btoa: spreading a large buffer into String.fromCharCode overflows the stack.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}
