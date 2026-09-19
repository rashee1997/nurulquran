'use client';

import { db } from '@/lib/db';
import { getAssetBlobs } from '@/lib/audio/model-cache';
import {
  MODEL_VARIANTS,
  resolveModuleVariant,
  variantVoiceAssets,
  type CoachModelVariant,
  type CoachModuleId,
  type ModelAsset,
  type ModelVariant,
} from '@/lib/audio/model-registry';
import { previewAudio } from '@/lib/audio/preview-audio';
import { float32ToWavBase64 } from '@/lib/audio/wav';

/**
 * On-device coaching voice.
 *
 * `model-registry.ts` has always shipped Piper voices and budgeted their bytes; nothing ran them,
 * so every coaching cue that could not be sent to Gemini fell through to `speechSynthesis` — which
 * has no Tamil voice on most desktops, so Tamil coaching was silent. This module closes that gap:
 * it resolves the learner's chosen voice, boots `tts.worker.ts` with the cached blobs, and plays
 * the synthesized Pcm through the same single-playback controller the recitation previews use.
 *
 * Failure is always `false`, never a throw. Every caller is a voice surface that already has a next
 * tier (a recorded clip, then the platform synthesizer), and a cue that cannot be synthesized
 * locally must fall through to it rather than take the surface down with it. The reasons are kept
 * in `localVoiceStatus` so a failure is diagnosable instead of invisible.
 */

export type VoiceLanguage = 'ta' | 'en';

/* -------------------------------------------------------------------------- */
/* Worker contract                                                             */
/* -------------------------------------------------------------------------- */

export type TtsWorkerRequest =
  | { type: 'init'; voiceKey: string; model: ArrayBuffer; config: string }
  | { type: 'speak'; requestId: number; text: string };

export interface TtsSynthesisResult {
  type: 'result';
  requestId: number;
  samples: Float32Array;
  sampleRate: number;
  sentenceCount: number;
}

export type TtsWorkerResponse =
  | { type: 'ready'; voiceKey: string }
  | TtsSynthesisResult
  | { type: 'error'; requestId: number | null; fatal: boolean; message: string };

export function createTtsWorker(): { worker: Worker; dispose: () => void } {
  const worker = new Worker(new URL('./tts.worker.ts', import.meta.url), { type: 'module' });
  return {
    worker,
    dispose: () => {
      worker.terminate();
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Tunables                                                                    */
/* -------------------------------------------------------------------------- */

/** How long a resolved voice preference is trusted before the profile is re-read. */
const PREFERENCE_TTL_MS = 20_000;
/** A voice is ~63 MB to decode and build a session for; give a slow device room. */
const BOOT_TIMEOUT_MS = 60_000;
/** One utterance. Longer text is the cloud tier's job, not a 60 MB local model's. */
const SYNTHESIS_TIMEOUT_MS = 45_000;
/**
 * Longest text handed to local synthesis.
 *
 * Cues are single sentences. The cap keeps a runaway paragraph from locking the worker for
 * minutes on a low-end device, and it is generous enough to cover a storyteller fallback turn.
 */
const MAX_LOCAL_CHARS = 600;
/**
 * Synthesized cues kept in memory, keyed by voice and text.
 *
 * Coaching repeats the same corrections constantly ("this word is mispronounced, repeat it"), so
 * the second occurrence of a cue plays from cache instead of re-running the model.
 */
const CACHE_LIMIT = 32;
/** After a boot failure, wait before trying again: a broken voice must not re-boot every cue. */
const FAILURE_COOLDOWN_MS = 60_000;

/* -------------------------------------------------------------------------- */
/* State                                                                       */
/* -------------------------------------------------------------------------- */

interface BootedVoice {
  key: string;
  worker: Worker;
}

interface PendingRequest {
  resolve: (result: TtsSynthesisResult) => void;
  reject: (error: Error) => void;
}

interface PreferenceSnapshot {
  moduleId: CoachModuleId;
  variant: ModelVariant | null;
  at: number;
}

let active: BootedVoice | null = null;
let booting: Promise<BootedVoice> | null = null;
let bootingKey: string | null = null;
let bootWaiter: PendingRequest | null = null;

let preference: PreferenceSnapshot | null = null;
let failureUntil = 0;
let lastError: string | null = null;

const pending = new Map<number, PendingRequest>();
const inFlight = new Map<string, Promise<boolean>>();
const wavCache = new Map<string, string>();
/** Guards against two cues asking for the same text while the profile is still being read. */
let nextRequestId = 1;

/* -------------------------------------------------------------------------- */
/* Status                                                                      */
/* -------------------------------------------------------------------------- */

export interface LocalVoiceStatus {
  /** Key of the voice currently resident in a worker, if any. */
  voiceKey: string | null;
  /** Why the last attempt failed, cleared on the next success. */
  lastError: string | null;
  /** Milliseconds remaining before a retry is allowed after a failure. */
  retryInMs: number;
}

export function localVoiceStatus(): LocalVoiceStatus {
  return {
    voiceKey: active?.key ?? null,
    lastError,
    retryInMs: Math.max(0, failureUntil - Date.now()),
  };
}

/** True for the languages a local Piper voice exists for. */
export function isLocalVoiceLanguage(language: string): language is VoiceLanguage {
  return language === 'ta' || language === 'en';
}

/**
 * Maps a BCP-47 tag to a voice language.
 *
 * Only the base language is consulted. An unknown region is not a reason to synthesize in the
 * wrong language, so anything that is neither Tamil nor English returns `null` and the caller
 * escalates — reading Arabic with an English voice would produce sounds that are not the Quran.
 */
export function voiceLanguageFor(tag: string): VoiceLanguage | null {
  const base = tag.toLowerCase().split('-')[0];
  return base === 'ta' || base === 'en' ? base : null;
}

/* -------------------------------------------------------------------------- */
/* Boot                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Raised when there is simply nothing to run yet, or the voice was deliberately let go — a normal
 * state rather than a fault.
 *
 * It is separated out so that neither case triggers the failure cooldown or a console warning:
 * a cooldown would keep the voice silent for a minute after the learner had just downloaded it,
 * and switching variants mid-session is not an error worth logging.
 */
class VoiceUnavailableError extends Error {}

function registerFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : 'The on-device voice failed.';
  if (message !== lastError) {
    console.warn('On-device voice unavailable; falling back to the platform synthesizer:', message);
  }
  lastError = message;
  failureUntil = Date.now() + FAILURE_COOLDOWN_MS;
}

function releaseActive(): void {
  if (active) {
    active.worker.terminate();
    active = null;
  }
  /*
   * Reject rather than drop the outstanding requests: a terminated worker will never answer, so
   * a caller left waiting would hold a coaching cue for its full timeout before falling back.
   * Rejecting lets it fall back immediately.
   */
  for (const entry of pending.values()) {
    entry.reject(new VoiceUnavailableError('The on-device voice was released.'));
  }
  pending.clear();
  bootWaiter = null;
}

/**
 * One message handler per worker, routing by `requestId`.
 *
 * A `null` requestId means the failure happened while loading the voice, so it belongs to the boot
 * promise rather than to an utterance.
 */
function attachDispatcher(worker: Worker): void {
  worker.onmessage = (event: MessageEvent<TtsWorkerResponse>) => {
    const data = event.data;

    if (data.type === 'result') {
      const entry = pending.get(data.requestId);
      if (!entry) return;
      pending.delete(data.requestId);
      entry.resolve(data);
      return;
    }

    if (data.type === 'error') {
      const error = new Error(data.message);
      if (data.requestId === null) {
        const waiter = bootWaiter;
        bootWaiter = null;
        waiter?.reject(error);
        return;
      }
      const entry = pending.get(data.requestId);
      if (entry) {
        pending.delete(data.requestId);
        entry.reject(error);
      }
    }
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(message));
      }
    );
  });
}

async function bootVoice(
  voiceKey: string,
  modelAsset: ModelAsset,
  configAsset: ModelAsset
): Promise<BootedVoice> {
  const blobs = await getAssetBlobs([modelAsset, configAsset]);
  const modelBlob = blobs.get(modelAsset.id);
  const configBlob = blobs.get(configAsset.id);
  if (!modelBlob || !configBlob) {
    throw new VoiceUnavailableError(`${modelAsset.label} is not downloaded yet.`);
  }

  const config = await configBlob.text();
  const { worker } = createTtsWorker();
  attachDispatcher(worker);

  const ready = new Promise<void>((resolve, reject) => {
    bootWaiter = {
      resolve: () => resolve(),
      reject,
    };
  });

  const model = await modelBlob.arrayBuffer();
  worker.postMessage(
    { type: 'init', voiceKey, model, config } satisfies TtsWorkerRequest,
    [model]
  );

  try {
    await withTimeout(ready, BOOT_TIMEOUT_MS, 'The on-device voice took too long to load.');
  } catch (error) {
    worker.terminate();
    bootWaiter = null;
    throw error;
  }

  return { key: voiceKey, worker };
}

/** Resolves the resident voice for `voiceKey`, booting it if a different voice is active. */
async function ensureVoice(
  voiceKey: string,
  modelAsset: ModelAsset,
  configAsset: ModelAsset
): Promise<BootedVoice> {
  if (active && active.key === voiceKey) return active;
  if (booting && bootingKey === voiceKey) return booting;

  // Only one voice is kept resident: each is ~63 MB of weights plus its session.
  releaseActive();
  bootingKey = voiceKey;
  const attempt = bootVoice(voiceKey, modelAsset, configAsset).then((booted) => {
    active = booted;
    return booted;
  });
  booting = attempt;
  try {
    return await attempt;
  } catch (error) {
    booting = null;
    bootingKey = null;
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Synthesis + playback                                                        */
/* -------------------------------------------------------------------------- */

function remember(cacheKey: string, dataUrl: string): void {
  wavCache.set(cacheKey, dataUrl);
  while (wavCache.size > CACHE_LIMIT) {
    const oldest = wavCache.keys().next();
    if (oldest.done) break;
    wavCache.delete(oldest.value);
  }
}

function synthesize(booted: BootedVoice, text: string): Promise<TtsSynthesisResult> {
  const requestId = nextRequestId;
  nextRequestId += 1;

  const response = new Promise<TtsSynthesisResult>((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    try {
      booted.worker.postMessage({ type: 'speak', requestId, text } satisfies TtsWorkerRequest);
    } catch (error) {
      pending.delete(requestId);
      reject(error instanceof Error ? error : new Error('The on-device voice rejected the request.'));
    }
  });

  return withTimeout(
    response,
    SYNTHESIS_TIMEOUT_MS,
    'The on-device voice took too long to synthesize.'
  ).finally(() => {
    // A late reply arrives after the row is gone and is dropped by the dispatcher.
    pending.delete(requestId);
  });
}

/**
 * Reads the learner's voice preference, memoised briefly.
 *
 * `resolveModuleVariant` returns `null` for a module the learner pointed at the cloud — in that
 * case there is deliberately no on-device voice, and the module's own cloud audio is the answer.
 */
async function resolveVariant(
  moduleId: CoachModuleId,
  override?: CoachModelVariant
): Promise<ModelVariant | null> {
  // Only the Settings voice test overrides: it asks "can this device run the variant I just
  // picked?", which is a different question from "what will this module use?".
  if (override) return MODEL_VARIANTS[override] ?? MODEL_VARIANTS.balanced;

  const now = Date.now();
  if (preference && preference.moduleId === moduleId && now - preference.at < PREFERENCE_TTL_MS) {
    return preference.variant;
  }
  const profile = await db.userProfile.get('default_user');
  const variant = resolveModuleVariant(moduleId, profile?.moduleEngines, profile?.coachModelVariant);
  preference = { moduleId, variant, at: now };
  return variant;
}

export interface SpeakLocalOptions {
  /** Which module is speaking, so a per-module engine override is honoured. */
  moduleId?: CoachModuleId;
  /** Playback key for the single-playback controller; groups cues that supersede each other. */
  key?: string;
  /** Speak with this variant instead of the resolved preference (Settings voice test). */
  variantOverride?: CoachModelVariant;
}

/**
 * Speaks `text` with the learner's on-device voice.
 *
 * Resolves `true` when the cue played and `false` for every reason it could not — no voice
 * downloaded, a language with no local voice, a module set to cloud, a synthesis or playback
 * failure. Callers use that to continue down their own fallback ladder.
 */
export async function speakLocalVoice(
  language: VoiceLanguage,
  text: string,
  options: SpeakLocalOptions = {}
): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_LOCAL_CHARS) return false;
  if (Date.now() < failureUntil) return false;

  const moduleId = options.moduleId ?? 'recitation-coach';
  const variant = await resolveVariant(moduleId, options.variantOverride);
  if (!variant) return false;

  const assets = variantVoiceAssets(variant, language);
  if (!assets) return false;

  const voiceKey = `${variant.id}:${language}`;
  const cacheKey = `${voiceKey}|${trimmed}`;
  const playbackKey = options.key ?? `local-voice:${language}`;

  const cached = wavCache.get(cacheKey);
  if (cached) return previewAudio.play(playbackKey, cached);

  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  const attempt = (async (): Promise<boolean> => {
    const booted = await ensureVoice(voiceKey, assets.model, assets.config);
    const result = await synthesize(booted, trimmed);
    const dataUrl = `data:audio/wav;base64,${float32ToWavBase64(result.samples, result.sampleRate)}`;
    remember(cacheKey, dataUrl);
    return previewAudio.play(playbackKey, dataUrl);
  })()
    .then((played) => {
      if (played) lastError = null;
      return played;
    })
    .catch((error: unknown) => {
      if (!(error instanceof VoiceUnavailableError)) registerFailure(error);
      return false;
    })
    .finally(() => {
      inFlight.delete(cacheKey);
    });

  inFlight.set(cacheKey, attempt);
  return attempt;
}

/** Releases the resident voice (used when the learner changes it in Settings). */
export function releaseLocalVoice(): void {
  releaseActive();
  booting = null;
  bootingKey = null;
  wavCache.clear();
}
