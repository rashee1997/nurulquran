/**
 * Piper voice contract check.
 *
 * `lib/audio/tts.worker.ts` joins two artifacts that were built independently — an espeak-ng
 * WebAssembly phonemizer and a VITS voice exported by someone else — and joins them by *convention*
 * rather than by type. When the convention breaks, nothing throws: the ids are still integers, the
 * graph still runs, and the learner hears confident noise instead of the cue. There is no exception
 * to catch, so this file is the check.
 *
 * It pins the three things the join depends on:
 *
 *  1. **The vendored phonemizer is the artifact it claims to be** — byte length and SHA-256 of all
 *     three files in `public/piper/`, against the values recorded in `public/piper/NOTICE.md`.
 *  2. **Every id the phonemizer emits exists in the voice's own `phoneme_id_map`.** This is the
 *     contract that silently rots: the phonemizer emits ids from a table fixed at its build time,
 *     and each voice carries its own table. The shipped English alternate is a Piper 0.2.0 voice
 *     with 130 symbols against the modern table's 256, so "same ids everywhere" is exactly the
 *     assumption that needs checking rather than assuming.
 *  3. **Each voice is asked to phonemize in its own language** — the config's espeak voice agrees
 *     with the `language` the registry tags it with. Reading Tamil text with `en-us` produces
 *     English phonemes for Tamil letters, which is garbage the model will happily voice.
 *
 * Nothing here is compared against a stored expectation of our own output, which would only prove
 * the code agrees with itself: the tables come from the published voice configs, live.
 *
 * Set `PIPER_E2E=1` to additionally download a voice (~63 MB) and synthesize a phrase through
 * onnxruntime-web, printing duration and real-time factor and writing a WAV to the temp directory.
 * That is the version that proves the audio is real; it is opt-in because it is a 63 MB download.
 *
 * Usage: `bun scripts/verify-piper-tts.ts` — prints a report and exits non-zero on any failure.
 * Needs network access.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  MODEL_VARIANTS,
  variantVoiceAssets,
  type CoachModelVariant,
  type ModelAsset,
} from '@/lib/audio/model-registry';

const PIPER_DIR = join(process.cwd(), 'public', 'piper');
const PHONEMIZER_BASE = join(PIPER_DIR, 'piper_phonemize');

/** Mirror of `public/piper/NOTICE.md`; a mismatch means the vendored runtime was swapped. */
const VENDORED = [
  { file: 'piper_phonemize.js', bytes: 120_714, sha256: 'fef0c2fc442d24fdef5c7c7cc37d5da2314407640fe11ab1bfe347c723dff19b' },
  { file: 'piper_phonemize.wasm', bytes: 635_212, sha256: 'b777cd107a91d2bcc6a1ea46f2c26a662a7407394fe84589198aeaa83dd7a9d6' },
  { file: 'piper_phonemize.data', bytes: 18_077_249, sha256: '29f1025eb23a5b5c192cd14a6efbce4509402ff265405072ee6f7d1a09b78f8c' },
] as const;

const SAMPLES: Record<'ta' | 'en', string> = {
  ta: 'வணக்கம். மெதுவாகவும் தெளிவாகவும் ஓதுங்கள்.',
  en: 'Recite slowly and clearly, and watch the letter qaf.',
};

interface Finding {
  check: string;
  message: string;
}

interface PhonemizerModule {
  callMain(args: string[]): void;
}

type PhonemizerFactory = (options?: {
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  locateFile?: (path: string) => string;
}) => Promise<PhonemizerModule>;

interface VoiceConfig {
  audio?: { sample_rate?: number };
  espeak?: { voice?: string };
  inference?: { noise_scale?: number; length_scale?: number; noise_w?: number };
  num_symbols?: number;
  phoneme_id_map?: Record<string, number[]>;
  speaker_id_map?: Record<string, number>;
}

/* ------------------------------ phonemizer ------------------------------ */

let phonemizer: PhonemizerModule | null = null;
let collected: number[][] | null = null;

async function loadPhonemizer(): Promise<PhonemizerModule> {
  if (phonemizer) return phonemizer;
  const glue = `${PHONEMIZER_BASE}.js`;
  if (!existsSync(glue)) {
    throw new Error(`${glue} is missing — the phonemizer is not vendored.`);
  }
  const loaded = (await import(pathToFileURL(glue).href)) as { default?: PhonemizerFactory };
  if (typeof loaded.default !== 'function') {
    throw new Error('The vendored phonemizer exposed no factory.');
  }
  phonemizer = await loaded.default({
    print: (line) => {
      try {
        const parsed = JSON.parse(line) as { phoneme_ids?: unknown };
        if (Array.isArray(parsed.phoneme_ids)) collected?.push(parsed.phoneme_ids as number[]);
      } catch {
        // piper interleaves non-JSON status lines with its JSON result.
      }
    },
    locateFile: (path) =>
      path.endsWith('.wasm')
        ? `${PHONEMIZER_BASE}.wasm`
        : path.endsWith('.data')
          ? `${PHONEMIZER_BASE}.data`
          : path,
  });
  return phonemizer;
}

async function phonemize(text: string, espeakVoice: string): Promise<number[]> {
  const phonemizerModule = await loadPhonemizer();
  collected = [];
  try {
    phonemizerModule.callMain([
      '-l',
      espeakVoice,
      '--input',
      JSON.stringify([{ text }]),
      '--espeak_data',
      '/espeak-ng-data',
    ]);
    return collected.flat();
  } finally {
    collected = null;
  }
}

/* -------------------------------- checks -------------------------------- */

function checkVendored(failures: Finding[]): void {
  const problems: string[] = [];
  for (const entry of VENDORED) {
    const path = join(PIPER_DIR, entry.file);
    if (!existsSync(path)) {
      problems.push(`${entry.file} is missing`);
      continue;
    }
    const bytes = readFileSync(path);
    if (bytes.byteLength !== entry.bytes) {
      problems.push(`${entry.file} is ${bytes.byteLength} B, expected ${entry.bytes}`);
      continue;
    }
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== entry.sha256) {
      problems.push(`${entry.file} hashes to ${digest.slice(0, 16)}…, expected ${entry.sha256.slice(0, 16)}…`);
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) failures.push({ check: 'vendored runtime', message: problem });
    return;
  }
  const total = VENDORED.reduce((sum, entry) => sum + entry.bytes, 0);
  console.log(
    `  runtime     ✓ ${VENDORED.length} vendored files match NOTICE.md ` +
      `(${(total / 1048576).toFixed(1)} MB, sha256 verified)`
  );
}

async function fetchConfig(asset: ModelAsset): Promise<VoiceConfig> {
  const response = await fetch(asset.url);
  if (!response.ok) throw new Error(`${asset.label} config returned HTTP ${response.status}.`);
  return (await response.json()) as VoiceConfig;
}

/**
 * Every voice a variant ships, deduplicated — two Tamil voices live in different repositories and
 * a variant reuses the same English voice as another, so comparing configs is cheap (≈5 KB each).
 */
function voiceConfigs(): Array<{ variantId: CoachModelVariant; language: 'ta' | 'en'; asset: ModelAsset }> {
  const seen = new Map<string, { variantId: CoachModelVariant; language: 'ta' | 'en'; asset: ModelAsset }>();
  for (const variant of Object.values(MODEL_VARIANTS)) {
    for (const language of ['ta', 'en'] as const) {
      const assets = variantVoiceAssets(variant, language);
      if (!assets) {
        throw new Error(`${variant.label} ships no ${language} voice.`);
      }
      if (!seen.has(assets.config.id)) {
        seen.set(assets.config.id, { variantId: variant.id, language, asset: assets.config });
      }
    }
  }
  return [...seen.values()];
}

async function checkVoices(failures: Finding[]): Promise<void> {
  for (const { variantId, language, asset } of voiceConfigs()) {
    let config: VoiceConfig;
    try {
      config = await fetchConfig(asset);
    } catch (error: unknown) {
      failures.push({
        check: 'voice configs',
        message: `${asset.id}: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    const espeakVoice = config.espeak?.voice;
    const sampleRate = config.audio?.sample_rate;
    const inference = config.inference;
    const table = config.phoneme_id_map ?? {};
    const problems: string[] = [];

    const wantedEspeak = language === 'ta' ? 'ta' : 'en-us';
    if (espeakVoice !== wantedEspeak) {
      problems.push(`phonemizes with "${espeakVoice ?? 'nothing'}", expected "${wantedEspeak}"`);
    }
    if (typeof sampleRate !== 'number' || sampleRate <= 0) {
      problems.push('declares no sample rate');
    }
    if (
      !inference ||
      typeof inference.noise_scale !== 'number' ||
      typeof inference.length_scale !== 'number' ||
      typeof inference.noise_w !== 'number'
    ) {
      problems.push('declares no VITS scales');
    }

    const ids = await phonemize(SAMPLES[language], wantedEspeak);
    if (ids.length === 0) problems.push('the phonemizer produced no ids for this language');

    const tableIds = new Set(Object.values(table).flat());
    const unknown = [...new Set(ids.filter((id) => !tableIds.has(id)))];
    if (unknown.length > 0) {
      problems.push(
        `${unknown.length} emitted id(s) are absent from its phoneme_id_map: ${unknown.slice(0, 8).join(',')}`
      );
    }
    const highest = ids.length > 0 ? Math.max(...ids) : -1;
    if (typeof config.num_symbols === 'number' && highest >= config.num_symbols) {
      problems.push(`id ${highest} exceeds num_symbols ${config.num_symbols}`);
    }

    if (problems.length > 0) {
      for (const problem of problems) {
        failures.push({ check: 'voice configs', message: `${asset.id} (${variantId}): ${problem}` });
      }
      continue;
    }
    console.log(
      `  voice       ✓ ${asset.id.padEnd(30)} ${language} espeak=${wantedEspeak} ` +
        `${sampleRate} Hz, ${ids.length} ids ⊂ ${tableIds.size}-id table`
    );
  }
}

/* ------------------------------- optional e2e ------------------------------- */

function writeWav(path: string, samples: Float32Array, sampleRate: number): void {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  writeFileSync(path, buffer);
}

async function checkEndToEnd(failures: Finding[]): Promise<void> {
  const variant = MODEL_VARIANTS['balanced'];
  const assets = variantVoiceAssets(variant, 'ta');
  if (!assets) {
    failures.push({ check: 'end to end', message: 'The balanced variant has no Tamil voice.' });
    return;
  }

  const config = await fetchConfig(assets.config);
  const sampleRate = config.audio?.sample_rate ?? 0;
  const espeakVoice = config.espeak?.voice ?? 'ta';

  const response = await fetch(assets.model.url);
  if (!response.ok) throw new Error(`${assets.model.label} returned HTTP ${response.status}.`);
  const model = Buffer.from(await response.arrayBuffer());
  if (model.byteLength !== assets.model.bytes) {
    failures.push({
      check: 'end to end',
      message: `${assets.model.id} is ${model.byteLength} B on the CDN, registry says ${assets.model.bytes}.`,
    });
    return;
  }

  const ids = await phonemize(SAMPLES.ta, espeakVoice);
  const ort = await import('onnxruntime-web');
  const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });

  const [noiseScale, lengthScale, noiseW] = [
    config.inference?.noise_scale ?? 0.667,
    config.inference?.length_scale ?? 1,
    config.inference?.noise_w ?? 0.8,
  ];
  const feeds = {
    input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)])),
    scales: new ort.Tensor('float32', Float32Array.from([noiseScale, lengthScale, noiseW])),
  };

  const started = Date.now();
  const results = await session.run(feeds);
  const elapsed = Date.now() - started;
  const output = session.outputNames[0];
  const samples = output ? (results[output]?.data as Float32Array | undefined) : undefined;
  if (!samples || samples.length === 0) {
    failures.push({ check: 'end to end', message: 'The voice produced no audio.' });
    return;
  }

  let energy = 0;
  for (const value of samples) energy += value * value;
  const rms = Math.sqrt(energy / samples.length);
  if (rms < 0.001) {
    failures.push({ check: 'end to end', message: `The voice produced near-silence (rms ${rms}).` });
    return;
  }

  const path = join(tmpdir(), `piper-${assets.model.id}.wav`);
  writeWav(path, samples, sampleRate);
  const seconds = samples.length / sampleRate;
  console.log(
    `  end to end  ✓ ${(samples.length / 1024).toFixed(0)} KiB of audio, ${seconds.toFixed(2)} s @ ${sampleRate} Hz, ` +
      `rms ${rms.toFixed(3)}, synthesized in ${elapsed} ms (rtf ${(elapsed / 1000 / seconds).toFixed(2)}) → ${path}`
  );
}

/* --------------------------------- driver --------------------------------- */

async function main(): Promise<void> {
  console.log('Checking the on-device Piper voice contract…');
  const failures: Finding[] = [];

  checkVendored(failures);

  if (failures.length === 0) {
    try {
      await checkVoices(failures);
    } catch (error: unknown) {
      failures.push({
        check: 'voice configs',
        message: `The phonemizer could not run: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  if (process.env.PIPER_E2E === '1' && failures.length === 0) {
    try {
      await checkEndToEnd(failures);
    } catch (error: unknown) {
      failures.push({
        check: 'end to end',
        message: `Synthesis failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  if (failures.length > 0) {
    console.error('\nThe on-device voice no longer matches the models it runs:');
    for (const failure of failures) console.error(`  [${failure.check}] ${failure.message}`);
    process.exit(1);
  }

  console.log(
    '\nEvery shipped voice is phraseable by the vendored phonemizer.'
  );
  if (process.env.PIPER_E2E !== '1') {
    console.log('Set PIPER_E2E=1 to also download a voice and synthesize a phrase.');
  }
}

await main();
