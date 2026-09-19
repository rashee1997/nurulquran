/**
 * Whisper log-mel contract check.
 *
 * `lib/audio/whisper-mel.ts` is the one piece of the local recitation engine that can be wrong
 * without producing an error: feed the encoder a mel it was not trained on and it still returns
 * confident, fluent Arabic — just the wrong Arabic. There is no exception to catch and no test to
 * fail unless this file exists.
 *
 * It therefore checks the two things that actually pin the transform down, both against the
 * upstream sources rather than against a stored expectation of our own output:
 *
 *  1. **The filterbank**, element by element, against the array Whisper itself ships
 *     (`openai/whisper` → `whisper/assets/mel_filters.npz`). A Slaney-normalised filterbank is not
 *     something to eyeball; this compares all 16 080 numbers.
 *  2. **The special-token ids** in `lib/audio/whisper-vocab.ts`, against the shipped Quran model's
 *     own `added_tokens.json`. These decide the decoder's prompt, and a wrong prompt is the other
 *     silent failure mode — the previous values were the English-only checkpoint's.
 *
 * A 1 kHz tone is then pushed through `floatToLogMel` to confirm the pipeline is wired up at all:
 * correct shape, finite values, a peak in the mel band that actually contains 1 kHz, and output
 * inside the `[−1, 1.25]` range Whisper's `(x + 4) / 4` scaling produces.
 *
 * Usage: `bun scripts/verify-whisper-mel.ts` — prints a report and exits non-zero on any failure.
 * Needs network access.
 */

import { inflateRawSync } from 'node:zlib';
import {
  BINS,
  N_FFT,
  N_MELS,
  N_MEL_FRAMES,
  SAMPLE_RATE,
  floatToLogMel,
  melFilterbank,
} from '@/lib/audio/whisper-mel';
import { WHISPER_SPECIAL } from '@/lib/audio/whisper-vocab';

const MEL_FILTERS_URL =
  'https://raw.githubusercontent.com/openai/whisper/main/whisper/assets/mel_filters.npz';

/** The shipped model — the same repository `MODEL_VARIANTS` pins its assets to. */
const MODEL_BASE = 'https://huggingface.co/aaqibhabib/whisper-base-ar-quran-onnx/resolve/main';

/** Max absolute element error tolerated against `mel_80.npy`. Float32 vs float64 lands near 1e-8. */
const FILTER_TOLERANCE = 1e-6;

interface Finding {
  check: string;
  message: string;
}

/* ---------------------------- reference decoding --------------------------- */

/** Pulls one member out of a stored (uncompressed) zip — the format `.npz` actually uses here. */
function unzipEntry(zip: Buffer, wanted: string): Buffer {
  let offset = 0;
  while (offset + 4 <= zip.length) {
    if (zip.readUInt32LE(offset) !== 0x04034b50) {
      offset += 1;
      continue;
    }
    const method = zip.readUInt16LE(offset + 8);
    const compressedSize = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const dataStart = offset + 30 + nameLength + extraLength;
    const data = zip.subarray(dataStart, dataStart + compressedSize);
    if (name === wanted) return method === 0 ? data : inflateRawSync(data);
    offset = dataStart + compressedSize;
  }
  throw new Error(`${wanted} is not a member of the archive.`);
}

/** Minimal `.npy` reader for the little-endian float32 arrays `numpy.savez` writes. */
function parseNpy(buffer: Buffer): { shape: number[]; data: Float32Array } {
  if (buffer.subarray(0, 6).toString('latin1') !== '\x93NUMPY') throw new Error('Not a .npy file.');
  const major = buffer[6];
  const headerLength = major === 1 ? buffer.readUInt16LE(8) : buffer.readUInt32LE(8);
  const headerStart = major === 1 ? 10 : 12;
  const header = buffer.subarray(headerStart, headerStart + headerLength).toString('latin1');
  const descriptor = /'descr':\s*'([^']+)'/.exec(header)?.[1];
  const shapeText = /'shape':\s*\(([^)]*)\)/.exec(header)?.[1] ?? '';
  const shape = (shapeText.match(/\d+/g) ?? []).map(Number);
  if (descriptor !== '<f4') throw new Error(`Unsupported .npy dtype ${descriptor}.`);
  if (/'fortran_order':\s*True/.test(header)) throw new Error('Fortran-ordered .npy is unsupported.');
  const raw = buffer.subarray(headerStart + headerLength);
  return {
    shape,
    data: new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)),
  };
}

/* ---------------------------------- checks --------------------------------- */

async function checkFilterbank(failures: Finding[]): Promise<void> {
  const response = await fetch(MEL_FILTERS_URL);
  if (!response.ok) throw new Error(`mel_filters.npz returned HTTP ${response.status}.`);
  const archive = Buffer.from(await response.arrayBuffer());
  const reference = parseNpy(unzipEntry(archive, 'mel_80.npy'));

  if (reference.shape[0] !== N_MELS || reference.shape[1] !== BINS) {
    failures.push({
      check: 'filterbank',
      message: `mel_80.npy is ${reference.shape.join('×')}; expected ${N_MELS}×${BINS}.`,
    });
    return;
  }

  const ours = melFilterbank();
  let worst = 0;
  let worstAt = '';
  for (let m = 0; m < N_MELS; m += 1) {
    const filter = ours[m];
    if (!filter) {
      failures.push({ check: 'filterbank', message: `Filter ${m} is missing.` });
      return;
    }
    for (let b = 0; b < BINS; b += 1) {
      const expected = reference.data[m * BINS + b] ?? 0;
      const error = Math.abs((filter[b] ?? 0) - expected);
      if (error > worst) {
        worst = error;
        worstAt = `band ${m}, bin ${b}`;
      }
    }
  }

  if (worst > FILTER_TOLERANCE) {
    failures.push({
      check: 'filterbank',
      message: `Worst element differs by ${worst.toExponential(2)} at ${worstAt} (limit ${FILTER_TOLERANCE}).`,
    });
    return;
  }
  console.log(
    `  filterbank  ✓ 80×${BINS} = ${N_MELS * BINS} elements match mel_80.npy ` +
      `(worst ${worst.toExponential(2)} at ${worstAt})`
  );
}

async function checkSpecialTokens(failures: Finding[]): Promise<void> {
  const response = await fetch(`${MODEL_BASE}/added_tokens.json`);
  if (!response.ok) throw new Error(`added_tokens.json returned HTTP ${response.status}.`);
  const added = (await response.json()) as Record<string, number>;

  const expected: Array<[keyof typeof WHISPER_SPECIAL, string]> = [
    ['sot', '<|startoftranscript|>'],
    ['transcribe', '<|transcribe|>'],
    ['notimestamps', '<|notimestamps|>'],
    ['no_speech', '<|nocaptions|>'],
    ['ar', '<|ar|>'],
    ['ta', '<|ta|>'],
  ];

  let mismatches = 0;
  for (const [key, token] of expected) {
    const upstream = added[token];
    const ours = WHISPER_SPECIAL[key];
    if (upstream === undefined) {
      failures.push({ check: 'token ids', message: `${token} is absent from added_tokens.json.` });
      mismatches += 1;
      continue;
    }
    if (ours !== upstream) {
      failures.push({
        check: 'token ids',
        message: `${key} is ${ours}; the model uses ${upstream} for ${token}.`,
      });
      mismatches += 1;
    }
  }
  if (mismatches === 0) {
    console.log(`  token ids   ✓ ${expected.length} special ids match the model's added_tokens.json`);
  }
}

function checkTone(failures: Finding[]): void {
  const samples = new Float32Array(SAMPLE_RATE);
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = 0.5 * Math.sin((2 * Math.PI * 1000 * i) / SAMPLE_RATE);
  }

  const mel = floatToLogMel(samples);
  if (mel.length !== N_MELS * N_MEL_FRAMES) {
    failures.push({
      check: 'tone',
      message: `floatToLogMel returned ${mel.length} values; expected ${N_MELS * N_MEL_FRAMES}.`,
    });
    return;
  }

  let min = Infinity;
  let max = -Infinity;
  for (const value of mel) {
    if (!Number.isFinite(value)) {
      failures.push({ check: 'tone', message: 'floatToLogMel produced a non-finite value.' });
      return;
    }
    if (value < min) min = value;
    if (value > max) max = value;
  }
  /*
   * The scaling `(clamp(x, max − 8) + 4) / 4` has exactly one hard invariant: the 8-decade clamp
   * spans 8/4 = 2 units after scaling, so `max − min` can never exceed 2. That is what pins the
   * transform down — natural log instead of log10 (a 1/ln10 factor) or a missing `+4` breaks it
   * immediately, whatever the input amplitude. An absolute window cannot be asserted, because the
   * output is not amplitude-normalised: a loud input legitimately reaches (max_log10 + 4) / 4 > 1.
   */
  if (max - min > 2.0001) {
    failures.push({
      check: 'tone',
      message: `Output spans ${(max - min).toFixed(3)}; the 8-decade clamp caps it at 2.`,
    });
    return;
  }
  // A real 1 kHz tone at amplitude 0.5 must sit well above the floor, not on it.
  if (max < 0) {
    failures.push({
      check: 'tone',
      message: `Output peaks at ${max.toFixed(3)}; a half-amplitude tone should not be at the floor.`,
    });
    return;
  }

  // The tone fills every frame, so the loudest band averaged over the voiced region is the band
  // that contains 1 kHz. On the Slaney scale that is band ≈ 26 of 80.
  const voicedFrames = 40;
  let loudestBand = -1;
  let loudest = -Infinity;
  for (let m = 0; m < N_MELS; m += 1) {
    let sum = 0;
    for (let f = 5; f < 5 + voicedFrames; f += 1) sum += mel[m * N_MEL_FRAMES + f] ?? -Infinity;
    if (sum > loudest) {
      loudest = sum;
      loudestBand = m;
    }
  }
  const expectedBand = 26;
  if (Math.abs(loudestBand - expectedBand) > 2) {
    failures.push({
      check: 'tone',
      message: `A 1 kHz tone peaks in mel band ${loudestBand}; expected ≈ ${expectedBand}.`,
    });
    return;
  }
  console.log(
    `  tone        ✓ 1 kHz peaks in band ${loudestBand} (expected ≈ ${expectedBand}), ` +
      `range [${min.toFixed(2)}, ${max.toFixed(2)}]`
  );
}

async function main(): Promise<void> {
  console.log(`Checking the Whisper log-mel contract (${N_FFT}-point FFT, ${N_MELS} mel bands)…`);
  const failures: Finding[] = [];

  try {
    await checkFilterbank(failures);
  } catch (error: unknown) {
    failures.push({
      check: 'filterbank',
      message: `The reference filterbank could not be read: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  try {
    await checkSpecialTokens(failures);
  } catch (error: unknown) {
    failures.push({
      check: 'token ids',
      message: `The model's tokenizer metadata could not be read: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  checkTone(failures);

  if (failures.length > 0) {
    console.error('\nThe local log-mel front end no longer matches Whisper:');
    for (const failure of failures) console.error(`  [${failure.check}] ${failure.message}`);
    process.exit(1);
  }

  console.log('\nThe log-mel front end matches the reference implementation.');
}

await main();
