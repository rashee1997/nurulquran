/**
 * Raw PCM → playable audio, and raw PCM → an uploadable WAV.
 *
 * The live-coach capture pipeline stores 16 kHz mono PCM16 samples (no container header),
 * which browsers cannot play directly. Wrapping the samples in a minimal 44-byte WAV header
 * produces a data URL any `<audio>` element can play — entirely on-device, so a learner's
 * own recitation never leaves the browser to be replayed.
 *
 * The `float32ToWavBase64` half exists for the opposite direction: a recording that *does*
 * leave the device (a spoken reflection sent for grading) must be a format the model service
 * documents support. `MediaRecorder` produces WebM/Opus in Chromium and MP4/AAC in Safari,
 * neither of which is a supported inline audio input, so the clip is decoded and re-encoded as
 * 16 kHz mono WAV before it is uploaded.
 */

const RECORDING_SAMPLE_RATE = 16_000;

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Chunked base64: spreading a large buffer into `String.fromCharCode` overflows the stack. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Wraps raw 16-bit PCM samples in a 44-byte RIFF/WAVE header. */
function wrapPcm16AsWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
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

  return `data:audio/wav;base64,${bytesToBase64(wrapPcm16AsWav(pcm, sampleRate))}`;
}

/**
 * Encodes float samples as a 16 kHz mono 16-bit WAV, base64 (no `data:` prefix).
 *
 * Samples are clamped before conversion: a decoded recording can carry values outside
 * [-1, 1], and `Int16` truncation of those wraps to the opposite polarity, which would
 * turn a loud syllable into noise the grader hears as a different word.
 */
export function float32ToWavBase64(
  samples: Float32Array,
  sampleRate: number = RECORDING_SAMPLE_RATE
): string {
  const pcm = new Uint8Array(samples.length * 2);
  const view = new DataView(pcm.buffer);
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i] ?? 0;
    const clamped = sample < -1 ? -1 : sample > 1 ? 1 : sample;
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return bytesToBase64(wrapPcm16AsWav(pcm, sampleRate));
}
