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
 *
 * Lifecycle, as corrected here:
 *
 *  - **One dispatcher owns `worker.onmessage`.** Scoring used to save and overwrite that handler
 *    per call, so two in-flight requests clobbered each other and the restore only happened on
 *    the timeout branch. One handler now routes every message by `requestId`, and concurrent
 *    scoring is simply safe.
 *  - **`disposeLocalEngine` actually releases the worker.** It existed but nothing called it, and
 *    it did not terminate a worker that was still booting, so a finished storyteller left a
 *    worker holding ~180 MB of ONNX models resident for the life of the page.
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

interface Waiter {
  resolve: (session: ActiveSession) => void;
  reject: (error: Error) => void;
}

interface PendingScore {
  resolve: (result: LocalUtteranceResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let active: ActiveSession | null = null;
let booting: Promise<ActiveSession> | null = null;
/** Reference to the worker being booted, so a dispose mid-boot can still terminate it. */
let bootingWorker: Worker | null = null;
let bootWaiter: Waiter | null = null;

const pendingScores = new Map<number, PendingScore>();
let nextRequestId = 1;

/** How long a single `score-once` request may take before it is abandoned. */
const SCORE_TIMEOUT_MS = 30_000;

const SESSION_CLOSED = 'The on-device engine session was closed.';

/** Fails every in-flight request, so a dead engine cannot leave a caller awaiting forever. */
function failPendingScores(error: Error): void {
  for (const [id, entry] of pendingScores) {
    clearTimeout(entry.timer);
    entry.reject(error);
    pendingScores.delete(id);
  }
}

/**
 * Installs the single message handler for a worker.
 *
 * `engine-error` is routed by state rather than broadcast: while the handshake is still pending it
 * rejects the boot, and once the engine is live it fails every in-flight score (the engine is no
 * longer usable) without touching the boot promise, which has already settled.
 */
function attachDispatcher(worker: Worker, session: ActiveSession): void {
  worker.onmessage = (event: MessageEvent) => {
    const data = event.data as {
      type: string;
      providers?: { webgpu: boolean; threads: number };
      requestId?: number;
      scores?: EngineWordScore[];
      transcript?: string;
      message?: string;
    };

    if (data.type === 'engine-ready') {
      session.providers = data.providers ?? { webgpu: false, threads: 1 };
      const waiter = bootWaiter;
      bootWaiter = null;
      waiter?.resolve(session);
      return;
    }

    if (data.type === 'engine-error') {
      const error = new Error(data.message || 'The on-device engine failed to start.');
      const waiter = bootWaiter;
      bootWaiter = null;
      if (waiter) {
        waiter.reject(error);
        return;
      }
      failPendingScores(error);
      return;
    }

    if (data.type === 'score-once-result' && typeof data.requestId === 'number') {
      const entry = pendingScores.get(data.requestId);
      if (!entry) return;
      pendingScores.delete(data.requestId);
      clearTimeout(entry.timer);
      entry.resolve({
        transcript: data.transcript ?? '',
        scores: data.scores ?? [],
        providers: session.providers,
      });
    }
  };

  worker.onerror = (event: ErrorEvent) => {
    const error = new Error(event.message || 'The on-device engine failed to start.');
    const waiter = bootWaiter;
    bootWaiter = null;
    if (waiter) {
      waiter.reject(error);
      return;
    }
    failPendingScores(error);
  };
}

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
    bootingWorker = worker;

    try {
      const ready = new Promise<ActiveSession>((resolve, reject) => {
        bootWaiter = { resolve, reject };
      });
      attachDispatcher(worker, session);

      worker.postMessage({ type: 'init', assets });
      const booted = await ready;
      active = booted;
      bootingWorker = null;
      void booted; // session kept alive until disposeLocalEngine()
      return booted;
    } catch (error: unknown) {
      bootWaiter = null;
      bootingWorker = null;
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
  const requestId = nextRequestId;
  nextRequestId += 1;

  return new Promise<LocalUtteranceResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingScores.delete(requestId);
      reject(new Error('The on-device engine timed out while scoring the recitation.'));
    }, SCORE_TIMEOUT_MS);

    pendingScores.set(requestId, { resolve, reject, timer });

    const buffer = float32Pcm.slice().buffer as ArrayBuffer;
    try {
      session.worker.postMessage({ type: 'score-once', requestId, verseKey, words, buffer }, [buffer]);
    } catch (error: unknown) {
      // A frame that cannot be posted (worker already terminated) must settle the caller now
      // rather than after the timeout.
      pendingScores.delete(requestId);
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error('The recitation could not be sent to the engine.'));
    }
  });
}

/**
 * Releases the engine worker, including one that is still booting. Safe to call when no session
 * exists. The next `scoreUtteranceLocally` re-boots from the cached blobs.
 */
export function disposeLocalEngine(): void {
  const closed = new Error(SESSION_CLOSED);

  const waiter = bootWaiter;
  bootWaiter = null;
  waiter?.reject(closed);

  failPendingScores(closed);

  if (bootingWorker) {
    try {
      bootingWorker.terminate();
    } catch {
      /* already terminated */
    }
    bootingWorker = null;
  }

  if (active) {
    const { worker } = active;
    try {
      worker.postMessage({ type: 'reset' });
      worker.terminate();
    } catch {
      /* already terminated */
    }
    active = null;
  }

  booting = null;
}

/** The variant record for a CoachModelVariant id (convenience for callers holding an id). */
export function variantById(id: keyof typeof MODEL_VARIANTS): ModelVariant {
  return MODEL_VARIANTS[id];
}
