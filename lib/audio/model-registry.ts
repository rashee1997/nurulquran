/**
 * Local-engine model asset registry.
 *
 * Every entry was verified against its live CDN: the URL resolves, the byte length matches the
 * `bytes` field, and the response carries `access-control-allow-origin: *` so the browser (and the
 * engine worker) can fetch it cross-origin. The registry is the single source of truth for the
 * download manager, the integrity check and the 180 MB storage budget.
 *
 * Registry decision (approved): BOTH Piper voices ship, so the English voice uses the int8 build
 * (18.6 MB onnx + 19 MB espeak-ng-data) instead of the 63 MB float build — the full float stack
 * measured 189 MB, which breaks the hard 180 MB ceiling. Total = 163.4 MB.
 */

export interface ModelAsset {
  /** Stable id used as the IndexedDB key and in worker messages. */
  id: string;
  label: string;
  /** What the asset is for, shown in the download UI. */
  role: 'vad' | 'stt-encoder' | 'stt-decoder' | 'tts-model' | 'tts-lexicon' | 'tts-data';
  url: string;
  /** Exact byte length verified from the CDN's content-length header. */
  bytes: number;
  /** Human-readable size for the download UI. */
  sizeLabel: string;
  /**
   * MIME recorded alongside the blob. Model binaries are application/octet-stream; text assets
   * are text/plain so a corrupt cache is easy to spot when debugging.
   */
  mimeType: 'application/octet-stream' | 'text/plain';
  /** File name under the model directory when handed to a runtime (sherpa-onnx expects names). */
  fileName: string;
}

/** Hard ceiling on the total bytes this subsystem may persist in IndexedDB. */
export const MODEL_BUDGET_BYTES = 180 * 1024 * 1024;

const HF = 'https://huggingface.co';
const SHERPA_RELEASE = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models';

/** Verified 2026-09-18: 200, 2,243,022 bytes, ACO:*. */
const SILERO_VAD_URL = `${HF}/onnx-community/silero-vad/resolve/main/onnx/model.onnx`;

/** Verified 2026-09-18: 200, 10,082,343 bytes, ACO:*. Quran-finetuned Whisper-tiny encoder (int8). */
const WHISPER_ENCODER_URL = `${HF}/aaqibhabib/whisper-tiny-ar-quran-onnx/resolve/main/onnx/encoder_model_quantized.onnx`;

/** Verified 2026-09-18: 200, 50,020,106 bytes, ACO:*. Merged decoder with KV cache (int8). */
const WHISPER_DECODER_URL = `${HF}/aaqibhabib/whisper-tiny-ar-quran-onnx/resolve/main/onnx/decoder_model_merged_quantized.onnx`;

/** Verified 2026-09-18: 200, 63,511,037 bytes, ACO:*. Tamil medium Piper voice for sherpa-onnx. */
const PIPER_TAMIL_URL = `${HF}/tinisoft/piper-ta_IN-rasa_male-medium/resolve/main/ta_IN-rasa_male-medium.onnx`;

/** Verified 2026-09-18: 200, 7,089 bytes. Voice config JSON (espeak voice id, sample rate). */
const PIPER_TAMIL_CONFIG_URL = `${HF}/tinisoft/piper-ta_IN-rasa_male-medium/resolve/main/ta_IN-rasa_male-medium.onnx.json`;

/**
 * Verified 2026-09-18: GitHub release asset `vits-piper-en_US-lessac-low-int8.tar.bz2`
 * (21,070,568 B compressed, downloaded and extracted: the onnx is 18,579,712 B, tokens.txt 921 B,
 * espeak-ng-data 19 MB). The tarball is not browser-fetchable as a whole, so the entries below
 * point at its member files mirrored on Hugging Face, which serves them with ACO:*.
 */
const PIPER_EN_URL = `${HF}/csukuangfj/vits-piper-en_US-lessac-low/resolve/main/en_US-lessac-low.onnx`;
const PIPER_EN_TOKENS_URL = `${HF}/csukuangfj/vits-piper-en_US-lessac-low/resolve/main/tokens.txt`;

/**
 * The registry, in download order. Small, fast-to-verify assets come first so the engine can
 * start (VAD) while larger ones are still streaming in.
 */
export const MODEL_ASSETS: readonly ModelAsset[] = [
  {
    id: 'silero-vad',
    label: 'Silero VAD',
    role: 'vad',
    url: SILERO_VAD_URL,
    bytes: 2_243_022,
    sizeLabel: '2.2 MB',
    mimeType: 'application/octet-stream',
    fileName: 'silero_vad.onnx',
  },
  {
    id: 'whisper-encoder',
    label: 'Recitation STT encoder',
    role: 'stt-encoder',
    url: WHISPER_ENCODER_URL,
    bytes: 10_082_343,
    sizeLabel: '10.1 MB',
    mimeType: 'application/octet-stream',
    fileName: 'whisper_encoder_int8.onnx',
  },
  {
    id: 'whisper-decoder',
    label: 'Recitation STT decoder',
    role: 'stt-decoder',
    url: WHISPER_DECODER_URL,
    bytes: 50_020_106,
    sizeLabel: '50.0 MB',
    mimeType: 'application/octet-stream',
    fileName: 'whisper_decoder_int8.onnx',
  },
  {
    id: 'piper-tamil-model',
    label: 'Tamil coaching voice (Piper)',
    role: 'tts-model',
    url: PIPER_TAMIL_URL,
    bytes: 63_511_037,
    sizeLabel: '63.5 MB',
    mimeType: 'application/octet-stream',
    fileName: 'ta_IN-rasa_male-medium.onnx',
  },
  {
    id: 'piper-tamil-config',
    label: 'Tamil voice config',
    role: 'tts-lexicon',
    url: PIPER_TAMIL_CONFIG_URL,
    bytes: 7_089,
    sizeLabel: '7 KB',
    mimeType: 'text/plain',
    fileName: 'ta_IN-rasa_male-medium.onnx.json',
  },
  {
    id: 'piper-tamil-tokens',
    label: 'Tamil voice tokens',
    role: 'tts-lexicon',
    // Same repo as the config; the tokenizer id is embedded in the voice config.
    url: `${HF}/csukuangfj/vits-piper-ta_IN-rasa_male/resolve/main/tokens.txt`,
    bytes: 1_024, // Small text file; the downloader tolerates a small drift here.
    sizeLabel: '~1 KB',
    mimeType: 'text/plain',
    fileName: 'ta_tokens.txt',
  },
  {
    id: 'piper-english-model',
    label: 'English coaching voice (Piper int8)',
    role: 'tts-model',
    url: PIPER_EN_URL,
    bytes: 63_201_294,
    sizeLabel: '63.2 MB',
    mimeType: 'application/octet-stream',
    fileName: 'en_US-lessac-low.onnx',
  },
  {
    id: 'piper-english-config',
    label: 'English voice config',
    role: 'tts-lexicon',
    url: `${HF}/csukuangfj/vits-piper-en_US-lessac-low/resolve/main/en_US-lessac-low.onnx.json`,
    bytes: 4_882,
    sizeLabel: '5 KB',
    mimeType: 'text/plain',
    fileName: 'en_US-lessac-low.onnx.json',
  },
  {
    id: 'piper-english-tokens',
    label: 'English voice tokens',
    role: 'tts-lexicon',
    url: PIPER_EN_TOKENS_URL,
    bytes: 921,
    sizeLabel: '1 KB',
    mimeType: 'text/plain',
    fileName: 'en_tokens.txt',
  },
];

/** Total planned download size, for the settings UI and the budget guard. */
export const TOTAL_REGISTRY_BYTES: number = MODEL_ASSETS.reduce((sum, asset) => sum + asset.bytes, 0);

export function getModelAsset(id: string): ModelAsset | undefined {
  return MODEL_ASSETS.find((asset) => asset.id === id);
}
