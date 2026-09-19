/**
 * On-device voice worker (Piper / VITS).
 *
 * This is the half of the local voice stack that the registry used to describe but nothing could
 * run: `model-registry.ts` shipped ~123 MB of Piper voices whose blobs were downloaded, cached and
 * budgeted, while the only thing that ever spoke a coaching cue was `speechSynthesis` — which has
 * no Tamil voice on most desktops, so Tamil coaching was silent everywhere.
 *
 * Two runtimes, one pipeline:
 *
 *  1. **espeak-ng (WebAssembly)** turns text into phoneme ids. Piper voices are trained on espeak
 *     phonemes, not graphemes — Tamil text fed to the VITS graph directly would produce noise.
 *     The phonemizer is vendored at `public/piper/` (see `public/piper/NOTICE.md`).
 *  2. **VITS through onnxruntime-web** turns ids into 16/22.05 kHz mono Float32 PCM, which the
 *     main thread wraps in a WAV and plays.
 *
 * Contract notes, all verified against the shipped artifacts before this was written:
 *
 *  - The emscripten build is a *classic* script (it assigns `createPiperPhonemize` as a top-level
 *    `var` and exports nothing), so it cannot be imported as-is from a module worker. One export
 *    statement is appended and the result is imported as a blob module — no `eval`, and no
 *    bundler-specific handling of emscripten output.
 *  - One phonemizer instance serves every call: `callMain` runs the piper CLI repeatedly without
 *    aborting (~7–20 ms per sentence).
 *  - Phonemization is therefore **serialized**. The instance reports its result through a single
 *    `print` callback, so two overlapping calls would deliver each other's ids. The queue below is
 *    what keeps a Tamil cue from being synthesized with an English sentence's phonemes.
 *  - stderr is captured but never treated as failure: piper's CLI writes routine warnings there,
 *    so the failure signal is "no phoneme ids came back", reported with the last stderr line.
 *  - Every id is checked against the voice config's own `phoneme_id_map` before inference. An id
 *    outside that table is a voice/config mismatch, and ORT would either throw or return audio
 *    that is not speech; failing loudly here keeps a mangled cue from reaching a learner.
 *
 * The worker never fetches voice models: like `engine.worker.ts`, it is handed blobs and configs
 * by the main thread, which keeps caching and network ownership in one place.
 */

import * as ort from 'onnxruntime-web';
import type { TtsWorkerRequest, TtsWorkerResponse } from '@/lib/audio/local-voice';

/*
 * Worker-scope boundary, narrowed once — same pattern as engine.worker.ts, which imports these
 * types from a DOM-lib module and so cannot enable the `WebWorker` lib itself.
 */
interface WorkerContext {
  postMessage: (message: TtsWorkerResponse, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<TtsWorkerRequest>) => void) | null;
}
const ctx = self as unknown as WorkerContext;

ort.env.wasm.numThreads = typeof SharedArrayBuffer !== 'undefined'
  ? Math.min(4, Math.max(1, Math.floor((navigator.hardwareConcurrency || 2) / 2)))
  : 1;
ort.env.wasm.simd = true;
ort.env.logLevel = 'error';

/* -------------------------------------------------------------------------- */
/* Phonemizer (espeak-ng via WebAssembly)                                      */
/* -------------------------------------------------------------------------- */

const PHONEMIZER_SCRIPT_URL = '/piper/piper_phonemize.js';
const PHONEMIZER_ASSET_BASE = '/piper/piper_phonemize';
/** Mount point the vendored espeak-ng data tree is unpacked at inside the module's FS. */
const ESPEAK_DATA_DIR = '/espeak-ng-data';

interface PhonemizerModule {
  callMain(args: string[]): void;
}

interface PhonemizerOptions {
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  locateFile?: (path: string) => string;
}

type PhonemizerFactory = (options?: PhonemizerOptions) => Promise<PhonemizerModule>;

interface Collector {
  sentences: number[][];
  stderr: string[];
}

/** Set only for the duration of one `callMain`, so concurrent work can never collect ours. */
let collector: Collector | null = null;
let phonemizerFactory: PhonemizerFactory | null = null;
let phonemizer: PhonemizerModule | null = null;
/** Serialises `callMain`; see the header note on the single shared `print` callback. */
let phonemizeQueue: Promise<unknown> = Promise.resolve();

async function loadPhonemizerFactory(): Promise<PhonemizerFactory> {
  if (phonemizerFactory) return phonemizerFactory;

  const response = await fetch(PHONEMIZER_SCRIPT_URL);
  if (!response.ok) {
    throw new Error(`The on-device phonemizer could not be loaded (HTTP ${response.status}).`);
  }
  const source = await response.text();
  const moduleUrl = URL.createObjectURL(
    new Blob([`${source}\nexport default createPiperPhonemize;\n`], { type: 'text/javascript' })
  );

  try {
    const loaded = (await import(/* webpackIgnore: true */ moduleUrl)) as {
      default?: PhonemizerFactory;
    };
    if (typeof loaded.default !== 'function') {
      throw new Error('The on-device phonemizer build exposed no factory.');
    }
    phonemizerFactory = loaded.default;
    return phonemizerFactory;
  } finally {
    // The module is evaluated and its assets resolve by absolute URL, so the blob can be released.
    URL.revokeObjectURL(moduleUrl);
  }
}

async function ensurePhonemizer(): Promise<PhonemizerModule> {
  if (phonemizer) return phonemizer;
  const factory = await loadPhonemizerFactory();
  phonemizer = await factory({
    print: (line) => {
      const target = collector;
      if (!target) return;
      try {
        const parsed = JSON.parse(line) as { phoneme_ids?: unknown };
        if (Array.isArray(parsed.phoneme_ids)) {
          target.sentences.push(parsed.phoneme_ids as number[]);
        }
      } catch {
        // piper interleaves non-JSON status lines with its JSON result.
      }
    },
    printErr: (line) => {
      collector?.stderr.push(line.trim());
    },
    locateFile: (path) =>
      path.endsWith('.wasm')
        ? `${PHONEMIZER_ASSET_BASE}.wasm`
        : path.endsWith('.data')
          ? `${PHONEMIZER_ASSET_BASE}.data`
          : path,
  });
  return phonemizer;
}

/**
 * Phonemizes one utterance, one sentence at a time, in piper's own JSON protocol.
 *
 * Returns the per-sentence id sequences so each can be synthesized separately: VITS handles a
 * short sequence far better than one long concatenation, and piper's own CLI splits by sentence
 * for the same reason.
 */
function phonemize(text: string, espeakVoice: string): Promise<number[][]> {
  const run = phonemizeQueue.then(async () => {
    const phonemizerModule = await ensurePhonemizer();
    const target: Collector = { sentences: [], stderr: [] };
    if (collector) {
      throw new Error('A phonemization call overlapped another.');
    }
    collector = target;
    try {
      phonemizerModule.callMain([
        '-l',
        espeakVoice,
        '--input',
        JSON.stringify([{ text }]),
        '--espeak_data',
        ESPEAK_DATA_DIR,
      ]);
    } finally {
      collector = null;
    }

    const sentences = target.sentences.filter((ids) => ids.length > 0);
    if (sentences.length === 0) {
      const detail = target.stderr[target.stderr.length - 1];
      throw new Error(
        `The on-device voice could not read this text${detail ? ` (${detail})` : ''}.`
      );
    }
    return sentences;
  });

  // Keep the chain alive after a failure so one bad cue cannot wedge every later one.
  phonemizeQueue = run.catch(() => undefined);
  return run;
}

/* -------------------------------------------------------------------------- */
/* VITS voice                                                                  */
/* -------------------------------------------------------------------------- */

interface VoiceConfig {
  audio: { sample_rate: number };
  espeak?: { voice?: string };
  inference: { noise_scale: number; length_scale: number; noise_w: number };
  phoneme_id_map: Record<string, number[]>;
  speaker_id_map?: Record<string, number>;
  default_speaker_id?: number;
}

interface VoiceState {
  session: ort.InferenceSession;
  config: VoiceConfig;
  sampleRate: number;
  scales: Float32Array;
  /** Every id the model's own table defines; ids outside it are a voice/config mismatch. */
  validIds: Set<number>;
  speakerIds: number[];
  speakerId: number;
}

let voice: VoiceState | null = null;

function readVoiceConfig(raw: string): VoiceConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('The voice config is not valid JSON.');
  }
  const config = parsed as Partial<VoiceConfig>;
  const sampleRate = config.audio?.sample_rate;
  const inference = config.inference;
  if (typeof sampleRate !== 'number' || sampleRate <= 0) {
    throw new Error('The voice config declares no sample rate.');
  }
  if (!inference || typeof inference.noise_scale !== 'number' || typeof inference.length_scale !== 'number' || typeof inference.noise_w !== 'number') {
    throw new Error('The voice config declares no VITS scales.');
  }
  return {
    audio: { sample_rate: sampleRate },
    espeak: config.espeak,
    inference,
    phoneme_id_map: config.phoneme_id_map ?? {},
    speaker_id_map: config.speaker_id_map ?? {},
    default_speaker_id: config.default_speaker_id,
  };
}

async function initVoice(model: ArrayBuffer, rawConfig: string): Promise<void> {
  const config = readVoiceConfig(rawConfig);
  const session = await ort.InferenceSession.create(model, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });

  const validIds = new Set<number>();
  for (const ids of Object.values(config.phoneme_id_map)) {
    for (const id of ids) validIds.add(id);
  }
  if (validIds.size === 0) {
    throw new Error('The voice config declares no phoneme ids.');
  }

  const speakerIds = Object.values(config.speaker_id_map ?? {});
  voice = {
    session,
    config,
    sampleRate: config.audio.sample_rate,
    scales: Float32Array.from([
      config.inference.noise_scale,
      config.inference.length_scale,
      config.inference.noise_w,
    ]),
    validIds,
    speakerIds,
    speakerId: config.default_speaker_id ?? speakerIds[0] ?? 0,
  };
}

/** A short pause between sentences, so a multi-sentence cue does not run together. */
const SENTENCE_GAP_SECONDS = 0.18;

/**
 * Concatenates per-sentence audio with a short pause between sentences.
 *
 * Always returns a fresh buffer, even for a single sentence. The per-sentence chunks are the
 * tensors onnxruntime-web hands back, and the caller transfers this buffer to the main thread —
 * transferring a tensor's own buffer would detach storage the runtime may reuse for the next run.
 */
function joinWithSilence(chunks: readonly Float32Array[], sampleRate: number): Float32Array {
  const gap = chunks.length > 1 ? Math.round(sampleRate * SENTENCE_GAP_SECONDS) : 0;
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0) + gap * (chunks.length - 1);
  const joined = new Float32Array(total);
  let offset = 0;
  chunks.forEach((chunk, index) => {
    if (index > 0) offset += gap;
    joined.set(chunk, offset);
    offset += chunk.length;
  });
  return joined;
}

interface Synthesis {
  samples: Float32Array;
  sampleRate: number;
  sentenceCount: number;
}

async function synthesize(text: string): Promise<Synthesis> {
  const state = voice;
  if (!state) throw new Error('The on-device voice is not loaded yet.');

  const espeakVoice = state.config.espeak?.voice;
  if (!espeakVoice) throw new Error('The voice config declares no espeak voice.');

  const sentences = await phonemize(text, espeakVoice);

  const chunks: Float32Array[] = [];
  for (const ids of sentences) {
    const foreign = ids.find((id) => !state.validIds.has(id));
    if (foreign !== undefined) {
      throw new Error(
        `The voice does not recognize phoneme ${foreign}; its config and the phonemizer disagree.`
      );
    }

    const feeds: Record<string, ort.Tensor> = {
      input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)])),
      scales: new ort.Tensor('float32', state.scales),
    };
    // Single-speaker voices omit `sid` entirely; feeding it to a graph that has no such input is
    // an error, so it is added only when the config actually lists speakers.
    if (state.speakerIds.length > 0) {
      feeds.sid = new ort.Tensor('int64', BigInt64Array.from([BigInt(state.speakerId)]));
    }

    const results = await state.session.run(feeds);
    const outputName = state.session.outputNames[0];
    const audio = outputName ? (results[outputName]?.data as Float32Array | undefined) : undefined;
    if (!audio || audio.length === 0) {
      throw new Error('The on-device voice produced no audio.');
    }
    chunks.push(audio);
  }

  return {
    samples: joinWithSilence(chunks, state.sampleRate),
    sampleRate: state.sampleRate,
    sentenceCount: sentences.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Message loop                                                                */
/* -------------------------------------------------------------------------- */

async function handle(request: TtsWorkerRequest): Promise<void> {
  if (request.type === 'init') {
    try {
      await initVoice(request.model, request.config);
      ctx.postMessage({ type: 'ready', voiceKey: request.voiceKey });
    } catch (error: unknown) {
      ctx.postMessage({
        type: 'error',
        requestId: null,
        fatal: true,
        message: error instanceof Error ? error.message : 'The on-device voice failed to load.',
      });
    }
    return;
  }

  try {
    const result = await synthesize(request.text);
    // The PCM buffer is transferred, not copied: a cue is up to a few hundred kilobytes.
    ctx.postMessage(
      {
        type: 'result',
        requestId: request.requestId,
        samples: result.samples,
        sampleRate: result.sampleRate,
        sentenceCount: result.sentenceCount,
      },
      [result.samples.buffer as ArrayBuffer]
    );
  } catch (error: unknown) {
    ctx.postMessage({
      type: 'error',
      requestId: request.requestId,
      fatal: false,
      message: error instanceof Error ? error.message : 'The on-device voice failed.',
    });
  }
}

ctx.onmessage = (event: MessageEvent<TtsWorkerRequest>) => {
  void handle(event.data);
};
