/**
 * Whisper's log-mel front end, isolated so it can be verified against the reference implementation.
 *
 * The encoder will accept whatever numbers it is handed and produce confident, fluent nonsense if
 * they are not the mel features it was trained on — that is a failure mode with no runtime error,
 * so this module exists to make the transform independently testable. `scripts/verify-whisper-mel.ts`
 * compares the filterbank below element-by-element with the array Whisper itself ships
 * (`openai/whisper` → `whisper/assets/mel_filters.npz`).
 *
 * Every step mirrors `transformers.WhisperFeatureExtractor` and openai's `log_mel_spectrogram`:
 *
 *  1. zero-pad (or trim) to the fixed 30 s window — in the time domain, *before* the STFT;
 *  2. reflect-pad by `N_FFT / 2` on both sides, which is what `center=True` does;
 *  3. periodic Hann window, unnormalised power spectrum, keep the first 3000 columns;
 *  4. mel projection, then `log10` with a 1e-10 floor;
 *  5. clamp to `max − 8` and scale by `(x + 4) / 4`.
 *
 * Steps 1, 2 and 5 were all missing or wrong in the version this replaced (it used natural log and
 * emitted `[−8, 0]` where Whisper expects `[−1, 1.25]`), and its filterbank was un-normalised
 * HTK-scale triangles instead of Slaney-normalised ones.
 */

export const SAMPLE_RATE = 16000;
export const N_FFT = 400;
export const HOP = 160;
export const N_MELS = 80;
export const BINS = N_FFT / 2 + 1;
/** One Whisper window: 30 s at 16 kHz. Short utterances are zero-padded into it. */
export const N_SAMPLES = 30 * SAMPLE_RATE;
/** Mel frames the encoder consumes per window; 3000 at every Whisper size. */
export const N_MEL_FRAMES = 3000;

/* Slaney's mel scale — `librosa.hz_to_mel(htk=False)`, the scale Whisper's filters use. */
const SLANEY_F_SP = 200 / 3;
const SLANEY_MIN_LOG_HZ = 1000;
const SLANEY_MIN_LOG_MEL = SLANEY_MIN_LOG_HZ / SLANEY_F_SP;
const SLANEY_LOG_STEP = Math.log(6.4) / 27;

function hzToMelSlaney(hz: number): number {
  if (hz < SLANEY_MIN_LOG_HZ) return hz / SLANEY_F_SP;
  return SLANEY_MIN_LOG_MEL + Math.log(hz / SLANEY_MIN_LOG_HZ) / SLANEY_LOG_STEP;
}

function melToHzSlaney(mel: number): number {
  if (mel < SLANEY_MIN_LOG_MEL) return mel * SLANEY_F_SP;
  return SLANEY_MIN_LOG_HZ * Math.exp((mel - SLANEY_MIN_LOG_MEL) * SLANEY_LOG_STEP);
}

let filters: Float32Array[] | null = null;
let windowCache: Float32Array | null = null;
let cosTable: Float32Array | null = null;
let sinTable: Float32Array | null = null;

/**
 * Whisper's mel filterbank: 80 triangular filters in Slaney-normalised form, exactly as
 * `librosa.filters.mel(sr=16000, n_fft=400, n_mels=80, norm="slaney", htk=False)` builds the array
 * stored in `mel_filters.npz`.
 *
 * Both halves matter: the triangles sit between equal *mel*-spaced points but are interpolated in
 * Hz, and each is scaled by `2 / (f[m+2] − f[m])` so that it carries unit area. Without that
 * normalisation the output spectrum is scaled by a different factor per band, which is precisely
 * the kind of distortion a trained decoder cannot undo.
 */
export function melFilterbank(): Float32Array[] {
  if (filters) return filters;
  const minMel = hzToMelSlaney(0);
  const maxMel = hzToMelSlaney(SAMPLE_RATE / 2);
  const points: number[] = [];
  for (let i = 0; i < N_MELS + 2; i += 1) {
    points.push(melToHzSlaney(minMel + ((maxMel - minMel) * i) / (N_MELS + 1)));
  }

  const built: Float32Array[] = [];
  for (let m = 0; m < N_MELS; m += 1) {
    const lower = points[m] ?? 0;
    const centre = points[m + 1] ?? 0;
    const upper = points[m + 2] ?? 0;
    const enorm = 2 / (upper - lower);
    const filter = new Float32Array(BINS);
    for (let b = 0; b < BINS; b += 1) {
      const hz = (b * SAMPLE_RATE) / N_FFT;
      const rising = (hz - lower) / (centre - lower);
      const falling = (upper - hz) / (upper - centre);
      filter[b] = Math.max(0, Math.min(rising, falling)) * enorm;
    }
    built.push(filter);
  }
  filters = built;
  return built;
}

/**
 * Periodic Hann window — `torch.hann_window(400)`, i.e. `0.5 − 0.5·cos(2πi/N)`.
 * The symmetric form (`N − 1` in the denominator) is a different window and must not be used.
 */
function buildWindow(): Float32Array {
  if (windowCache) return windowCache;
  const window = new Float32Array(N_FFT);
  for (let i = 0; i < N_FFT; i += 1) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N_FFT);
  }
  windowCache = window;
  return window;
}

/**
 * Precomputed DFT basis, so the transform costs a multiply-add per (bin, sample) instead of a
 * `Math.cos`/`Math.sin` pair.
 */
function buildTrigTables(): { cos: Float32Array; sin: Float32Array } {
  if (!cosTable || !sinTable) {
    const cos = new Float32Array(BINS * N_FFT);
    const sin = new Float32Array(BINS * N_FFT);
    for (let b = 0; b < BINS; b += 1) {
      for (let i = 0; i < N_FFT; i += 1) {
        const angle = (-2 * Math.PI * b * i) / N_FFT;
        cos[b * N_FFT + i] = Math.cos(angle);
        sin[b * N_FFT + i] = Math.sin(angle);
      }
    }
    cosTable = cos;
    sinTable = sin;
  }
  return { cos: cosTable, sin: sinTable };
}

/**
 * Projects raw 16 kHz PCM onto Whisper's log-mel basis, `[N_MELS, N_MEL_FRAMES]` in row-major
 * order. Only the first 30 s of a longer utterance is used, matching Whisper's own window.
 */
export function floatToLogMel(pcm: Float32Array): Float32Array {
  const filterbank = melFilterbank();
  const window = buildWindow();
  const { cos, sin } = buildTrigTables();

  const trimmed = new Float32Array(N_SAMPLES);
  trimmed.set(pcm.subarray(0, Math.min(pcm.length, N_SAMPLES)));

  const pad = N_FFT / 2;
  const padded = new Float32Array(N_SAMPLES + 2 * pad);
  padded.set(trimmed, pad);
  for (let i = 0; i < pad; i += 1) {
    padded[i] = trimmed[pad - i] ?? 0;
    padded[N_SAMPLES + pad + i] = trimmed[N_SAMPLES - 2 - i] ?? 0;
  }

  const out = new Float32Array(N_MELS * N_MEL_FRAMES);
  const frame = new Float32Array(N_FFT);
  const power = new Float32Array(BINS);

  for (let f = 0; f < N_MEL_FRAMES; f += 1) {
    const base = f * HOP;
    for (let i = 0; i < N_FFT; i += 1) {
      frame[i] = (padded[base + i] ?? 0) * (window[i] ?? 0);
    }
    for (let b = 0; b < BINS; b += 1) {
      const row = b * N_FFT;
      let re = 0;
      let im = 0;
      for (let i = 0; i < N_FFT; i += 1) {
        const sample = frame[i] ?? 0;
        re += sample * (cos[row + i] ?? 0);
        im += sample * (sin[row + i] ?? 0);
      }
      power[b] = re * re + im * im;
    }
    for (let m = 0; m < N_MELS; m += 1) {
      const filter = filterbank[m];
      if (!filter) continue;
      let energy = 1e-10;
      for (let b = 0; b < BINS; b += 1) {
        energy += (filter[b] ?? 0) * (power[b] ?? 0);
      }
      out[m * N_MEL_FRAMES + f] = Math.log10(energy);
    }
  }

  // The padded tail of a short utterance is digital silence (log10(1e-10) = −10), well below the
  // floor, so it folds onto it exactly as the reference implementation does.
  let max = -Infinity;
  for (let i = 0; i < out.length; i += 1) {
    const value = out[i] ?? -Infinity;
    if (value > max) max = value;
  }
  for (let i = 0; i < out.length; i += 1) {
    out[i] = (Math.max(out[i] ?? 0, max - 8) + 4) / 4;
  }
  return out;
}
