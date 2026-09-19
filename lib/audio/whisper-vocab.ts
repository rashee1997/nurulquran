/**
 * Whisper special-token ids for the local recitation engine.
 *
 * The multilingual Whisper tokenizer is shared by every checkpoint, so these ids are a stable
 * contract — but they are **not** the ids the English-only (`.en`) checkpoints use, and the two
 * sets diverge from `<|startoftranscript|>` onward. Every value below was read out of the shipped
 * model's own `added_tokens.json` and `vocab.json`
 * (`aaqibhabib/whisper-base-ar-quran-onnx`), not recalled:
 *
 *   `<|startoftranscript|>` 50258 · `<|en|>` 50259 · `<|ar|>` 50272 · `<|ta|>` 50287
 *   `<|translate|>` 50358 · `<|transcribe|>` 50359 · `<|nocaptions|>` 50362
 *   `<|notimestamps|>` 50363 · `<|0.00|>` 50364
 *
 * `<|endoftext|>` (50257) lives in `vocab.json` rather than `added_tokens.json`.
 *
 * The values previously shipped here were the `.en` checkpoint's, which seeded the decoder with
 * `<|endoftext|>` where `<|startoftranscript|>` belongs and requested Arabic with an English
 * language token. No amount of acoustic accuracy recovers from a malformed prompt, so the local
 * engine could not have transcribed anything correctly.
 *
 * The word-level token table that used to live here is gone: Whisper's Arabic tokens are
 * byte-level BPE merges, not single graphemes, so a hand-written grapheme→id map can never
 * decode a real transcript. The worker now reads the model's own `vocab.json` — see
 * `WHISPER_TOKENIZER` in `lib/audio/model-registry.ts`.
 */
export const WHISPER_SPECIAL: Record<string, number> = {
  eot: 50257,
  sot: 50258,
  transcribe: 50359,
  translate: 50358,
  notimestamps: 50363,
  no_speech: 50362,
  ar: 50272,
  en: 50259,
  ta: 50287,
};
