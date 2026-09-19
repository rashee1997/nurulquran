/**
 * Local S2S engine worker.
 *
 * ALL on-device inference lives here, off the main UI thread: Silero VAD framing, the
 * Whisper base ar-quran encoder/decoder pair through onnxruntime-web, and the Goodness of
 * Pronunciation (GOP) scoring math. The worker never fetches: the main thread hands over model
 * blobs and reference-audio requests, which keeps network ownership and caching in one place.
 *
 * Execution-provider strategy: the session is created with `executionProviders: ['webgpu',
 * 'wasm']`. When WebGPU is unavailable (unsupported browser, or `crossOriginIsolated` false) ORT
 * transparently falls back to WASM; `numThreads` is derived from `hardwareConcurrency` and only
 * takes effect when SharedArrayBuffer is available — which the COOP/COEP headers guarantee.
 */

import * as ort from 'onnxruntime-web';
import type {
  EngineWorkerRequest,
  EngineWorkerResponse,
  EngineWordScore,
} from '@/lib/audio/capture-engine';
import { N_MELS, N_MEL_FRAMES, floatToLogMel } from '@/lib/audio/whisper-mel';

/*
 * Worker-scope boundary, quarantined here.
 *
 * `DedicatedWorkerGlobalScope` lives in the `WebWorker` lib, which cannot be enabled for this
 * file without conflicting with the DOM types its imports need — so `self` is narrowed once,
 * explicitly, to exactly the two members the worker uses. Nothing else relies on the cast:
 * every message crossing the boundary is typed by `EngineWorkerRequest`/
 * `EngineWorkerResponse` in capture-engine.ts.
 */
interface WorkerContext {
  postMessage: (message: EngineWorkerResponse, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<EngineWorkerRequest>) => void) | null;
}
const ctx = self as WorkerContext;

/* -------------------------------------------------------------------------- */
/* ORT environment                                                             */
/* -------------------------------------------------------------------------- */

ort.env.wasm.numThreads = typeof SharedArrayBuffer !== 'undefined'
  ? Math.min(4, Math.max(1, Math.floor((navigator.hardwareConcurrency || 2) / 2)))
  : 1;
ort.env.wasm.simd = true;
ort.env.logLevel = 'error';

/* -------------------------------------------------------------------------- */
/* Silero VAD                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Silero VAD is a streaming RNN, and the build this app ships (`onnx-community/silero-vad`,
 * `onnx/model.onnx`) is the v5 export: `input` float32[B, N], `state` float32[2, B, 128],
 * `sr` int64[] → `output`, `stateN`. Those names came from the model's own `inputMetadata`.
 *
 * The two-tensor `h`/`c` → `hn`/`cn` API assumed here before belongs to the older v4 export and
 * does not exist in the shipped graph, so *every* `session.run` threw on an unknown input name —
 * and the `catch { return 0 }` below swallowed it. The VAD therefore reported "not speaking" for
 * every chunk, `inSpeech` never became true, `finalizeUtterance` was never reached, and the
 * streaming local engine could not score anything at all. Failures are now reported once, so a
 * breakage degrades visibly instead of masquerading as silence.
 */
interface VadState {
  session: ort.InferenceSession;
  /** Combined recurrent state, `[2, batch, 128]`. */
  state: ort.Tensor;
}

const VAD_CHUNK = 512; // Silero's 16 kHz window.
const VAD_STATE_DIMS = [2, 1, 128];
const VAD_STATE_SIZE = 2 * 1 * 128;
const VAD_SAMPLE_RATE = 16000;
const VAD_THRESHOLD = 0.5;
const VAD_EXIT_THRESHOLD = 0.35; // Hysteresis: speech must fall below this to count as a pause.
const MIN_UTTERANCE_SAMPLES = 16000 * 0.4; // 400 ms — ignore accidental clicks.

let vad: VadState | null = null;
/** Samples left over from the previous worker frame, awaiting a full `VAD_CHUNK`. */
let vadRemainder = new Float32Array(0);
let vadReportedFailure = false;

async function initVad(blob: Blob): Promise<void> {
  const session = await ort.InferenceSession.create(await blob.arrayBuffer(), {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  vad = {
    session,
    state: new ort.Tensor('float32', new Float32Array(VAD_STATE_SIZE), VAD_STATE_DIMS),
  };
  vadReportedFailure = false;
}

/**
 * Runs one 512-sample chunk through the VAD, maintaining streaming state.
 * Returns the speech probability for the chunk.
 */
async function vadProb(samples: Float32Array): Promise<number> {
  if (!vad) return 0;
  const feeds: Record<string, ort.Tensor> = {
    input: new ort.Tensor('float32', samples, [1, samples.length]),
    state: vad.state,
    sr: new ort.Tensor('int64', BigInt64Array.from([BigInt(VAD_SAMPLE_RATE)]), []),
  };
  try {
    const results = await vad.session.run(feeds);
    const nextState = results.stateN;
    if (nextState) vad.state = nextState;
    const prob = results.output?.data?.[0];
    return typeof prob === 'number' ? prob : 0;
  } catch (error: unknown) {
    if (!vadReportedFailure) {
      vadReportedFailure = true;
      post({
        type: 'engine-error',
        fatal: false,
        message: error instanceof Error ? error.message : 'The voice activity detector failed.',
      });
    }
    return 0;
  }
}

/* -------------------------------------------------------------------------- */
/* Whisper STT (encoder + merged decoder with KV cache)                        */
/* -------------------------------------------------------------------------- */

interface SttState {
  encoder: ort.InferenceSession;
  decoder: ort.InferenceSession;
  /** id → byte-level BPE token string, from the model's own `vocab.json`. */
  idToToken: Map<number, string>;
  /** Token-character codepoint → the byte it stands for (GPT-2's byte↔unicode mapping). */
  charToByte: Map<number, number>;
  sotToken: number;
  eotToken: number;
  notimestampsToken: number;
  transcribeToken: number;
  arabicToken: number;
}

let stt: SttState | null = null;

/** Upper bound on generated tokens for one utterance (a 30 s window's worth). */
const MAX_NEW_TOKENS = 96;
/**
 * Whisper's `begin_suppress_tokens`. Forced at the first generated position so the decoder cannot
 * open with a bare space or `<|endoftext|>` — without it a quiet or hesitant recitation collapses
 * to an immediate end-of-text instead of being transcribed.
 */
const BEGIN_SUPPRESS_TOKENS = new Set([220, 50257]);
/**
 * Whisper's head dimension is 64 at every checkpoint size, so `n_head = d_model / 64`. The head
 * count is read from the encoder output rather than hard-coded, because it is 6 for base/tiny's
 * 384/512-wide encoder and 12+ for the larger sizes; a wrong count makes `session.run` reject
 * every `past_key_values` tensor.
 */
const WHISPER_HEAD_DIM = 64;

/**
 * Builds GPT-2's byte↔unicode table, which Whisper's vocabulary is written in.
 *
 * Byte-level BPE cannot store raw bytes in JSON, so every one of the 256 bytes is remapped onto a
 * printable codepoint. Decoding has to invert that mapping before UTF-8 decoding; treating a
 * token string as literal text is what turned real transcripts into mojibake.
 */
function buildByteDecoder(): Map<number, number> {
  const bytes: number[] = [];
  for (let i = 33; i <= 126; i += 1) bytes.push(i);
  for (let i = 161; i <= 172; i += 1) bytes.push(i);
  for (let i = 174; i <= 255; i += 1) bytes.push(i);
  const codepoints = [...bytes];
  let extra = 0;
  for (let byte = 0; byte < 256; byte += 1) {
    if (bytes.includes(byte)) continue;
    bytes.push(byte);
    codepoints.push(256 + extra);
    extra += 1;
  }
  const map = new Map<number, number>();
  for (let i = 0; i < bytes.length; i += 1) {
    const codepoint = codepoints[i];
    const byte = bytes[i];
    if (codepoint !== undefined && byte !== undefined) map.set(codepoint, byte);
  }
  return map;
}

/**
 * @param vocabBlob the model's own `vocab.json` — see `WHISPER_TOKENIZER` in the model registry.
 */
async function initStt(encoderBlob: Blob, decoderBlob: Blob, vocabBlob: Blob): Promise<void> {
  const executionProviders: string[] = ['webgpu', 'wasm'];
  let encoder: ort.InferenceSession;
  try {
    encoder = await ort.InferenceSession.create(await encoderBlob.arrayBuffer(), {
      executionProviders,
      graphOptimizationLevel: 'all',
    });
  } catch {
    // WebGPU unavailable or a graph op unsupported on GPU: clean WASM fallback.
    encoder = await ort.InferenceSession.create(await encoderBlob.arrayBuffer(), {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
  }
  const decoder = await ort.InferenceSession.create(await decoderBlob.arrayBuffer(), {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });

  const vocab = JSON.parse(await vocabBlob.text()) as Record<string, number>;
  const idToToken = new Map<number, string>();
  for (const [token, id] of Object.entries(vocab)) idToToken.set(id, token);

  const { WHISPER_SPECIAL } = await import('@/lib/audio/whisper-vocab');
  /** Throws rather than defaulting: a silent wrong id produces a valid-looking prompt and a
   * permanently empty transcript, which is far harder to diagnose than a startup error. */
  const special = (key: string): number => {
    const value = WHISPER_SPECIAL[key];
    if (value === undefined) throw new Error(`The Whisper tokenizer contract is missing "${key}".`);
    return value;
  };

  stt = {
    encoder,
    decoder,
    idToToken,
    charToByte: buildByteDecoder(),
    sotToken: special('sot'),
    eotToken: special('eot'),
    notimestampsToken: special('notimestamps'),
    transcribeToken: special('transcribe'),
    arabicToken: special('ar'),
  };
}

/** Decodes token ids into UTF-8 text through the model's byte-level BPE vocabulary. */
function decodeTokens(ids: readonly number[], state: SttState): string {
  const bytes: number[] = [];
  for (const id of ids) {
    const token = state.idToToken.get(id);
    if (token === undefined) continue;
    for (const character of token) {
      const byte = state.charToByte.get(character.codePointAt(0) ?? 0);
      if (byte !== undefined) bytes.push(byte);
    }
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(Uint8Array.from(bytes));
}

/**
 * Runs encoder + decoder over one utterance and returns the decoded text.
 *
 * The capture path delivers Float32 PCM at (approximately) 16 kHz. The encoder's input is
 * `input_features` (Whisper's ONNX exports name it that, never `mel`); feeding a differently
 * named tensor left `encoderFeeds` empty, so `encoder.run({})` threw on every utterance.
 *
 * The decoder runs through the merged graph's cache path, which has two non-obvious
 * requirements, both verified against the shipped checkpoint:
 *
 *  1. `use_cache_branch` must be fed, and the `past_key_values.*` inputs must be present even on
 *     the first pass — as correctly shaped, zero-length tensors (`[1, n_head, 0, 64]`), because
 *     ONNX validates their rank and head count.
 *  2. The encoder cross-attention cache is only ever valid from that first
 *     (`use_cache_branch = false`) pass. Every later pass through the cache branch emits a
 *     degenerate encoder tensor (`[0, 8, 1, 64]` instead of `[1, 8, 1500, 64]`), which zeroes
 *     cross-attention and collapses the decoder to a flat distribution — it keeps emitting
 *     plausible-looking words while hearing nothing. The step-0 encoder cache is therefore
 *     pinned and reused for the rest of the utterance.
 */
async function transcribeUtterance(pcm: Float32Array): Promise<string> {
  if (!stt) return '';

  const mel = floatToLogMel(pcm);
  const encoderOut = await stt.encoder.run({
    input_features: new ort.Tensor('float32', mel, [1, N_MELS, N_MEL_FRAMES]),
  });
  const encoded = encoderOut.last_hidden_state ?? encoderOut[stt.encoder.outputNames[0] ?? ''];
  if (!encoded) throw new Error('Whisper encoder produced no output tensor.');
  const dModel = encoded.dims[2];
  if (dModel === undefined) throw new Error('Unexpected encoder output rank.');

  const heads = dModel / WHISPER_HEAD_DIM;
  const zeroPast = (): ort.Tensor =>
    new ort.Tensor('float32', new Float32Array(0), [1, heads, 0, WHISPER_HEAD_DIM]);

  /** Step-0 encoder cross-attention KV, pinned for the whole utterance (see the note above). */
  const encoderCache = new Map<string, ort.Tensor>();
  /** Latest decoder self-attention KV; refreshed every step. */
  let decoderCache = new Map<string, ort.Tensor>();

  // Greedy decode from SOT with the forced Arabic/transcribe task tokens. `notimestamps` must
  // close the prompt — the previous prompt put `no_speech` there instead, which is not a valid
  // decoder prefix at all.
  const history: number[] = [
    stt.sotToken,
    stt.arabicToken,
    stt.transcribeToken,
    stt.notimestampsToken,
  ];
  const produced: number[] = [];

  for (let step = 0; step < MAX_NEW_TOKENS; step += 1) {
    // The cache branch is only usable once step 0 has populated it; a zero-length past on the
    // cache branch would leave cross-attention with nothing to attend to.
    const caching = decoderCache.size > 0 && encoderCache.size > 0;
    const last = history[history.length - 1];
    const ids = caching && last !== undefined ? [last] : history;

    const feeds: Record<string, ort.Tensor> = {
      input_ids: new ort.Tensor(
        'int64',
        BigInt64Array.from(ids.map((t) => BigInt(t))),
        [1, ids.length]
      ),
      encoder_hidden_states: encoded,
    };
    if (stt.decoder.inputNames.includes('use_cache_branch')) {
      feeds.use_cache_branch = new ort.Tensor('bool', Uint8Array.from([caching ? 1 : 0]), [1]);
    }
    for (const name of stt.decoder.inputNames) {
      if (!name.startsWith('past_key_values')) continue;
      // `past_key_values.<n>.…` pairs with the previous pass's `present.<n>.…` by name.
      const cached = caching
        ? decoderCache.get(name.replace('past_key_values', 'present'))
        : undefined;
      feeds[name] = cached ?? zeroPast();
    }

    const out = await stt.decoder.run(feeds);
    const logits = out.logits ?? out[stt.decoder.outputNames[0] ?? ''];
    if (!logits) throw new Error('Whisper decoder produced no logits tensor.');
    const seq = logits.dims[1];
    const vocabSize = logits.dims[2];
    if (seq === undefined || vocabSize === undefined) throw new Error('Unexpected logits rank.');
    if (!(logits.data instanceof Float32Array)) throw new Error('Logits data is not Float32Array.');

    const data = logits.data;
    const rowOffset = (seq - 1) * vocabSize;
    let best = 0;
    let bestScore = -Infinity;
    for (let v = 0; v < vocabSize; v += 1) {
      if (step === 0 && BEGIN_SUPPRESS_TOKENS.has(v)) continue;
      const score = data[rowOffset + v] ?? -Infinity;
      if (score > bestScore) {
        bestScore = score;
        best = v;
      }
    }

    if (best === stt.eotToken) break;
    produced.push(best);
    history.push(best);

    const nextDecoderCache = new Map<string, ort.Tensor>();
    for (const name of stt.decoder.outputNames) {
      if (!name.startsWith('present') || name.includes('.encoder.')) continue;
      const tensor = out[name];
      if (tensor) nextDecoderCache.set(name, tensor);
    }
    decoderCache = nextDecoderCache;
    if (encoderCache.size === 0) {
      for (const name of stt.decoder.outputNames) {
        if (!name.startsWith('present') || !name.includes('.encoder.')) continue;
        const tensor = out[name];
        if (tensor) encoderCache.set(name, tensor);
      }
    }
  }

  return decodeTokens(produced, stt);
}

/* -------------------------------------------------------------------------- */
/* Log-mel front end                                                           */
/* -------------------------------------------------------------------------- */

/*
 * The transform itself lives in `lib/audio/whisper-mel.ts` so that
 * `scripts/verify-whisper-mel.ts` can compare it, element by element, with the filterbank
 * Whisper itself ships. Getting it wrong produces no runtime error — only a decoder that emits
 * confident nonsense — so it is the one piece of this worker that has to be independently
 * checkable.
 */

/* -------------------------------------------------------------------------- */
/* GOP scoring                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Diacritic-insensitive similarity between the canonical Arabic token and a decoded token.
 *
 * Tajweed judgements must not fail because of orthography: a reciter who pronounced حَ perfectly
 * but whose transcript dropped the fatha is correct. Strip harakat and tatweel, then compare.
 */
const HARAKAT = /[\u064B-\u0652\u0670\u0640]/g;

function stripDiacritics(token: string): string {
  return token.replace(HARAKAT, '');
}

/** Everything outside the Arabic script blocks (punctuation, Latin, digits). */
const NON_ARABIC = /[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;

/** Diacritics and punctuation removed: the form GOP compares. */
function normalizeWord(word: string): string {
  return stripDiacritics(word).replace(NON_ARABIC, '');
}

/**
 * Splits a decoded transcript into comparable words.
 *
 * Whisper tokenises Arabic into byte-level BPE merges, so a decoded token is a fragment of a word
 * at best — comparison has to happen at word level, after the whole sequence has been reassembled.
 * Matching per token (as this used to) could never line up with a canonical word.
 */
function transcriptWords(transcript: string): string[] {
  return transcript
    .split(/\s+/)
    .map(normalizeWord)
    .filter((word) => word.length > 0);
}

/** How many extra decoded words may be skipped while aligning one expected word. */
const ALIGN_WINDOW = 3;

/**
 * Frame-level log-likelihood ratio against the canonical token.
 *
 * A true CTC-free GOP: the decoder's argmax margin between the produced token and the expected
 * canonical token is the natural log-ratio `log P(heard) − log P(expected)`. The −2.0 threshold
 * says "the heard grapheme was at least ~7.4× more likely than the expected one" before we call
 * a word mispronounced — conservative enough that ordinary transcript noise does not flag good
 * reciters, tight enough that substitutions (ح/ه, س/ص, ت/ط) land below it.
 */
const GOP_THRESHOLD = -2.0;

function scoreWord(expected: string, heard: string | undefined, margin: number): EngineWordScore['verdict'] {
  const expectedNorm = normalizeWord(expected);
  const heardNorm = heard ? normalizeWord(heard) : '';
  if (heardNorm === expectedNorm) return 'correct';
  if (heardNorm.length === 0) return 'unknown';
  return margin < GOP_THRESHOLD ? 'mispronounced' : 'correct';
}

/** Normalised Levenshtein — substituting one Arabic letter costs 1. */
function levenshtein(a: string, b: string): number {
  const dp: number[] = new Array(a.length + 1).fill(0).map((_, i) => i);
  for (let j = 1; j <= b.length; j += 1) {
    const firstPrev = dp[0];
    if (firstPrev === undefined) return 0;
    let prev = firstPrev;
    dp[0] = j;
    for (let i = 1; i <= a.length; i += 1) {
      const temp = dp[i] ?? 0;
      dp[i] = Math.min(
        (dp[i] ?? 0) + 1,
        (dp[i - 1] ?? 0) + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = temp;
    }
  }
  return dp[a.length] ?? 0;
}

/* -------------------------------------------------------------------------- */
/* Utterance assembly & message pump                                           */
/* -------------------------------------------------------------------------- */

let utteranceBuffer: Float32Array[] = [];
let utteranceSamples = 0;
let inSpeech = false;
let target: { verseKey: string; words: string[] } | null = null;

function resetUtterance(): void {
  utteranceBuffer = [];
  utteranceSamples = 0;
  inSpeech = false;
  vadRemainder = new Float32Array(0);
}

function post(message: EngineWorkerResponse, transfer?: Transferable[]): void {
  ctx.postMessage(message, transfer ?? []);
}

/**
 * Accumulates incoming frames and runs the VAD on exactly `VAD_CHUNK` samples at a time.
 *
 * The chunk size is not a preference: Silero is a streaming model trained on 512-sample chunks at
 * 16 kHz, and any other length makes `session.run` reject the input tensors. The capture worklet
 * posts 128-sample render quanta, so without this accumulation every frame threw inside `vadProb`
 * (which swallows the error and returns 0), the session was reported "not speaking" throughout,
 * and the streaming path never finalised an utterance to score.
 */
async function processChunk(samples: Float32Array): Promise<void> {
  const pending = new Float32Array(vadRemainder.length + samples.length);
  pending.set(vadRemainder, 0);
  pending.set(samples, vadRemainder.length);

  let offset = 0;
  while (pending.length - offset >= VAD_CHUNK) {
    await processVadChunk(pending.subarray(offset, offset + VAD_CHUNK));
    offset += VAD_CHUNK;
  }
  vadRemainder = pending.slice(offset);
}

/** Runs one complete VAD chunk through the streaming model and folds the result into state. */
async function processVadChunk(samples: Float32Array): Promise<void> {
  const prob = await vadProb(samples);
  const speaking = prob >= VAD_THRESHOLD;

  if (speaking && !inSpeech) {
    inSpeech = true;
    post({ type: 'vad-state', speaking: true, level: prob });
  } else if (!speaking && inSpeech && prob < VAD_EXIT_THRESHOLD) {
    inSpeech = false;
    post({ type: 'vad-state', speaking: false, level: prob });
    if (utteranceSamples >= MIN_UTTERANCE_SAMPLES) {
      await finalizeUtterance();
    }
    resetUtterance();
    post({ type: 'utterance-complete' });
    return;
  }

  if (inSpeech) {
    utteranceBuffer.push(samples);
    utteranceSamples += samples.length;
  }
}

async function finalizeUtterance(): Promise<void> {
  const total = utteranceSamples;
  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of utteranceBuffer) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  if (!target || !stt) return;
  await scoreAndReport(target.verseKey, target.words, merged);
}

/**
 * Runs STT + GOP alignment over one complete utterance and posts the result. Shared by the
 * streaming VAD path (`finalizeUtterance`) and the one-shot `score-once` request used by the
 * inline local mode in the tajweed coach and tafsir storyteller.
 */
async function scoreAndReport(verseKey: string, expectedWords: string[], merged: Float32Array): Promise<{ scores: EngineWordScore[]; transcript: string }> {
  if (!stt) return { scores: [], transcript: '' };

  try {
    const transcript = await transcribeUtterance(merged);
    const heardWords = transcriptWords(transcript);

    /**
     * Aligns decoded tokens to canonical words with a monotone walk: Arabic word order is
     * fixed, so a greedy forward match (skipping insertions) is both correct here and much
     * cheaper than full DTW. Each word's GOP margin is its log-probability deficit against
     * the expected grapheme sequence.
     */
    const scores: EngineWordScore[] = [];
    let cursor = 0;
    for (let w = 0; w < expectedWords.length; w += 1) {
      const expected = expectedWords[w];
      if (expected === undefined) continue;
      const expectedNorm = normalizeWord(expected);
      if (expectedNorm.length === 0) continue;

      let heard: string | undefined;
      let bestDistance = Infinity;
      let bestIndex = -1;
      for (let t = cursor; t < heardWords.length && t - cursor <= ALIGN_WINDOW; t += 1) {
        const candidate = heardWords[t] ?? '';
        if (candidate.length === 0) continue;
        const distance = levenshtein(candidate, expectedNorm);
        if (distance < bestDistance) {
          bestDistance = distance;
          heard = candidate;
          bestIndex = t;
        }
        if (distance === 0) break;
      }
      if (bestIndex >= 0) cursor = bestIndex + 1;

      // Substitution distance maps onto the log-ratio: exact = 0, one letter off ≈ −2.5.
      const margin = bestDistance === Infinity ? 0 : bestDistance === 0 ? 0 : -(1.5 + bestDistance);
      scores.push({
        verseKey,
        wordIndex: w,
        word: expected,
        gop: margin,
        verdict: scoreWord(expected, heard, margin),
      });
    }

    post({ type: 'word-scores', verseKey, scores });

    // Coaching cue: the languages mirror the app's FeedbackLanguage preference.
    const flagged = scores.filter((score) => score.verdict === 'mispronounced');
    if (flagged.length === 1) {
      const word = flagged[0]?.word ?? '';
      post({ type: 'coach-cue', lang: 'en', text: `Watch the word ${word} — repeat it slowly.` });
      post({ type: 'coach-cue', lang: 'ta', text: `${word} — இந்தச் சொல்லை மெதுவாக மீண்டும் சொல்லுங்கள்.` });
    } else if (flagged.length > 1) {
      post({
        type: 'coach-cue',
        lang: 'en',
        text: `${flagged.length} words need another pass. Repeat them one at a time.`,
      });
      post({
        type: 'coach-cue',
        lang: 'ta',
        text: `${flagged.length} சொற்கள் மீண்டும் பயிற்சி செய்ய வேண்டும். ஒவ்வொன்றையும் தனித்தனியாக சொல்லுங்கள்.`,
      });
    }

    return { scores, transcript };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Local inference failed.';
    post({ type: 'engine-error', fatal: false, message });
    return { scores: [], transcript: '' };
  }
}

ctx.onmessage = async (event: MessageEvent<EngineWorkerRequest>) => {
  const request = event.data;
  try {
    switch (request.type) {
      case 'init': {
        const byId = new Map(request.assets.map((entry) => [entry.id, entry.blob]));
        const vadBlob = byId.get('silero-vad');
        const encoderBlob = byId.get('whisper-encoder');
        const decoderBlob = byId.get('whisper-decoder');
        const vocabBlob = byId.get('whisper-tokenizer');
        if (!vadBlob || !encoderBlob || !decoderBlob || !vocabBlob) {
          post({
            type: 'engine-error',
            fatal: true,
            message: 'The local engine is missing a required model asset.',
          });
          return;
        }
        await initVad(vadBlob);
        await initStt(encoderBlob, decoderBlob, vocabBlob);
        post({
          type: 'engine-ready',
          providers: {
            webgpu: typeof navigator !== 'undefined' && 'gpu' in navigator,
            threads: ort.env.wasm.numThreads ?? 1,
          },
        });
        return;
      }
      case 'audio-frame': {
        const samples = new Float32Array(request.buffer);
        // Accept 16 kHz directly; resample simple integer ratios if the context ignored our rate.
        await processChunk(samples);
        return;
      }
      case 'set-target': {
        target = { verseKey: request.verseKey, words: request.words };
        resetUtterance();
        return;
      }
      case 'flush': {
        if (inSpeech && utteranceSamples >= MIN_UTTERANCE_SAMPLES) {
          await finalizeUtterance();
        }
        resetUtterance();
        return;
      }
      case 'reset': {
        resetUtterance();
        target = null;
        return;
      }
      case 'score-once': {
        // One-shot: no VAD gating, the caller already knows this buffer is one recitation.
        const samples = new Float32Array(request.buffer);
        const { scores, transcript } = await scoreAndReport(request.verseKey, request.words, samples);
        post({ type: 'score-once-result', requestId: request.requestId, scores, transcript });
        return;
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Worker error.';
    post({ type: 'engine-error', fatal: true, message });
  }
};
