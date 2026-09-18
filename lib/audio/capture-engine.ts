'use client';

/**
 * Low-latency capture engine and stream multiplexer.
 *
 * The `AudioContext` and the AudioWorklet node are owned by THIS module, never by an engine.
 * Gemini Live and the local worker are only *consumers* of the frame stream, which is what makes
 * failover seamless: switching engines is a flag flip on the multiplexer — the microphone, the
 * capture node and the audio clock are never restarted, so no frame is lost at the boundary.
 *
 * Frames are `Float32Array`s at the context's native rate; consumers downsample themselves (the
 * Gemini path already does; the worker path does so explicitly). Zero-copy: each frame's
 * ArrayBuffer is transferred, never copied.
 */

/**
 * Inline AudioWorklet processor. Like the existing tafsir capture, the processor source is
 * registered from a Blob URL so no separate public/ asset must round-trip the bundler.
 */
const CAPTURE_WORKLET_SOURCE = `
class QuranCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length > 0) {
      // Copied once here because the underlying buffer is reused by the audio thread.
      this.port.postMessage(channel.slice(0));
    }
    return true;
  }
}
registerProcessor('quran-capture', QuranCaptureProcessor);
`;

/** One captured frame: samples at the AudioContext rate, plus a monotonic timestamp. */
export interface AudioFrame {
  /** Monotonic ms, from `performance.now()` at capture time. */
  ts: number;
  samples: Float32Array;
}

export type CaptureEngineState = 'idle' | 'starting' | 'running' | 'error';

/** Who currently receives frames. `null` means capture runs but nobody is subscribed yet. */
export type RouteTarget = 'gemini' | 'local' | null;

interface CaptureEngine {
  state: CaptureEngineState;
  route: RouteTarget;
  context: AudioContext | null;
  stream: MediaStream | null;
  sourceNode: MediaStreamAudioSourceNode | null;
  worklet: AudioWorkletNode | null;
  sink: GainNode | null;
  onError: ((message: string) => void) | null;
}

const engine: CaptureEngine = {
  state: 'idle',
  route: null,
  context: null,
  stream: null,
  sourceNode: null,
  worklet: null,
  sink: null,
  onError: null,
};

let frameListeners: Array<(frame: AudioFrame) => void> = [];
let workletLoadPromise: Promise<void> | null = null;

export function onCaptureFrame(listener: (frame: AudioFrame) => void): () => void {
  frameListeners.push(listener);
  return () => {
    frameListeners = frameListeners.filter((entry) => entry !== listener);
  };
}

export function setRoute(route: RouteTarget): void {
  engine.route = route;
}

export function getRoute(): RouteTarget {
  return engine.route;
}

export function getCaptureState(): CaptureEngineState {
  return engine.state;
}

export function getCaptureContext(): AudioContext | null {
  return engine.context;
}

export function setCaptureErrorHandler(handler: ((message: string) => void) | null): void {
  engine.onError = handler;
}

/**
 * Starts the microphone and the 16 kHz context exactly once per page session.
 *
 * `sampleRate: 16000` is requested explicitly: Chromium resamples the hardware rate in the graph,
 * so downstream (Gemini's `audio/pcm;rate=16000`, Silero's 16 kHz input) needs no resampling on
 * the happy path, and the worker path only handles the legacy 48 kHz devices where the request
 * cannot be honoured. The context is deliberately NOT closed by engine changes — only by this
 * module's `stopCapture` (or page teardown).
 */
export async function startCapture(): Promise<AudioContext> {
  if (engine.context && engine.state === 'running') return engine.context;
  engine.state = 'starting';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    engine.stream = stream;

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const context = new AudioContextClass({ sampleRate: 16000 });
    engine.context = context;

    if (context.state === 'suspended') {
      await context.resume().catch(() => undefined);
    }

    const source = context.createMediaStreamSource(stream);
    engine.sourceNode = source;

    if (!workletLoadPromise) {
      const blob = new Blob([CAPTURE_WORKLET_SOURCE], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      workletLoadPromise = context.audioWorklet
        .addModule(url)
        .finally(() => URL.revokeObjectURL(url));
    }
    await workletLoadPromise;

    const worklet = new AudioWorkletNode(context, 'quran-capture');
    engine.worklet = worklet;

    worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (engine.state !== 'running') return;
      const frame: AudioFrame = { ts: performance.now(), samples: event.data };
      for (const listener of frameListeners) listener(frame);
    };

    // Zero-gain sink keeps the graph pulled without echoing the mic to the speakers.
    const sink = context.createGain();
    sink.gain.value = 0;
    engine.sink = sink;

    source.connect(worklet);
    worklet.connect(sink);
    sink.connect(context.destination);

    engine.state = 'running';
    return context;
  } catch (error: unknown) {
    engine.state = 'error';
    await teardownGraph();
    const message =
      error instanceof Error && error.name === 'NotAllowedError'
        ? 'Microphone access was denied. Enable the microphone and try again.'
        : 'The microphone could not be started. Check that no other app is using it.';
    engine.onError?.(message);
    throw error;
  }
}

async function teardownGraph(): Promise<void> {
  if (engine.worklet) {
    engine.worklet.port.onmessage = null;
    try {
      engine.worklet.disconnect();
    } catch {
      /* already detached */
    }
    engine.worklet = null;
  }
  if (engine.sourceNode) {
    try {
      engine.sourceNode.disconnect();
    } catch {
      /* already detached */
    }
    engine.sourceNode = null;
  }
  if (engine.sink) {
    try {
      engine.sink.disconnect();
    } catch {
      /* already detached */
    }
    engine.sink = null;
  }
  if (engine.stream) {
    for (const track of engine.stream.getTracks()) track.stop();
    engine.stream = null;
  }
  const context = engine.context;
  engine.context = null;
  if (context && context.state !== 'closed') {
    void context.close().catch(() => undefined);
  }
  workletLoadPromise = null;
}

/** Stops capture entirely (user pressed stop, or the page is unmounting). */
export async function stopCapture(): Promise<void> {
  engine.state = 'idle';
  engine.route = null;
  await teardownGraph();
}

/* -------------------------------------------------------------------------- */
/* Engine worker bridge                                                        */
/* -------------------------------------------------------------------------- */

/** Typed messages the engine worker accepts. Mirrored in `engine.worker.ts`. */
export type EngineWorkerRequest =
  | { type: 'init'; assets: Array<{ id: string; blob: Blob }> }
  | { type: 'audio-frame'; seq: number; ts: number; buffer: ArrayBuffer }
  | { type: 'set-target'; verseKey: string; words: string[] }
  | { type: 'flush' }
  | { type: 'reset' };

export interface EngineWordScore {
  verseKey: string;
  wordIndex: number;
  word: string;
  /** Goodness-of-pronunciation log-likelihood ratio (higher = closer to canonical). */
  gop: number;
  verdict: 'correct' | 'mispronounced' | 'unknown';
}

export type EngineWorkerResponse =
  | { type: 'engine-ready'; providers: { webgpu: boolean; threads: number } }
  | { type: 'engine-error'; fatal: boolean; message: string }
  | { type: 'vad-state'; speaking: boolean; level: number }
  | { type: 'utterance-complete' }
  | { type: 'word-scores'; verseKey: string; scores: EngineWordScore[] }
  | { type: 'coach-cue'; lang: 'ta' | 'en'; text: string }
  | { type: 'reference-audio-request'; verseKey: string; wordIndex: number };

/**
 * Creates the engine worker and returns a thin typed wrapper.
 *
 * The worker is constructed from a bundled URL (`new Worker(new URL(...))`), which webpack 5
 * (and therefore Next 15) understands natively — no separate build step.
 */
export function createEngineWorker(): { worker: Worker; dispose: () => void } {
  const worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
  return {
    worker,
    dispose: () => {
      worker.terminate();
    },
  };
}

/** Sends one captured frame to the worker as a zero-copy transfer. */
export function sendFrameToWorker(worker: Worker, frame: AudioFrame, seq: number): void {
  // `slice` clones the underlying storage so the transfer does not detach a buffer the
  // multiplexer might still hand to the Gemini path during the failover overlap window.
  const buffer = frame.samples.slice().buffer as ArrayBuffer;
  worker.postMessage({ type: 'audio-frame', seq, ts: frame.ts, buffer } satisfies EngineWorkerRequest, [
    buffer,
  ]);
}
