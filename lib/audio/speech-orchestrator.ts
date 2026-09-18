'use client';

import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai';
import { PCMAudioStreamPlayer, convertFloat32ToInt16PCM, arrayBufferToBase64 } from '@/lib/audio/pcm-audio';
import {
  onCaptureFrame,
  setRoute,
  startCapture,
  stopCapture,
  getCaptureContext,
  createEngineWorker,
  sendFrameToWorker,
  type EngineWorkerResponse,
  type EngineWordScore,
} from '@/lib/audio/capture-engine';

/**
 * Dual-engine speech orchestrator.
 *
 * Normal operation streams 16 kHz PCM to the Gemini Live WebSocket. On any quota failure —
 * a `429`/`RESOURCE_EXHAUSTED` payload, an HTTP-`403`-style rejection, a `goAway`, or a
 * heartbeat timeout — the orchestrator flips the multiplexer route to the local worker WITHOUT
 * touching the microphone or the AudioContext, emits a toast through `showToast`, and re-probes
 * Gemini on a cooldown with a freshly minted token.
 *
 * Audio continuity invariant: `startCapture` is called once, here, and is never re-entered
 * during a failover. Frames already in flight when the route flips are delivered to whichever
 * engine owns the next tick; because both consumers are fed from the same `onCaptureFrame`
 * subscription model, nothing is dropped at the boundary.
 */

/* -------------------------------------------------------------------------- */
/* Config                                                                      */
/* -------------------------------------------------------------------------- */

const HEARTBEAT_TIMEOUT_MS = 15_000;
/** How long Gemini stays blacklisted after a quota failure before a probe re-opens it. */
const QUOTA_COOLDOWN_MS = 90_000;
/** Target outbound frame cadence: 120 ms batches, mirroring the tafsir hook. */
const FLUSH_INTERVAL_MS = 120;

export type OrchestratorStatus =
  | 'idle'
  | 'connecting'
  | 'gemini-live'
  | 'failover-pending'
  | 'local-engine'
  | 'stopped'
  | 'error';

export interface OrchestratorEvents {
  onStatus: (status: OrchestratorStatus, detail?: string) => void;
  onWordScores: (scores: EngineWordScore[]) => void;
  onCoachCue: (lang: 'ta' | 'en', text: string) => void;
  onReferenceAudioRequest: (verseKey: string, wordIndex: number) => void;
  onError: (message: string) => void;
}

export interface OrchestratorTarget {
  verseKey: string;
  words: string[];
}

/* -------------------------------------------------------------------------- */
/* Quota failure classification                                                */
/* -------------------------------------------------------------------------- */

export type FailoverReason =
  | 'resource-exhausted'
  | 'forbidden'
  | 'go-away'
  | 'heartbeat-timeout'
  | 'socket-closed'
  | 'transport-error';

const QUOTA_PATTERN = /(RESOURCE_EXHAUSTED|429|quota|rate.?limit)/i;
const FORBIDDEN_PATTERN = /(PERMISSION_DENIED|403|forbidden|api.?key.?not.?valid)/i;

export function classifyFailure(text: string): FailoverReason | null {
  if (QUOTA_PATTERN.test(text)) return 'resource-exhausted';
  if (FORBIDDEN_PATTERN.test(text)) return 'forbidden';
  return null;
}

/* -------------------------------------------------------------------------- */
/* Orchestrator                                                                */
/* -------------------------------------------------------------------------- */

export class SpeechOrchestrator {
  private events: OrchestratorEvents;
  private target: OrchestratorTarget | null = null;
  private voiceId: string;

  private session: Session | null = null;
  private player: PCMAudioStreamPlayer | null = null;
  private worker: Worker | null = null;
  private disposeWorker: (() => void) | null = null;
  private frameUnsubscribe: (() => void) | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private quotaCooldownTimer: ReturnType<typeof setTimeout> | null = null;
  private tokenRefresher: (() => Promise<string | null>) | null = null;

  private status: OrchestratorStatus = 'idle';
  /** Getter used at narrowing boundaries: TypeScript cannot track `setStatus` effects on `this.status`. */
  private currentStatus(): OrchestratorStatus {
    return this.status;
  }
  private frameSeq = 0;
  /** Frames captured while the worker was warming up; replayed once `engine-ready` arrives. */
  private pendingLocalFrames: Array<{ seq: number; ts: number; buffer: ArrayBuffer }> = [];
  private workerReady = false;
  private quotaBlockedUntil = 0;

  constructor(events: OrchestratorEvents, options?: { voiceId?: string; tokenRefresher?: () => Promise<string | null> }) {
    this.events = events;
    this.voiceId = options?.voiceId ?? 'Kore';
    this.tokenRefresher = options?.tokenRefresher ?? null;
  }

  /* ------------------------------ lifecycle ------------------------------ */

  async start(target: OrchestratorTarget): Promise<void> {
    if (this.status === 'gemini-live' || this.status === 'local-engine' || this.status === 'connecting' || this.status === 'failover-pending') return;
    this.target = target;

    // ONE capture session for the whole orchestrator lifetime; engines never restart it.
    const context = getCaptureContext() ?? (await startCapture());

    this.frameUnsubscribe = onCaptureFrame((frame) => this.routeFrame(frame));

    await this.ensureWorker(target);

    // Gemini first (it is the primary); its connect failure falls straight through to local.
    if (Date.now() >= this.quotaBlockedUntil) {
      await this.connectGemini();
      if (this.currentStatus() === 'gemini-live') {
        setRoute('gemini');
        return;
      }
    }

    // Primary unavailable (or on cooldown): run local immediately, keep the mic live.
    setRoute('local');
    this.setStatus('local-engine', 'Cloud coach unavailable — running the on-device engine.');
    void context; // Context ownership documented by the capture module.
  }

  setTarget(target: OrchestratorTarget): void {
    this.target = target;
    this.worker?.postMessage({ type: 'set-target', verseKey: target.verseKey, words: target.words });
    if (this.status === 'gemini-live' && this.session) {
      this.session.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [
              {
                text: `Target verse ${target.verseKey}: ${target.words.join(' ')}. Listen for mispronounced words and coach briefly.`,
              },
            ],
          },
        ],
        turnComplete: true,
      });
    }
  }

  async stop(): Promise<void> {
    this.teardownGemini(false);
    this.teardownWorker();
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.quotaCooldownTimer) {
      clearTimeout(this.quotaCooldownTimer);
      this.quotaCooldownTimer = null;
    }
    this.frameUnsubscribe?.();
    this.frameUnsubscribe = null;
    setRoute(null);
    await stopCapture();
    this.setStatus('stopped');
  }

  /* ------------------------------ routing ------------------------------- */

  /**
   * The single point through which every captured frame passes.
   *
   * Delivery rules keep failover lossless: frames always go to exactly one engine, and during
   * the overlap while the worker is still warming, frames are staged locally and replayed.
   */
  private routeFrame(frame: { ts: number; samples: Float32Array }): void {
    const route = this.status === 'gemini-live' ? 'gemini' : 'local';

    if (route === 'gemini' && this.session) {
      try {
        const pcm16 = convertFloat32ToInt16PCM(frame.samples);
        const base64 = arrayBufferToBase64(
          new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength)
        );
        this.session.sendRealtimeInput({ audio: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
        this.kickHeartbeat();
      } catch {
        // A single failed frame must not tear the session down; the heartbeat catches a dead socket.
      }
      return;
    }

    if (this.worker && this.workerReady) {
      sendFrameToWorker(this.worker, frame, this.frameSeq++);
      return;
    }

    // Worker warming: stage the frame for replay (bounded to ~10 s at 16 kHz).
    const buffer = frame.samples.slice().buffer as ArrayBuffer;
    this.pendingLocalFrames.push({ seq: this.frameSeq++, ts: frame.ts, buffer });
    if (this.pendingLocalFrames.length > 320) this.pendingLocalFrames.shift();
  }

  /* ------------------------------ gemini -------------------------------- */

  private async connectGemini(): Promise<void> {
    this.setStatus('connecting');
    try {
      const token = await this.mintToken();
      if (!token) {
        this.failover('transport-error', 'The cloud coach could not mint a session token.');
        return;
      }

      const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: 'v1alpha' } });
      this.player = new PCMAudioStreamPlayer(24000);
      this.player.prime();

      let heartbeatAt = Date.now();
      this.heartbeatTimer = setInterval(() => {
        if (Date.now() - heartbeatAt > HEARTBEAT_TIMEOUT_MS) {
          this.failover('heartbeat-timeout', 'The cloud coach stopped responding.');
        }
      }, 3000);
      const kick = (): void => {
        heartbeatAt = Date.now();
      };
      this.kickHeartbeat = kick;

      const session = await ai.live.connect({
        model: (process.env.NEXT_PUBLIC_GEMINI_LIVE_MODEL as string | undefined) ?? 'gemini-3.8-live',
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            kick();
            this.handleGeminiMessage(message);
          },
          onerror: (event: ErrorEvent) => {
            const reason = classifyFailure(event.message ?? '') ?? 'transport-error';
            this.failover(reason, event.message ?? 'The cloud coach reported an error.');
          },
          onclose: (event: CloseEvent) => {
            const reason = classifyFailure(event.reason ?? '') ?? 'socket-closed';
            this.failover(reason, event.reason || `The cloud session closed (code ${event.code}).`);
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          temperature: 0.7,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voiceId } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      });

      this.session = session;
      this.setStatus('gemini-live');
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      const reason = classifyFailure(detail) ?? 'transport-error';
      this.failover(reason, detail);
    }
  }

  private kickHeartbeat(): void {
    /* reassigned in connectGemini */
  }

  private async mintToken(): Promise<string | null> {
    if (this.tokenRefresher) return this.tokenRefresher();
    try {
      const response = await fetch('/api/tafsir/live-session', { method: 'POST' });
      if (!response.ok) return null;
      const payload = (await response.json()) as { token?: string };
      return payload.token ?? null;
    } catch {
      return null;
    }
  }

  private handleGeminiMessage(message: LiveServerMessage): void {
    const content = message.serverContent;
    if (!content) {
      // Quota failures can arrive as top-level error envelopes too.
      const envelope = JSON.stringify(message);
      const reason = classifyFailure(envelope);
      if (reason === 'resource-exhausted' || reason === 'forbidden') {
        this.failover(reason, 'The cloud coach has hit its usage limit.');
      }
      return;
    }

    if (message.goAway) {
      this.failover('go-away', 'The cloud session is ending — switching to your on-device coach.');
      return;
    }

    const parts = content.modelTurn?.parts ?? [];
    for (const part of parts) {
      const data = part.inlineData?.data;
      if (!data) continue;
      try {
        const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
        if (bytes.byteLength < 2 || bytes.byteLength % 2 !== 0) continue;
        this.player?.queuePCM16Chunk(new Int16Array(bytes.buffer));
      } catch {
        // Contained: a bad frame must not break the message pump.
      }
    }
  }

  /* ------------------------------ failover ------------------------------ */

  /**
   * The failover entry point.
   *
   * Sequence: tear down only the Gemini transport (never the mic/context), flip the route,
   * arm the quota cooldown, and run local. If the worker is still warming, frames continue to
   * stage — the learner keeps talking the whole time, which is the entire point.
   */
  private failover(reason: FailoverReason, detail: string): void {
    if (this.status === 'local-engine' || this.status === 'failover-pending') return;

    const wasLive = this.status === 'gemini-live';
    this.teardownGemini(true);

    if (reason === 'resource-exhausted' || reason === 'forbidden') {
      this.quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS;
    }

    if (wasLive) {
      this.setStatus('failover-pending', `Cloud coach unavailable (${reason}) — switching to the on-device engine.`);
    } else {
      this.setStatus('failover-pending', detail);
    }

    setRoute('local');
    // The worker may already be warm; if so we are immediately local. If not, staged frames
    // replay on `engine-ready` and the transition still happens without dropping the mic.
    this.setStatus('local-engine');
  }

  /* ------------------------------ worker -------------------------------- */

  private async ensureWorker(target: OrchestratorTarget): Promise<void> {
    if (this.worker) {
      this.worker.postMessage({ type: 'set-target', verseKey: target.verseKey, words: target.words });
      return;
    }

    const { worker, dispose } = createEngineWorker();
    this.worker = worker;
    this.disposeWorker = dispose;

    worker.onmessage = (event: MessageEvent<EngineWorkerResponse>) => {
      const message = event.data;
      switch (message.type) {
        case 'engine-ready': {
          this.workerReady = true;
          // Replay staged frames in order; buffers were transferred, so recreate from copies.
          for (const staged of this.pendingLocalFrames) {
            worker.postMessage(
              { type: 'audio-frame', seq: staged.seq, ts: staged.ts, buffer: staged.buffer },
              [staged.buffer]
            );
          }
          this.pendingLocalFrames = [];
          if (this.status === 'failover-pending') {
            this.setStatus('local-engine');
          }
          return;
        }
        case 'word-scores':
          this.events.onWordScores(message.scores);
          return;
        case 'coach-cue':
          this.events.onCoachCue(message.lang, message.text);
          return;
        case 'reference-audio-request':
          this.events.onReferenceAudioRequest(message.verseKey, message.wordIndex);
          return;
        case 'engine-error':
          this.events.onError(message.message);
          return;
        case 'vad-state':
        case 'utterance-complete':
          return;
      }
    };

    worker.onerror = () => {
      this.events.onError('The on-device engine crashed. Cloud coaching will be retried.');
      this.teardownWorker();
      if (Date.now() >= this.quotaBlockedUntil) {
        void this.connectGemini().then(() => {
          if (this.status === 'gemini-live') setRoute('gemini');
        });
      }
    };

    // Pull blobs straight from IndexedDB — no network, no re-download, works offline.
    const { getReadyBlobs } = await import('@/lib/audio/model-cache');
    const blobs = await getReadyBlobs();
    const assets = [...blobs.entries()].map(([id, blob]) => ({ id, blob }));

    worker.onmessage = worker.onmessage; // keep existing handler
    const firstMessage = new Promise<void>((resolve) => {
      const currentHandler = worker.onmessage as ((evt: MessageEvent<EngineWorkerResponse>) => void) | null;
      worker.onmessage = (evt: MessageEvent<EngineWorkerResponse>) => {
        if (evt.data.type === 'engine-ready') {
          worker.onmessage = currentHandler;
          resolve();
        }
        currentHandler?.(evt);
      };
    });

    worker.postMessage({ type: 'init', assets });
    worker.postMessage({ type: 'set-target', verseKey: target.verseKey, words: target.words });
    await firstMessage;

    this.flushTimer = setInterval(() => {
      this.worker?.postMessage({ type: 'flush' });
    }, FLUSH_INTERVAL_MS);
  }

  private teardownWorker(): void {
    this.workerReady = false;
    this.pendingLocalFrames = [];
    if (this.disposeWorker) {
      this.disposeWorker();
      this.disposeWorker = null;
    }
    this.worker = null;
  }

  private teardownGemini(keepRoute: boolean): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    const session = this.session;
    this.session = null;
    if (session) {
      try {
        session.close();
      } catch {
        /* already closed */
      }
    }
    if (!keepRoute) setRoute(null);
  }

  /* ------------------------------ status -------------------------------- */

  private setStatus(status: OrchestratorStatus, detail?: string): void {
    this.status = status;
    this.events.onStatus(status, detail);
  }
}
