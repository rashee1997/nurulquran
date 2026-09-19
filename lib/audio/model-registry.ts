/**
 * Local-engine model asset registry — variant-aware, no automatic fallback.
 *
 * Every entry was verified against its live CDN: the URL resolves, the byte length matches the
 * `bytes` field (re-verify with a HEAD request before editing — a stale byte count makes the
 * integrity check reject a fully-downloaded file forever), and the response carries
 * `access-control-allow-origin` reflecting the request Origin. Each variant lists exactly the
 * assets it runs; the learner chooses the engine per module (or leaves the Settings default),
 * and that choice is downloaded and run as-is — if a download fails, the module surfaces the
 * error instead of silently switching voices.
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
  bytes: 10_097_740,
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
  bytes: 63_201_425,
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
  bytes: 4_882,
  sizeLabel: '5 KB',
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
  bytes: 4_164,
  sizeLabel: '4 KB',
  mimeType: 'text/plain',
  fileName: 'en_US-amy-low.onnx.json',
};

export type CoachModelVariant = 'balanced' | 'tamil-hemalatha' | 'english-amy';

/**
 * A module's engine choice: the cloud coach, a specific local variant, or the saved Settings
 * default (`default`). Inline choices always win over Settings; Settings wins over 'balanced'.
 */
export type ModuleEngineChoice = 'cloud' | 'default' | CoachModelVariant;

/** Voice modules that can pick an engine inline. Extends as more modules adopt local mode. */
export type CoachModuleId = 'tajweed-coach' | 'tafsir-storyteller' | 'recitation-coach';

export interface ModelVariant {
  id: CoachModelVariant;
  label: string;
  descriptionEn: string;
  assets: readonly ModelAsset[];
}

/**
 * The three user-selectable variants. `balanced` is the Settings default: Tamil Rasa + English
 * int8 Lessac at 163.4 MB. The alternates swap one voice each and remain inside the budget.
 */
export const MODEL_VARIANTS: Record<CoachModelVariant, ModelVariant> = {
  balanced: {
    id: 'balanced',
    label: 'Balanced (default)',
    descriptionEn: 'Tamil Rasa + English Lessac int8. Both coaching voices, most reliable downloads.',
    assets: [SILERO_VAD, WHISPER_ENCODER, WHISPER_DECODER, PIPER_TAMIL_RASA, PIPER_TAMIL_RASA_CONFIG, PIPER_EN_LESSAC, PIPER_EN_LESSAC_CONFIG],
  },
  'tamil-hemalatha': {
    id: 'tamil-hemalatha',
    label: 'Tamil — HemaLatha (female)',
    descriptionEn: 'Female Tamil coaching voice instead of Rasa. Same engine, warmer tone.',
    assets: [SILERO_VAD, WHISPER_ENCODER, WHISPER_DECODER, PIPER_TAMIL_HEMALATHA, PIPER_TAMIL_HEMALATHA_CONFIG, PIPER_EN_LESSAC, PIPER_EN_LESSAC_CONFIG],
  },
  'english-amy': {
    id: 'english-amy',
    label: 'English — Amy (US)',
    descriptionEn: 'Amy for English coaching instead of Lessac. Same engine, softer tone.',
    assets: [SILERO_VAD, WHISPER_ENCODER, WHISPER_DECODER, PIPER_TAMIL_RASA, PIPER_TAMIL_RASA_CONFIG, PIPER_EN_AMY, PIPER_EN_AMY_CONFIG],
  },
};

/**
 * Resolves the variant a module will actually use: an inline choice wins outright, otherwise
 * the saved Settings default applies, otherwise 'balanced'. Returns `null` for 'cloud' —
 * the module simply never touches the local engine.
 */
export function resolveModuleVariant(
  moduleId: CoachModuleId,
  moduleEngines: Partial<Record<CoachModuleId, ModuleEngineChoice>> | undefined,
  settingsDefault: CoachModelVariant | undefined
): ModelVariant | null {
  const inline = moduleEngines?.[moduleId];
  const choice: ModuleEngineChoice = inline ?? 'default';
  if (choice === 'cloud') return null;
  const variantId: CoachModelVariant = choice === 'default' ? (settingsDefault ?? 'balanced') : choice;
  return MODEL_VARIANTS[variantId] ?? MODEL_VARIANTS.balanced;
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
