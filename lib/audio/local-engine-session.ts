'use client';

import { createEngineWorker, type EngineWordScore } from '@/lib/audio/capture-engine';
import { getReadyBlobs, isVariantReady } from '@/lib/audio/model-cache';
import { MODEL_VARIANTS, type ModelVariant } from '@/lib/audio/model-registry';

/**
 * One-shot local-engine session.
 *
 * The recitation coach keeps a persistent orchestrator (continuous streaming + failover). The
 * other voice modules — tajweed coach, tafsir storyteller — use this lighter contract instead:
 * boot the engine worker on demand, feed it the recording the module already captured, and get
 * word-level scores back for the target verse. No AudioContext ownership, no multiplexing, no
 * cloud fallback: the module either runs this (inline local mode) or its normal cloud path.
 */

export type LocalEnginePhase =
  | 'unavailable'
  | 'booting'
  | 'ready'
  | 'scoring'
  | 'error';

export interface LocalUtteranceResult {
  /** Greedy Whisper transcription of the recitation (diacritic-stripped for comparison). */
  transcript: string;
  scores: EngineWordScore[];
  providers: { webgpu: boolean; threads: number };
}

interface ActiveSession {
  worker: Worker;
  providers: { webgpu: boolean; threads: number };
}

let active: ActiveSession | null = null;
let booting: Promise<ActiveSession> | null = null;

/** Whether the given variant's blobs are fully cached (fast IndexedDB check, no worker boot). */
export async function isLocalEngineAvailable(variant: ModelVariant): Promise<boolean> {
  return isVariantReady(variant);
}

/**
 * Boots the engine worker with the given variant's cached blobs. Resolves once the worker
 * reports `engine-ready`; throws when assets are missing or the worker errors.
 */
export async function bootLocalEngine(variant: ModelVariant): Promise<ActiveSession> {
  if (active) return active;
  if (booting) return booting;

  booting = (async () => {
    const blobs = await getReadyBlobs(variant);
    const assets = [...blobs.entries()].map(([id, blob]) => ({ id, blob }));
    if (assets.length === 0) {
      throw new Error(`The ${variant.label} engine is not downloaded yet.`);
    }

    const { worker, dispose } = createEngineWorker();
    const session: ActiveSession = { worker, providers: { webgpu: false, threads: 1 } };

    try {
      const ready = new Promise<ActiveSession>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent) => {
          const data = event.data as { type: string; providers?: { webgpu: boolean; threads: number }; message?: string };
          if (data.type === 'engine-ready') {
            session.providers = data.providers ?? { webgpu: false, threads: 1 };
            resolve(session);
          } else if (data.type === 'engine-error' && data.message) {
            reject(new Error(data.message));
          }
        };
        worker.onerror = (event: ErrorEvent) => {
          reject(new Error(event.message || 'The on-device engine failed to start.'));
        };
      });

      worker.postMessage({ type: 'init', assets });
      const booted = await ready;
      active = booted;
      void booted; // session kept alive until disposeLocalEngine()
      return booted;
    } catch (error: unknown) {
      dispose();
      throw error;
    } finally {
      booting = null;
    }
  })();

  return booting;
}

/**
 * Scores one recorded utterance against the target verse. `float32Pcm` must be 16 kHz mono —
 * the tajweed hook already downsamples to that rate before base64-encoding for the cloud path,
 * so the same buffer is reused here with no extra work.
 */
export async function scoreUtteranceLocally(
  variant: ModelVariant,
  verseKey: string,
  words: string[],
  float32Pcm: Float32Array
): Promise<LocalUtteranceResult> {
  const session = await bootLocalEngine(variant);
  const requestId = Date.now();

  return new Promise<LocalUtteranceResult>((resolve, reject) => {
    const priorHandler = session.worker.onmessage;
    const timer = setTimeout(() => {
      session.worker.onmessage = priorHandler;
      reject(new Error('The on-device engine timed out while scoring the recitation.'));
    }, 30_000);

    session.worker.onmessage = (event: MessageEvent) => {
      const data = event.data as { type: string; requestId?: number; scores?: EngineWordScore[]; transcript?: string; message?: string };

      if (data.type === 'score-once-result' && data.requestId === requestId) {
        clearTimeout(timer);
        session.worker.onmessage = priorHandler;
        resolve({ transcript: data.transcript ?? '', scores: data.scores ?? [], providers: session.providers });
      } else if (data.type === 'engine-error' && data.message) {
        clearTimeout(timer);
        session.worker.onmessage = priorHandler;
        reject(new Error(data.message));
      }
    };

    const buffer = float32Pcm.slice().buffer as ArrayBuffer;
    session.worker.postMessage(
      { type: 'score-once', requestId, verseKey, words, buffer },
      [buffer]
    );
  });
}

/** Releases the engine worker. Safe to call when no session exists. */
export function disposeLocalEngine(): void {
  if (active) {
    const { worker } = active;
    worker.postMessage({ type: 'reset' });
    worker.terminate();
    active = null;
  }
  booting = null;
}

/** The variant record for a CoachModelVariant id (convenience for callers holding an id). */
export function variantById(id: keyof typeof MODEL_VARIANTS): ModelVariant {
  return MODEL_VARIANTS[id];
}
