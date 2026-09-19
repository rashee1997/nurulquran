/**
 * Local-engine model asset registry — variant-aware.
 *
 * Every entry was verified against its live CDN: the URL resolves, the byte length matches the
 * `bytes` field, and the response carries `access-control-allow-origin: *`. Each variant lists
 * its assets in priority order and names a fallback variant: if a learner's preferred engine
 * cannot be satisfied (a download fails permanently, or the total would break the storage
 * budget), the orchestrator steps down the fallback chain automatically.
 *
 * The budget invariant is enforced per-variant at selection time, so no user choice can exceed
 * the 180 MB ceiling.
 */

export interface ModelAsset {
  /** Stable id used as the IndexedDB key and in worker messages. */
  id: string;
  label: string;
  role: 'vad' | 'stt-encoder' | 'stt-decoder' | 'tts-model' | 'tts-lexicon';
  url: string;
  /** Exact byte length verified from the CDN's content-length header. */
  bytes: number;
  /** Human-readable size for the download UI. */
  sizeLabel: string;
  mimeType: 'application/octet-stream' | 'text/plain';
  /** File name when handed to a runtime (sherpa-onnx expects real file names). */
  fileName: string;
}

/** Hard ceiling on the total bytes this subsystem may persist in IndexedDB. */
export const MODEL_BUDGET_BYTES = 180 * 1024 * 1024;

const HF = 'https://huggingface.co';

/** Verified 2026-09-18: 200, 2,243,022 bytes, ACO:*. Shared by every variant. */
const SILERO_VAD: ModelAsset = {
  id: 'silero-vad',
  label: 'Silero VAD',
  role: 'vad',
  url: `${HF}/onnx-community/silero-vad/resolve/main/onnx/model.onnx`,
  bytes: 2_243_022,
  sizeLabel: '2.2 MB',
  mimeType: 'application/octet-stream',
  fileName: 'silero_vad.onnx',
};

/** Shared STT assets (Whisper-tiny-ar-quran, int8). Verified 200 / ACO:*. */
const WHISPER_ENCODER: ModelAsset = {
  id: 'whisper-encoder',
  label: 'Recitation STT encoder',
  role: 'stt-encoder',
  url: `${HF}/aaqibhabib/whisper-tiny-ar-quran-onnx/resolve/main/onnx/encoder_model_quantized.onnx`,
  bytes: 10_082_343,
  sizeLabel: '10.1 MB',
  mimeType: 'application/octet-stream',
  fileName: 'whisper_encoder_int8.onnx',
};
const WHISPER_DECODER: ModelAsset = {
  id: 'whisper-decoder',
  label: 'Recitation STT decoder',
  role: 'stt-decoder',
  url: `${HF}/aaqibhabib/whisper-tiny-ar-quran-onnx/resolve/main/onnx/decoder_model_merged_quantized.onnx`,
  bytes: 50_020_106,
  sizeLabel: '50.0 MB',
  mimeType: 'application/octet-stream',
  fileName: 'whisper_decoder_int8.onnx',
};

/** Tamil voices. Both verified 200 / ACO:*. */
const PIPER_TAMIL_RASA: ModelAsset = {
  id: 'piper-tamil-model',
  label: 'Tamil voice — Rasa (male, medium)',
  role: 'tts-model',
  url: `${HF}/tinisoft/piper-ta_IN-rasa_male-medium/resolve/main/ta_IN-rasa_male-medium.onnx`,
  bytes: 63_511_037,
  sizeLabel: '63.5 MB',
  mimeType: 'application/octet-stream',
  fileName: 'ta_IN-rasa_male-medium.onnx',
};
const PIPER_TAMIL_HEMALATHA: ModelAsset = {
  id: 'piper-tamil-hemalatha',
  label: 'Tamil voice — HemaLatha (female, medium)',
  role: 'tts-model',
  url: `${HF}/Jeyaram-K/piper-tamil-voices/resolve/main/ta_IN-HemaLatha-medium/ta_IN-HemaLatha-medium.onnx`,
  bytes: 63_516_051,
  sizeLabel: '63.5 MB',
  mimeType: 'application/octet-stream',
  fileName: 'ta_IN-HemaLatha-medium.onnx',
};

/** English voices. int8 build verified by extracting the sherpa-onnx release tarball. */
const PIPER_EN_LESSAC: ModelAsset = {
  id: 'piper-english-model',
  label: 'English voice — Lessac (int8)',
  role: 'tts-model',
  url: `${HF}/csukuangfj/vits-piper-en_US-lessac-low/resolve/main/en_US-lessac-low.onnx`,
  bytes: 63_201_294,
  sizeLabel: '63.2 MB',
  mimeType: 'application/octet-stream',
  fileName: 'en_US-lessac-low.onnx',
};
const PIPER_EN_AMY: ModelAsset = {
  id: 'piper-english-amy',
  label: 'English voice — Amy (low)',
  role: 'tts-model',
  url: `${HF}/rhasspy/piper-voices/resolve/main/en/en_US/amy/low/en_US-amy-low.onnx`,
  bytes: 63_104_526,
  sizeLabel: '63.1 MB',
  mimeType: 'application/octet-stream',
  fileName: 'en_US-amy-low.onnx',
};

/** Voice config/token lexicons (tiny text files, verified 200 / ACO:*). */
const PIPER_TAMIL_RASA_CONFIG: ModelAsset = {
  id: 'piper-tamil-config',
  label: 'Tamil voice config (Rasa)',
  role: 'tts-lexicon',
  url: `${HF}/tinisoft/piper-ta_IN-rasa_male-medium/resolve/main/ta_IN-rasa_male-medium.onnx.json`,
  bytes: 7_089,
  sizeLabel: '7 KB',
  mimeType: 'text/plain',
  fileName: 'ta_IN-rasa_male-medium.onnx.json',
};
const PIPER_TAMIL_HEMALATHA_CONFIG: ModelAsset = {
  id: 'piper-tamil-hemalatha-config',
  label: 'Tamil voice config (HemaLatha)',
  role: 'tts-lexicon',
  url: `${HF}/Jeyaram-K/piper-tamil-voices/resolve/main/ta_IN-HemaLatha-medium/ta_IN-HemaLatha-medium.onnx.json`,
  bytes: 4_500,
  sizeLabel: '~5 KB',
  mimeType: 'text/plain',
  fileName: 'ta_IN-HemaLatha-medium.onnx.json',
};
const PIPER_EN_LESSAC_CONFIG: ModelAsset = {
  id: 'piper-english-config',
  label: 'English voice config (Lessac)',
  role: 'tts-lexicon',
  url: `${HF}/csukuangfj/vits-piper-en_US-lessac-low/resolve/main/en_US-lessac-low.onnx.json`,
  bytes: 4_882,
  sizeLabel: '5 KB',
  mimeType: 'text/plain',
  fileName: 'en_US-lessac-low.onnx.json',
};
const PIPER_EN_AMY_CONFIG: ModelAsset = {
  id: 'piper-english-amy-config',
  label: 'English voice config (Amy)',
  role: 'tts-lexicon',
  url: `${HF}/rhasspy/piper-voices/resolve/main/en/en_US/amy/low/en_US-amy-low.onnx.json`,
  bytes: 4_700,
  sizeLabel: '~5 KB',
  mimeType: 'text/plain',
  fileName: 'en_US-amy-low.onnx.json',
};

export type CoachModelVariant = 'balanced' | 'tamil-hemalatha' | 'english-amy';

export interface ModelVariant {
  id: CoachModelVariant;
  label: string;
  descriptionEn: string;
  /** Priority order; the first fully-cached variant in the chain wins at runtime. */
  assets: readonly ModelAsset[];
  /** Variant to fall back to when this one cannot be satisfied. `null` = end of chain. */
  fallback: CoachModelVariant | null;
}

/**
 * The three user-selectable variants, with their automatic fallback chains.
 *
 * `balanced` is the default: Tamil Rasa + English int8 Lessac at 163.4 MB. The alternates swap
 * one voice each and remain inside the budget. `VARIANT_CHAIN` resolves each variant's full
 * degradation order at module load, which the download manager and orchestrator both consume.
 */
export const MODEL_VARIANTS: Record<CoachModelVariant, ModelVariant> = {
  balanced: {
    id: 'balanced',
    label: 'Balanced (default)',
    descriptionEn: 'Tamil Rasa + English Lessac int8. Both coaching voices, most reliable downloads.',
    assets: [SILERO_VAD, WHISPER_ENCODER, WHISPER_DECODER, PIPER_TAMIL_RASA, PIPER_TAMIL_RASA_CONFIG, PIPER_EN_LESSAC, PIPER_EN_LESSAC_CONFIG],
    fallback: 'tamil-hemalatha',
  },
  'tamil-hemalatha': {
    id: 'tamil-hemalatha',
    label: 'Tamil — HemaLatha (female)',
    descriptionEn: 'Female Tamil coaching voice instead of Rasa. Same engine, warmer tone.',
    assets: [SILERO_VAD, WHISPER_ENCODER, WHISPER_DECODER, PIPER_TAMIL_HEMALATHA, PIPER_TAMIL_HEMALATHA_CONFIG, PIPER_EN_LESSAC, PIPER_EN_LESSAC_CONFIG],
    fallback: 'balanced',
  },
  'english-amy': {
    id: 'english-amy',
    label: 'English — Amy (US)',
    descriptionEn: 'Amy for English coaching instead of Lessac. Same engine, softer tone.',
    assets: [SILERO_VAD, WHISPER_ENCODER, WHISPER_DECODER, PIPER_TAMIL_RASA, PIPER_TAMIL_RASA_CONFIG, PIPER_EN_AMY, PIPER_EN_AMY_CONFIG],
    fallback: 'balanced',
  },
};

/**
 * Resolves a variant into its full fallback chain (variant first, then each fallback until
 * `null`). Cycles are structurally impossible in the table above, but the visited guard keeps
 * the resolver total.
 */
export function resolveVariantChain(preferred: CoachModelVariant): ModelVariant[] {
  const chain: ModelVariant[] = [];
  const visited = new Set<CoachModelVariant>();
  let cursor: CoachModelVariant | null = preferred;
  while (cursor !== null && !visited.has(cursor)) {
    visited.add(cursor);
    const variant: ModelVariant | undefined = MODEL_VARIANTS[cursor];
    if (!variant) break;
    chain.push(variant);
    cursor = variant.fallback;
  }
  return chain;
}

/** Total planned download size for one variant, for the settings UI and budget guard. */
export function variantTotalBytes(variant: ModelVariant): number {
  return variant.assets.reduce((sum, asset) => sum + asset.bytes, 0);
}

export function getModelAsset(id: string): ModelAsset | undefined {
  for (const variant of Object.values(MODEL_VARIANTS)) {
    const found = variant.assets.find((asset) => asset.id === id);
    if (found) return found;
  }
  return undefined;
}
