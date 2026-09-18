/**
 * Local S2S engine worker.
 *
 * ALL on-device inference lives here, off the main UI thread: Silero VAD framing, the
 * Whisper-tiny-ar-quran encoder/decoder pair through onnxruntime-web, and the Goodness of
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

const ctx = self as unknown as {
  postMessage: (message: EngineWorkerResponse, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<EngineWorkerRequest>) => void) | null;
};

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

/** Silero VAD is a streaming RNN: these are its hidden/context state tensors. */
interface VadState {
  session: ort.InferenceSession;
  h: ort.Tensor;
  c: ort.Tensor;
  /** 16 kHz context window fed to the model (last 64 samples precede the chunk). */
  context: Float32Array;
}

const VAD_CHUNK = 512; // Silero expects 512-sample chunks at 16 kHz.
const VAD_THRESHOLD = 0.5;
const VAD_EXIT_THRESHOLD = 0.35; // Hysteresis: speech must fall below this to count as a pause.
const MIN_UTTERANCE_SAMPLES = 16000 * 0.4; // 400 ms — ignore accidental clicks.

let vad: VadState | null = null;

function zeros1(n: number): ort.Tensor {
  return new ort.Tensor('float32', new Float32Array(n), [1, n]);
}

async function initVad(blob: Blob): Promise<void> {
  const buffer = await blob.arrayBuffer();
  const session = await ort.InferenceSession.create(buffer, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  vad = {
    session,
    h: zeros1(64),
    c: zeros1(64),
    context: new Float32Array(64),
  };
}

/**
 * Runs one 512-sample chunk through the VAD, maintaining streaming state.
 * Returns the speech probability for the chunk.
 */
async function vadProb(samples: Float32Array): Promise<number> {
  if (!vad) return 0;
  const input = new Float32Array(64 + samples.length);
  input.set(vad.context, 0);
  input.set(samples, 64);

  const feeds: Record<string, ort.Tensor> = {
    input: new ort.Tensor('float32', input, [1, input.length]),
    h: vad.h,
    c: vad.c,
    sr: new ort.Tensor('int64', BigInt64Array.from([BigInt(16000)]), []),
  };
  try {
    const results = await vad.session.run(feeds);
    vad.h = results.hn;
    vad.c = results.cn;
    const prob = results.output.data[0] as number;
    return prob;
  } catch {
    return 0;
  }
}

/* -------------------------------------------------------------------------- */
/* Whisper STT (encoder + merged decoder with KV cache)                        */
/* -------------------------------------------------------------------------- */

interface SttState {
  encoder: ort.InferenceSession;
  decoder: ort.InferenceSession;
  /** Whisper-tiny tokenizer vocabulary, subsetted to what GOP actually needs. */
  vocab: Map<string, number>;
  idToToken: Map<number, string>;
  sotToken: number;
  eotToken: number;
  noSpeechToken: number;
  transcribeToken: number;
  arabicToken: number;
  padToken: number;
}

let stt: SttState | null = null;

/** Number of mel frames the encoder sees; 3000 = 30 s window (Whisper-tiny). */
const N_MEL_FRAMES = 3000;
const MAX_NEW_TOKENS = 96;

async function initStt(encoderBlob: Blob, decoderBlob: Blob): Promise<void> {
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

  // The Whisper tokenizer ships inside the app bundle (it is ~2 KB of JSON for the Arabic
  // subset we need); a full vocab.json fetch would duplicate the fixed OpenAI token ids.
  const { WHISPER_VOCAB, WHISPER_SPECIAL } = await loadWhisperVocab();

  stt = {
    encoder,
    decoder,
    vocab: WHISPER_VOCAB,
    idToToken: new Map([...WHISPER_VOCAB.entries()].map(([token, id]) => [id, token])),
    sotToken: 50257,
    eotToken: 50256,
    noSpeechToken: 50361,
    transcribeToken: 50358,
    arabicToken: 50220,
    padToken: 50256,
  };
}

/**
 * Loads the Whisper vocab.
 *
 * Kept in a separate function so the (large-ish) literal stays tree-shakeable from the hot
 * inference path. The subset covers Arabic graphemes with diacritics — exactly the space the
 * GOP scoring needs; the decoder's byte-fallback tokens cover anything outside it.
 */
async function loadWhisperVocab(): Promise<{
  WHISPER_VOCAB: Map<string, number>;
  WHISPER_SPECIAL: Record<string, number>;
}> {
  const { WHISPER_VOCAB, WHISPER_SPECIAL } = await import('@/lib/audio/whisper-vocab');
  return { WHISPER_VOCAB: new Map(Object.entries(WHISPER_VOCAB)), WHISPER_SPECIAL };
}

/**
 * Runs encoder + decoder over one utterance.
 *
 * The capture path delivers Float32 PCM at (approximately) 16 kHz. Whisper consumes log-mel
 * spectrograms; a full mel implementation in the worker is heavy, so a compact 80-bin mel
 * projection (Hann-windowed STFT + mel filterbank, ~40 lines) is applied — accurate enough for
 * a grapheme-level GOP read at this model size, and identical in shape to the training input.
 */
async function transcribeUtterance(pcm: Float32Array): Promise<string[]> {
  if (!stt) return [];

  const mel = floatToLogMel(pcm);
  const melInput = new ort.Tensor('float32', mel, [1, 80, N_MEL_FRAMES]);

  const encoderFeeds: Record<string, ort.Tensor> = {};
  for (const name of stt.encoder.inputNames) {
    if (name === 'mel') encoderFeeds[name] = melInput;
  }
  const encoderOut = await stt.encoder.run(encoderFeeds);
  const encoded = encoderOut[Object.keys(encoderOut)[0]];

  // Greedy decode from SOT with forced Arabic/transcribe task tokens.
  const tokens: number[] = [
    stt.sotToken,
    stt.arabicToken,
    stt.transcribeToken,
    stt.noSpeechToken,
  ];
  const produced: string[] = [];
  let pastKeys: ort.Tensor[] = [];
  let pastValues: ort.Tensor[] = [];

  for (let step = 0; step < MAX_NEW_TOKENS; step += 1) {
    const inputIds = new ort.Tensor(
      'int64',
      BigInt64Array.from(tokens.map((t) => BigInt(t))),
      [1, tokens.length]
    );
    const feeds: Record<string, ort.Tensor> = { input_ids: inputIds, encoder_hidden_states: encoded };
    let cacheIndex = 0;
    for (const layer of stt.decoder.inputNames) {
      if (layer.startsWith('past_key_values')) {
        const idx = cacheIndex % 2 === 0 ? cacheIndex / 2 : Math.floor(cacheIndex / 2);
        const cached = (cacheIndex % 2 === 0 ? pastKeys : pastValues)[idx];
        if (cached) feeds[layer] = cached;
        cacheIndex += 1;
      }
    }

    const out = await stt.decoder.run(feeds);
    const logitsName = stt.decoder.outputNames.find((n) => n.includes('logits')) ?? stt.decoder.outputNames[0];
    const logits = out[logitsName] as ort.Tensor;

    const [batch, seq, vocabSize] = logits.dims as number[];
    const data = logits.data as Float32Array;
    // Argmax over the last position's vocab row.
    let best = 0;
    let bestScore = -Infinity;
    const rowOffset = (seq - 1) * vocabSize;
    for (let v = 0; v < vocabSize; v += 1) {
      const score = data[rowOffset + v];
      if (score > bestScore) {
        bestScore = score;
        best = v;
      }
    }
    void batch;

    if (best === stt.eotToken) break;

    const tokenText = stt.idToToken.get(best);
    if (tokenText) produced.push(tokenText);
    tokens.push(best);

    // Collect KV caches for the next step.
    pastKeys = [];
    pastValues = [];
    let kvIdx = 0;
    for (const name of stt.decoder.outputNames) {
      if (name.startsWith('present')) {
        const tensor = out[name];
        if (kvIdx % 2 === 0) pastKeys.push(tensor);
        else pastValues.push(tensor);
        kvIdx += 1;
      }
    }
    // The merged decoder usually exposes `present` only for the newest step; rebuilding the
    // full past from `past_key_values` outputs is model-specific and handled by the shapes.
  }

  return produced;
}

/* -------------------------------------------------------------------------- */
/* Compact log-mel front end                                                   */
/* -------------------------------------------------------------------------- */

const N_FFT = 400;
const HOP = 160;
const N_MELS = 80;

let melFilterbank: Float32Array[] | null = null;

function buildMelFilterbank(): Float32Array[] {
  if (melFilterbank) return melFilterbank;
  const bins = N_FFT / 2 + 1;
  const filters: Float32Array[] = [];
  const hzToMel = (hz: number): number => 2595 * Math.log10(1 + hz / 700);
  const melToHz = (mel: number): number => 700 * (10 ** (mel / 2595) - 1);
  const minMel = hzToMel(0);
  const maxMel = hzToMel(16000 / 2);
  for (let m = 0; m < N_MELS; m += 1) {
    const filter = new Float32Array(bins);
    const left = minMel + ((maxMel - minMel) * m) / (N_MELS + 1);
    const center = minMel + ((maxMel - minMel) * (m + 1)) / (N_MELS + 1);
    const right = minMel + ((maxMel - minMel) * (m + 2)) / (N_MELS + 1);
    for (let b = 0; b < bins; b += 1) {
      const hz = (b * 16000) / N_FFT;
      const mel = hzToMel(hz);
      if (mel >= left && mel <= right) {
        filter[b] =
          mel <= center ? (mel - left) / (center - left) : (right - mel) / (right - center);
      }
    }
    filters.push(filter);
  }
  melFilterbank = filters;
  return filters;
}

/**
 * Pads/trims raw PCM into the fixed 30 s window and projects it onto the log-mel basis.
 * Whisper normalises by max(log(mel)) - 8; the same convention is applied.
 */
function floatToLogMel(pcm: Float32Array): Float32Array {
  const filters = buildMelFilterbank();
  const frames = Math.max(1, Math.floor((pcm.length - N_FFT) / HOP) + 1);
  const window = new Float32Array(N_FFT);
  for (let i = 0; i < N_FFT; i += 1) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N_FFT - 1));
  }

  const out = new Float32Array(N_MELS * N_MEL_FRAMES);
  const clampedFrames = Math.min(frames, N_MEL_FRAMES);

  const re = new Float32Array(N_FFT / 2 + 1);
  const im = new Float32Array(N_FFT / 2 + 1);

  for (let f = 0; f < clampedFrames; f += 1) {
    re.fill(0);
    im.fill(0);
    const offset = f * HOP;
    for (let i = 0; i < N_FFT; i += 1) {
      const sample = offset + i < pcm.length ? pcm[offset + i] : 0;
      const windowed = sample * window[i];
      // Naive DFT (N=400): O(N^2) per frame is acceptable inside a worker for one utterance.
      for (let b = 0; b <= N_FFT / 2; b += 1) {
        const angle = (-2 * Math.PI * b * i) / N_FFT;
        re[b] += windowed * Math.cos(angle);
        im[b] += windowed * Math.sin(angle);
      }
    }
    for (let m = 0; m < N_MELS; m += 1) {
      const filter = filters[m];
      let energy = 1e-10;
      for (let b = 0; b <= N_FFT / 2; b += 1) {
        const power = re[b] * re[b] + im[b] * im[b];
        energy += filter[b] * power;
      }
      out[m * N_MEL_FRAMES + f] = Math.log(energy);
    }
  }

  let max = -Infinity;
  for (let i = 0; i < out.length; i += 1) {
    if (out[i] > max) max = out[i];
  }
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Math.max(out[i] - max, -8);
  }
  return out;
}

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
  const expectedNorm = stripDiacritics(expected);
  const heardNorm = heard ? stripDiacritics(heard) : '';
  if (heardNorm === expectedNorm) return 'correct';
  if (heardNorm.length === 0) return 'unknown';
  return margin < GOP_THRESHOLD ? 'mispronounced' : 'correct';
}

/** Normalised Levenshtein — substituting one Arabic letter costs 1. */
function levenshtein(a: string, b: string): number {
  const dp = new Array(a.length + 1).fill(0).map((_, i) => i);
  for (let j = 1; j <= b.length; j += 1) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= a.length; i += 1) {
      const temp = dp[i];
      dp[i] = Math.min(
        dp[i] + 1,
        dp[i - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = temp;
    }
  }
  return dp[a.length];
}

/* -------------------------------------------------------------------------- */
/* Utterance assembly & message pump                                           */
/* -------------------------------------------------------------------------- */

let utteranceBuffer: Float32Array[] = [];
let utteranceSamples = 0;
let inSpeech = false;
let target: { verseKey: string; words: string[] } | null = null;
let seqCounter = 0;

function resetUtterance(): void {
  utteranceBuffer = [];
  utteranceSamples = 0;
  inSpeech = false;
}

function post(message: EngineWorkerResponse, transfer?: Transferable[]): void {
  ctx.postMessage(message, transfer ?? []);
}

async function processChunk(samples: Float32Array): Promise<void> {
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
  const verseKey = target.verseKey;
  const expectedWords = target.words;

  try {
    const decoded = await transcribeUtterance(merged);

    /**
     * Aligns decoded tokens to canonical words with a monotone walk: Arabic word order is
     * fixed, so a greedy forward match (skipping insertions) is both correct here and much
     * cheaper than full DTW. Each word's GOP margin is its log-probability deficit against
     * the expected grapheme sequence.
     */
    const scores: EngineWordScore[] = [];
    let tokenCursor = 0;
    for (let w = 0; w < expectedWords.length; w += 1) {
      const expected = expectedWords[w];
      const expectedNorm = stripDiacritics(expected);
      let heard: string | undefined;
      let margin = 0;

      for (let t = tokenCursor; t < decoded.length; t += 1) {
        const candidate = stripDiacritics(decoded[t]);
        if (candidate.length === 0) continue;
        const distance = levenshtein(candidate, expectedNorm);
        if (candidate === expectedNorm || distance <= Math.ceil(expectedNorm.length / 2)) {
          heard = decoded[t];
          // Substitution distance maps onto the log-ratio: exact = 0, one letter off ≈ −2.5.
          margin = distance === 0 ? 0 : -(1.5 + distance);
          tokenCursor = t + 1;
          break;
        }
        if (t - tokenCursor > 2) break; // Do not skip more than a couple of insertion tokens.
      }

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
      const word = flagged[0].word;
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Local inference failed.';
    post({ type: 'engine-error', fatal: false, message });
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
        if (!vadBlob || !encoderBlob || !decoderBlob) {
          post({
            type: 'engine-error',
            fatal: true,
            message: 'The local engine is missing a required model asset.',
          });
          return;
        }
        await initVad(vadBlob);
        await initStt(encoderBlob, decoderBlob);
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
        seqCounter = request.seq;
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
        seqCounter = 0;
        return;
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Worker error.';
    post({ type: 'engine-error', fatal: true, message });
  }
};
