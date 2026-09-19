'use client';

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { LiveServerMessage, Session } from '@google/genai';
import {
  PCMAudioStreamPlayer,
  convertFloat32ToInt16PCM,
  arrayBufferToBase64,
  computeRmsVolume,
  downsampleBuffer,
  RECORDING_SAMPLE_RATE,
  PLAYBACK_SAMPLE_RATE,
} from '@/lib/audio/pcm-audio';
import { resolveAudioContextConstructor } from '@/lib/audio/audio-context';
import { MODEL_VARIANTS, type ModelVariant } from '@/lib/audio/model-registry';
import { buildLessonContextPacket, buildStorytellerInstruction } from '@/lib/tafsir/prompts';
import {
  liveSessionTicketSchema,
  type LiveStorytellerStatus,
  type LiveTranscriptLine,
  type TafsirLanguage,
  type TafsirLessonSegment,
} from '@/lib/tafsir/types';

/**
 * Gemini Live storyteller session.
 *
 * Everything stateful about the microphone, the WebSocket and the audio clock lives in this
 * one hook, which is imported by a single leaf Client Component. Nothing here renders, so
 * audio flowing at 8 chunks a second does not touch the React tree: the level meter is
 * published through a ref and sampled by a `requestAnimationFrame` loop in the waveform.
 *
 * Lifecycle guarantees, in the spirit of `use-live-tajweed`:
 *
 *  - the microphone, the AudioContext, the node graph, the flush timer and the WebSocket are
 *    all released by `stop()` and by unmount, even if the session never connected;
 *  - a permission prompt that resolves *after* the learner navigated away cannot leak a live
 *    microphone, because the pending start compares a generation counter;
 *  - a stale session can never write into a newer one, because every async step re-checks
 *    that it still belongs to the current generation.
 */

/** Raw capture is batched to 120 ms before transmission, instead of one frame per 2.6 ms. */
const FLUSH_INTERVAL_MS = 120;

/**
 * How long to wait for the Live handshake (`setupComplete`) before giving up.
 *
 * The SDK's `connect()` awaits `setupComplete` with no timeout of its own, so a socket that
 * opens and is then rejected leaves `connect()` pending forever: the bar would sit on
 * "Connecting…" with nothing reported, and the learner would never learn what happened.
 */
const HANDSHAKE_TIMEOUT_MS = 15_000;

/**
 * Rendered transcript lines kept in memory.
 *
 * The transcript was unbounded: a long lesson appended every spoken line for as long as it ran,
 * and each append copied the whole array. The oldest lines are dropped once this many are held —
 * far more than fits on screen, so the visible behaviour is unchanged.
 */
const MAX_TRANSCRIPT_LINES = 200;

/**
 * Bounded automatic recovery from a dropped or rejected Live socket.
 *
 * A Live session can end for reasons that have nothing to do with the learner: the ephemeral
 * token reaches its limit, the network hiccups, or the server recycles the session. Every
 * reconnect mints a *fresh* single-use token, so the retries are capped and spaced
 * exponentially rather than retried forever — an unbounded loop would burn the learner's
 * quota in silence while the UI pretended to be busy. Past the cap the learner is given an
 * explicit "tap start", never a dead bar.
 */
const MAX_AUTO_RECONNECTS = 3;
const RECONNECT_BASE_DELAY_MS = 1_200;
const RECONNECT_MAX_DELAY_MS = 8_000;

/**
 * How long a session must stay live before it earns a fresh retry budget.
 *
 * Clearing the budget on the handshake alone is not a real bound. A server that accepts
 * `setupComplete` and then drops the socket — a flapping endpoint, or an immediate `goAway` —
 * would reset the counter on every attempt and reconnect forever, minting a fresh token each
 * time. That is precisely the silent quota burn the cap exists to prevent. Only a session
 * that was live long enough to be useful earns the reset, so a flapping endpoint exhausts its
 * three attempts and then hands control back to the learner.
 */
const RECONNECT_STABLE_AFTER_MS = 10_000;

/**
 * Renders a socket close into something an operator can act on.
 *
 * The code and reason are the only diagnostic the server offers for a rejected session. The
 * reason string is precisely what identified a non-existent Live model during development, so
 * it is always surfaced rather than discarded.
 */
function describeClose(event: CloseEvent | undefined): string {
  const reason = event?.reason?.trim();
  const code = typeof event?.code === 'number' ? event.code : null;
  if (!reason) return code === null ? 'the connection closed' : `the connection closed (code ${code})`;
  return `the connection closed (code ${code ?? 'unknown'}): ${reason}`;
}

/**
 * Inline AudioWorklet processor.
 *
 * `AudioWorkletNode` runs on the audio thread, so capture continues smoothly while React
 * renders, animates the waveform and streams transcripts. The older `ScriptProcessorNode`
 * path runs on the main thread and drops frames under exactly that load, so it is kept only
 * as a fallback for browsers without `addModule`.
 */
const MIC_WORKLET_SOURCE = `
class TafsirMicCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length > 0) {
      this.port.postMessage(channel.slice(0));
    }
    return true;
  }
}
registerProcessor('tafsir-mic-capture', TafsirMicCapture);
`;

export interface UseGeminiLiveTafsirOptions {
  /** Current lesson segment. Context is re-injected whenever this changes. */
  segment: TafsirLessonSegment | null;
  /** Which language the child reads in; drives the storyteller's code-switching. */
  language: TafsirLanguage;
  /** Gemini prebuilt voice name, from the learner's saved preference. */
  voiceId?: string;
}

export interface UseGeminiLiveTafsirResult {
  status: LiveStorytellerStatus;
  errorMessage: string | null;
  /** Session state, reported so the UI can say which voice model connected. */
  model: string | null;
  /** Live level 0–100. Read from a ref by the waveform; never causes a render. */
  micLevelRef: MutableRefObject<number>;
  transcript: LiveTranscriptLine[];
  /** True while the child's microphone is silenced (storytelling keeps playing). */
  isMuted: boolean;
  start: () => void;
  stop: () => void;
  toggleMute: () => void;
  clearTranscript: () => void;
  /** Sends a typed question and asks Ameen to answer it aloud. */
  askAmeen: (question: string) => void;
  /** Makes Ameen tell the story of the currently loaded ayah. */
  tellCurrentStory: () => void;
}

function readErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'object' && payload !== null) {
    const message = (payload as Record<string, unknown>).error;
    if (typeof message === 'string' && message.trim().length > 0) return message.trim();
  }
  return fallback;
}

export function useGeminiLiveTafsir({
  segment,
  language,
  voiceId = 'Kore',
}: UseGeminiLiveTafsirOptions): UseGeminiLiveTafsirResult {
  const [status, setStatus] = useState<LiveStorytellerStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<LiveTranscriptLine[]>([]);
  const [isMuted, setIsMuted] = useState(false);

  const micLevelRef = useRef<number>(0);

  const sessionRef = useRef<Session | null>(null);
  const playerRef = useRef<PCMAudioStreamPlayer | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sinkRef = useRef<GainNode | null>(null);
  const rawChunksRef = useRef<Float32Array[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /**
   * Frame sink override for local mode: when set, capture frames go to the local turn detector
   * instead of the Gemini chunk buffer. Null in cloud mode.
   */
  const localFrameSinkRef = useRef<((frame: Float32Array) => void) | null>(null);
  const localTurnBufferRef = useRef<Float32Array[]>([]);
  /** The resolved on-device variant while a local session runs; null in cloud mode. */
  const localVariantRef = useRef<ModelVariant | null>(null);
  /**
   * The local-mode answerer, installed by `runLocalStorytellerSession`. `askAmeen` routes
   * through it when a local session is active, so typed questions work in both engines.
   */
  const localAskRef = useRef<((question: string) => void) | null>(null);

  /** Bumped by `stop` and by unmount so a pending start cannot attach to a dead session. */
  const generationRef = useRef(0);
  const activeRef = useRef(false);
  /** True only once the server has confirmed the Live handshake (`setupComplete`). */
  const establishedRef = useRef(false);
  /**
   * The most specific failure reported so far.
   *
   * `onerror` fires before `onclose` on a failed socket, and `onclose` used to overwrite that
   * precise message with a generic "session ended" — which is what made this undiagnosable.
   */
  const failureRef = useRef<string | null>(null);
  /**
   * True while an automatic reconnect is queued.
   *
   * The failure paths check this so a terminal error cannot overwrite the recovery message
   * with "stopped" while a reconnect is still on its way — which is exactly the kind of
   * contradictory state that trains a child to stop trusting the button.
   */
  const reconnectingRef = useRef(false);
  /** Consecutive auto-reconnect attempts used since the last stable session. */
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** When the current session completed its handshake, or `null` if it never did. */
  const establishedAtRef = useRef<number | null>(null);
  /**
   * Set by the reconnect timer immediately before it calls `start`, and consumed by `start`.
   *
   * Without it an automatic retry is indistinguishable from a deliberate tap, and `start`
   * would clear the attempt budget on every retry — so the cap could never be reached and a
   * flapping endpoint would reconnect forever, minting a fresh token each time.
   */
  const autoStartRef = useRef(false);
  /**
   * Latest `start`, reached through a ref so the reconnect timer can re-enter it without
   * making `start` depend on the scheduler that depends on `start`.
   */
  const startRef = useRef<(() => void) | null>(null);
  /**
   * Starts as `true`: nothing may reconnect before the learner has asked for a session.
   * Set to `false` by `start`, and back to `true` by `stop` and by unmount, so an explicit
   * stop always wins over a queued reconnect.
   */
  const stoppedByUserRef = useRef(true);
  const mutedRef = useRef(false);
  const segmentRef = useRef(segment);
  const languageRef = useRef(language);
  /** Id of the transcript line currently being appended to, per speaker. */
  const openLineRef = useRef<{ ameen: string | null; student: string | null }>({
    ameen: null,
    student: null,
  });

  useEffect(() => {
    segmentRef.current = segment;
  }, [segment]);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    mutedRef.current = isMuted;
  }, [isMuted]);

  /** Monotonic source of transcript line ids, so trimming the list cannot cause a collision. */
  const transcriptSeqRef = useRef(0);

  /* ---------------------------------------------------------------------- */
  /* Transcript                                                              */
  /* ---------------------------------------------------------------------- */

  /**
   * Keeps the rendered transcript bounded.
   *
   * Nothing ever trimmed this array, so a long lesson accumulated every spoken line for the whole
   * session (each append also copying the array). A line that is dropped while it is still the
   * open line has its id cleared, so the next chunk starts a fresh line rather than appending to
   * a line that is no longer in the list.
   */
  const capTranscript = useCallback((lines: LiveTranscriptLine[]): LiveTranscriptLine[] => {
    if (lines.length <= MAX_TRANSCRIPT_LINES) return lines;

    const kept = lines.slice(lines.length - MAX_TRANSCRIPT_LINES);
    const keptIds = new Set(kept.map((line) => line.id));
    for (const speaker of ['ameen', 'student'] as const) {
      const openId = openLineRef.current[speaker];
      if (openId !== null && !keptIds.has(openId)) openLineRef.current[speaker] = null;
    }
    return kept;
  }, []);

  const appendTranscript = useCallback(
    (speaker: 'ameen' | 'student', text: string): void => {
      if (text.length === 0) return;
      const chunk = text;
      setTranscript((previous) => {
        const openId = openLineRef.current[speaker];
        if (openId) {
          const index = previous.findIndex((line) => line.id === openId);
          if (index !== -1) {
            const next = [...previous];
            const openLine = next[index];
            if (openLine) next[index] = { ...openLine, text: `${openLine.text}${chunk}` };
            return next;
          }
        }
        transcriptSeqRef.current += 1;
        const id = `${speaker}-${transcriptSeqRef.current}`;
        openLineRef.current[speaker] = id;
        return capTranscript([...previous, { id, speaker, text: chunk, at: Date.now() }]);
      });
    },
    [capTranscript]
  );

  const clearTranscript = useCallback((): void => {
    openLineRef.current = { ameen: null, student: null };
    setTranscript([]);
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Audio teardown                                                          */
  /* ---------------------------------------------------------------------- */

  const cleanupAudio = useCallback((): void => {
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    rawChunksRef.current = [];

    if (workletRef.current) {
      workletRef.current.port.onmessage = null;
      try {
        workletRef.current.disconnect();
      } catch {
        /* already detached */
      }
      workletRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      try {
        processorRef.current.disconnect();
      } catch {
        /* already detached */
      }
      processorRef.current = null;
    }

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        /* already detached */
      }
      sourceNodeRef.current = null;
    }

    if (sinkRef.current) {
      try {
        sinkRef.current.disconnect();
      } catch {
        /* already detached */
      }
      sinkRef.current = null;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }

    const context = inputContextRef.current;
    inputContextRef.current = null;
    if (context && context.state !== 'closed') {
      void context.close().catch(() => undefined);
    }

    micLevelRef.current = 0;
  }, []);

  const cleanupSession = useCallback((): void => {
    localFrameSinkRef.current = null;
    localTurnBufferRef.current = [];
    localVariantRef.current = null;
    localAskRef.current = null;
    cleanupAudio();

    /*
     * Release the on-device engine if this session booted one.
     *
     * `disposeLocalEngine` is a no-op when no session exists and the cloud path never boots one,
     * so calling it unconditionally is safe. Without it, a finished storyteller left a worker
     * holding the whole cached model set — roughly 180 MB of ONNX weights — resident for the life
     * of the page; nothing else in the app ever released it.
     */
    void import('@/lib/audio/local-engine-session')
      .then((module) => module.disposeLocalEngine())
      .catch(() => undefined);

    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) {
      try {
        session.close();
      } catch {
        /* already closed */
      }
    }

    const player = playerRef.current;
    playerRef.current = null;
    player?.close();
  }, [cleanupAudio]);

  /* ---------------------------------------------------------------------- */
  /* Bounded automatic recovery                                             */
  /* ---------------------------------------------------------------------- */

  const cancelReconnect = useCallback((): void => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectingRef.current = false;
  }, []);

  /**
   * Queues one backed-off reconnect. Returns `false` when the attempt budget is spent or the
   * learner has stopped, so the caller can report a terminal reason instead of silence.
   */
  const scheduleReconnect = useCallback((reason: string): boolean => {
    if (stoppedByUserRef.current) return false;

    // A session that stayed live long enough to be useful clears the budget; one that dropped
    // straight after its handshake does not, so a flapping endpoint cannot be retried forever.
    const establishedAt = establishedAtRef.current;
    if (establishedAt !== null && Date.now() - establishedAt >= RECONNECT_STABLE_AFTER_MS) {
      reconnectAttemptsRef.current = 0;
    }
    establishedAtRef.current = null;

    if (reconnectAttemptsRef.current >= MAX_AUTO_RECONNECTS) return false;

    reconnectAttemptsRef.current += 1;
    const attempt = reconnectAttemptsRef.current;
    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1), RECONNECT_MAX_DELAY_MS);

    reconnectingRef.current = true;
    failureRef.current = null;
    setStatus('reconnecting');
    setErrorMessage(
      `Ameen's voice session dropped (${reason}). Reconnecting — attempt ${attempt} of ${MAX_AUTO_RECONNECTS}…`
    );

    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (stoppedByUserRef.current) return;
      // `start` refuses to run while a session is considered active, so clear that flag: the
      // socket that prompted this reconnect is already gone, and the flag is the only thing
      // that would block the retry.
      activeRef.current = false;
      autoStartRef.current = true;
      startRef.current?.();
    }, delay);

    return true;
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Outbound audio                                                          */
  /* ---------------------------------------------------------------------- */

  /**
   * Encodes and sends the buffered capture.
   *
   * Down-sampling happens once per batch rather than once per worklet frame: resampling many
   * tiny frames would blur sample boundaries and add audible artefacts for no benefit.
   */
  const flushAudio = useCallback((): void => {
    const session = sessionRef.current;
    if (!session || !activeRef.current) return;

    const chunks = rawChunksRef.current;
    if (chunks.length === 0) return;
    rawChunksRef.current = [];

    const inputRate = inputContextRef.current?.sampleRate ?? RECORDING_SAMPLE_RATE;

    let total = 0;
    for (const chunk of chunks) total += chunk.length;
    if (total === 0) return;

    const merged = new Float32Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    // The meter keeps reading while muted, so the child can see the microphone is hearing
    // them even though nothing is being transmitted.
    micLevelRef.current = computeRmsVolume(merged);
    if (mutedRef.current) return;

    try {
      const downsampled = downsampleBuffer(merged, inputRate, RECORDING_SAMPLE_RATE);
      const pcm16 = convertFloat32ToInt16PCM(downsampled);
      const data = arrayBufferToBase64(
        new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength)
      );
      session.sendRealtimeInput({ audio: { data, mimeType: 'audio/pcm;rate=16000' } });
    } catch (error: unknown) {
      // A single failed frame must not tear the session down.
      console.warn('Live audio frame could not be sent:', error);
    }
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Inbound messages                                                        */
  /* ---------------------------------------------------------------------- */

  const handleServerMessage = useCallback(
    (message: LiveServerMessage, generation: number): void => {
      if (generation !== generationRef.current) return;

      const content = message.serverContent;
      if (!content) return;

      if (content.interrupted) {
        // The child started talking over Ameen: empty the playback queue immediately, which
        // is what keeps the reply from resuming mid-sentence after the interruption.
        playerRef.current?.stopAll();
        openLineRef.current.ameen = null;
        setStatus((previous) => (previous === 'idle' ? previous : 'interrupted'));
      }

      const parts = content.modelTurn?.parts ?? [];
      for (const part of parts) {
        const data = part.inlineData?.data;
        if (!data) continue;

        /*
         * Nothing in here is allowed to throw.
         *
         * This runs inside the Live SDK's message dispatch, so an exception does not merely
         * lose one frame — it breaks the message pump for the remainder of the session.
         * Playback is the only step that touches browser audio APIs, so a failure there is
         * contained and reported instead of being allowed to take the session down.
         */
        try {
          const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
          // 16-bit PCM is only addressable through Int16Array when the byte count is even.
          if (bytes.byteLength < 2 || bytes.byteLength % 2 !== 0) continue;

          playerRef.current?.queuePCM16Chunk(new Int16Array(bytes.buffer));
        } catch (error: unknown) {
          console.warn('A Live audio chunk could not be played:', error);
        }
      }
      if (parts.some((part) => part.inlineData?.data)) {
        setStatus((previous) => (previous === 'idle' ? previous : 'speaking'));
      }

      if (content.outputTranscription?.text) {
        appendTranscript('ameen', content.outputTranscription.text);
      }
      if (content.inputTranscription?.text) {
        appendTranscript('student', content.inputTranscription.text);
      }

      if (content.turnComplete) {
        // A finished turn closes the transcript line so the next one starts fresh.
        openLineRef.current.ameen = null;
        setStatus((previous) => (previous === 'interrupted' || previous === 'idle' ? previous : 'active'));
      }

      if (message.goAway) {
        /*
         * The server announces the end of a session before closing it. The token is
         * single-use, so there is nothing to reconnect with here — the learner is told to
         * start a fresh lesson rather than being left with a session that dies mid-sentence.
         */
        console.warn('Gemini Live will close this session soon:', message.goAway.timeLeft ?? '(no time given)');
        failureRef.current = null;
        setErrorMessage(
          'This voice session is reaching its time limit. Ameen will continue automatically in a moment.'
        );
      }
    },
    [appendTranscript]
  );

  /* ---------------------------------------------------------------------- */
  /* Context injection                                                       */
  /* ---------------------------------------------------------------------- */

  const currentContextPacket = useCallback((): string | null => {
    const current = segmentRef.current;
    if (!current) return null;
    return buildLessonContextPacket(current, languageRef.current);
  }, []);

  const tellCurrentStory = useCallback((): void => {
    const session = sessionRef.current;
    if (!session) return;

    const packet = currentContextPacket();
    openLineRef.current.ameen = null;

    /*
     * The opening turn is always sent, even before the lesson has finished assembling.
     *
     * Returning silently when the packet was not ready left the child with a live session and
     * total silence, because the microphone prompt can be answered long before the exegesis
     * has loaded. The fallback asks Ameen only to greet and carries no scripture, so nothing
     * can be recited that was not verified.
     */
    session.sendClientContent({
      turns: [
        {
          role: 'user',
          parts: [
            {
              text: packet
                ? `${packet}\n\nNow tell me the story of this ayah, as we agreed.`
                : 'The lesson for this ayah is still being prepared. Greet the child warmly as Ustadh Ameen and tell them you are getting the ayah ready. Do not recite or paraphrase any Quranic text yet.',
            },
          ],
        },
      ],
      turnComplete: true,
    });
  }, [currentContextPacket]);

  const askAmeen = useCallback((question: string): void => {
    const trimmed = question.trim();
    if (trimmed.length === 0) return;

    // Local mode answers through the BYOK chat loop; cloud mode through the Live session.
    const localAsk = localAskRef.current;
    if (localAsk) {
      localAsk(trimmed);
      return;
    }

    const session = sessionRef.current;
    if (!session) return;
    openLineRef.current.ameen = null;
    session.sendClientContent({
      turns: [{ role: 'user', parts: [{ text: trimmed }] }],
      turnComplete: true,
    });
  }, []);

  /**
   * Re-injects the lesson context whenever the ayah changes mid-session.
   *
   * `turnComplete: false` on purpose: navigating to the next verse while Ameen is talking
   * should update what he knows, not interrupt the child with unprompted speech. The
   * "Tell me the story" control sends the same packet with `turnComplete: true` when the
   * child is ready.
   */
  const lastSegmentKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = segment ? `${segment.surah}:${segment.ayah}` : null;
    if (key === lastSegmentKeyRef.current) return;
    lastSegmentKeyRef.current = key;

    /*
     * Recording the key before the session exists is deliberate, not a dropped injection.
     *
     * A change that arrives while the socket is still connecting has no session to send to, and
     * the opening beat (`tellCurrentStory`, sent immediately after the handshake, and
     * `answerLocally` on the local path) already delivers the full packet for whatever verse is
     * current at that moment. Re-sending here as well would inject the same context twice.
     */
    const session = sessionRef.current;
    if (!session || !segment) return;

    session.sendClientContent({
      turns: [{ role: 'user', parts: [{ text: buildLessonContextPacket(segment, language) }] }],
      turnComplete: false,
    });
  }, [segment, language]);

  /* ---------------------------------------------------------------------- */
  /* Capture setup                                                           */
  /* ---------------------------------------------------------------------- */

  const attachMicrophone = useCallback(
    async (generation: number): Promise<boolean> => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // The permission prompt may have been answered after a stop or a navigation; never
      // attach a granted stream to a session nobody is watching.
      if (generation !== generationRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return false;
      }

      streamRef.current = stream;

      const AudioContextClass = resolveAudioContextConstructor();
      const context = new AudioContextClass();
      inputContextRef.current = context;

      const source = context.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      const onFrame = (frame: Float32Array): void => {
        if (!activeRef.current) return;
        // Local mode routes frames to the on-device turn detector instead of the Gemini buffer.
        const localSink = localFrameSinkRef.current;
        if (localSink) {
          localSink(frame);
          return;
        }
        rawChunksRef.current.push(frame);
      };

      let usedWorklet = false;
      if (typeof context.audioWorklet?.addModule === 'function') {
        try {
          const blob = new Blob([MIC_WORKLET_SOURCE], { type: 'application/javascript' });
          const url = URL.createObjectURL(blob);
          try {
            await context.audioWorklet.addModule(url);
          } finally {
            URL.revokeObjectURL(url);
          }

          if (generation !== generationRef.current) return false;

          const worklet = new AudioWorkletNode(context, 'tafsir-mic-capture');
          worklet.port.onmessage = (event: MessageEvent<Float32Array>) => onFrame(event.data);
          workletRef.current = worklet;

          // A zero-gain sink keeps the graph pulled without echoing the microphone back to
          // the speakers, which would otherwise feed Ameen his own voice.
          const sink = context.createGain();
          sink.gain.value = 0;
          sinkRef.current = sink;

          source.connect(worklet);
          worklet.connect(sink);
          sink.connect(context.destination);
          usedWorklet = true;
        } catch (error: unknown) {
          console.warn('AudioWorklet capture unavailable; falling back to ScriptProcessor:', error);
        }
      }

      if (!usedWorklet) {
        const processor = context.createScriptProcessor(2048, 1, 1);
        processorRef.current = processor;
        const sink = context.createGain();
        sink.gain.value = 0;
        sinkRef.current = sink;

        processor.onaudioprocess = (event) => {
          if (!activeRef.current) return;
          const input = event.inputBuffer.getChannelData(0);
          onFrame(Float32Array.from(input));
        };

        source.connect(processor);
        processor.connect(sink);
        sink.connect(context.destination);
      }

      if (context.state === 'suspended') {
        await context.resume().catch(() => undefined);
      }

      flushTimerRef.current = setInterval(flushAudio, FLUSH_INTERVAL_MS);
      return true;
    },
    [flushAudio]
  );

  /* ---------------------------------------------------------------------- */
  /* Session start / stop                                                    */
  /* ---------------------------------------------------------------------- */

  /* ---------------------------------------------------------------------- */
  /* Local (on-device) storyteller session                                    */
  /* ---------------------------------------------------------------------- */

  /**
   * Runs the storyteller conversation on the on-device engine: local Whisper transcription
   * per turn, the BYOK chat route for the reply, and browser speech synthesis for playback.
   * Entered when the module's engine choice resolves to a local variant; never touches the
   * Gemini Live socket.
   */
  const runLocalStorytellerSession = useCallback(
    async (generation: number): Promise<void> => {
      const { scoreUtteranceLocally } = await import('@/lib/audio/local-engine-session');

      const speak = (text: string): void => {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
        try {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = languageRef.current === 'ta' ? 'ta-IN' : 'en-US';
          const voices = window.speechSynthesis.getVoices();
          const match = voices.find((voice) => voice.lang.startsWith(utterance.lang.slice(0, 2)));
          if (match) utterance.voice = match;
          utterance.onstart = () => setStatus('speaking');
          utterance.onend = () => setStatus((previous) => (previous === 'speaking' ? 'active' : previous));
          window.speechSynthesis.speak(utterance);
        } catch {
          /* best-effort */
        }
      };

      /**
       * The learner's stored provider, read once per session.
       *
       * On-device mode was intended to work without a configured server key, but this turn is
       * answered by `/api/chat` and no `providerConfig` was ever sent — so a learner who chose
       * the on-device engine *because* the cloud is not configured got a 503 instead of an
       * answer, and one who had configured their own key silently spent the server's quota.
       */
      let providerConfigPromise: Promise<Record<string, unknown> | undefined> | null = null;
      const loadProviderConfig = (): Promise<Record<string, unknown> | undefined> => {
        providerConfigPromise ??= (async () => {
          try {
            const [{ db }, { decryptApiKey }] = await Promise.all([
              import('@/lib/db'),
              import('@/lib/db/crypto'),
            ]);
            const provider = await db.aiProviders.filter((row) => row.isDefault).first();
            if (!provider) return undefined;

            let apiKey: string | undefined;
            if (provider.encryptedKey) {
              // `decryptApiKey` resolves to an empty string when a value cannot be read, which
              // must be treated as "no usable key" rather than sent as one.
              const decrypted = await decryptApiKey(provider.encryptedKey);
              apiKey = decrypted.length > 0 ? decrypted : undefined;
            }
            return {
              type: provider.type,
              baseUrl: provider.baseUrl,
              selectedModel: provider.selectedModel,
              ...(apiKey ? { apiKey } : {}),
            };
          } catch (error: unknown) {
            console.warn('The provider configuration could not be read for the on-device storyteller:', error);
            return undefined;
          }
        })();
        return providerConfigPromise;
      };

      const answerLocally = async (question: string): Promise<void> => {
        const current = segmentRef.current;
        const packet = current
          ? buildStorytellerInstruction(current, languageRef.current)
          : 'You are Ustadh Ameen. The lesson is still loading — greet the child warmly and say the ayah is being prepared. Do not recite any Quranic text.';
        appendTranscript('student', question);
        setStatus('connecting'); // reuse as "thinking"
        try {
          const providerConfig = await loadProviderConfig();
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              /*
               * The lesson packet travels in `lessonContext`, not as a `system` message.
               *
               * `/api/chat` deliberately strips client-supplied system turns (they could replace
               * its grounding rules), so sending the packet there meant every on-device turn was
               * answered with no lesson context at all — no Arabic ayah, no translations, no
               * exegesis, no occasion of revelation, and no way for the model to know which verse
               * the child was looking at. The route now appends this field to its own system
               * prompt, where the zero-hallucination rules still take precedence.
               */
              messages: [{ role: 'user', content: question }],
              lessonContext: packet,
              ...(providerConfig ? { providerConfig } : {}),
            }),
          });
          if (!response.ok) {
            /*
             * Report what the route said instead of a generic retry prompt.
             *
             * The usual failure here is `not_configured` (503): this mode answers through the
             * chat route, so it needs either a provider configured on the device or a key on the
             * server, and "the on-device storyteller could not answer" tells the learner nothing
             * about which of the two is missing.
             */
            const payload: unknown = await response.json().catch(() => null);
            const message = readErrorMessage(
              payload,
              `The study assistant could not answer (HTTP ${response.status}).`
            );
            setErrorMessage(
              response.status === 503 && !providerConfig
                ? `${message} On-device voice mode still sends the reply through the study assistant, so add a provider key in Settings → AI, or a server key.`
                : message
            );
            setStatus('error');
            return;
          }
          if (!response.body) throw new Error('The study assistant returned an empty response.');

          // The chat route streams the UI message protocol (SSE `text-delta` chunks).
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let reply = '';
          let buffer = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let boundary = buffer.indexOf('\n\n');
            while (boundary !== -1) {
              const event = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              const line = event.trim();
              if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                try {
                  const chunk = JSON.parse(line.slice(6)) as { type?: string; delta?: string };
                  if (chunk.type === 'text-delta' && typeof chunk.delta === 'string') reply += chunk.delta;
                } catch {
                  /* skip malformed chunk */
                }
              }
              boundary = buffer.indexOf('\n\n');
            }
          }
          if (reply.trim().length === 0) {
            reply = 'I could not reach my study guide just now — please ask me again.';
          }
          appendTranscript('ameen', reply);
          setStatus('active');
          speak(reply);
        } catch (error: unknown) {
          console.warn('Local storyteller turn failed:', error);
          setErrorMessage('The on-device storyteller could not answer. Please retry.');
          setStatus('error');
        }
      };

      // Opening beat, matching the cloud session's `tellCurrentStory` behaviour.
      void answerLocally(
        segmentRef.current ? 'Assalamu alaykum! Please tell me the story of this ayah.' : 'Assalamu alaykum!'
      );

      // Typed questions from the storyteller bar flow through the same local answerer.
      localAskRef.current = (question: string): void => {
        void answerLocally(question);
      };

      // Turn-based conversation: speech start (RMS ≥ 38) followed by ≥1.6 s of silence is one
      // question; the same hysteresis gates the tajweed coach uses.
      let speechStartedAt: number | null = null;
      let silenceStartedAt: number | null = null;
      localTurnBufferRef.current = [];

      const turnProcessor = (frame: Float32Array): void => {
        if (!activeRef.current || generation !== generationRef.current) return;
        localTurnBufferRef.current.push(frame);
        const level = computeRmsVolume(frame);
        micLevelRef.current = level;

        const now = performance.now();
        if (level >= 38 && speechStartedAt === null) {
          speechStartedAt = now;
          silenceStartedAt = null;
        } else if (speechStartedAt !== null && level < 22) {
          if (silenceStartedAt === null) silenceStartedAt = now;
          if (now - silenceStartedAt >= 1600 && now - speechStartedAt >= 400) {
            const chunks = localTurnBufferRef.current;
            localTurnBufferRef.current = [];
            speechStartedAt = null;
            silenceStartedAt = null;
            const inputRate = inputContextRef.current?.sampleRate ?? 48000;
            const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
            if (total < inputRate * 0.3) return;
            const merged = new Float32Array(total);
            let offset = 0;
            for (const chunk of chunks) {
              merged.set(chunk, offset);
              offset += chunk.length;
            }
            void (async () => {
              try {
                const downsampled = downsampleBuffer(merged, inputRate, RECORDING_SAMPLE_RATE);
                const { transcript } = await scoreUtteranceLocally(
                  localVariantRef.current ?? MODEL_VARIANTS.balanced,
                  'storyteller-turn',
                  [],
                  downsampled
                );
                const trimmed = transcript.trim();
                if (trimmed.length > 0) void answerLocally(trimmed);
              } catch (error: unknown) {
                console.warn('Local storyteller transcription failed:', error);
              }
            })();
          }
        } else if (level >= 38) {
          silenceStartedAt = null;
        }
      };

      localFrameSinkRef.current = turnProcessor;
      try {
        const attached = await attachMicrophone(generation);
        if (!attached) return;
      } catch (error: unknown) {
        console.warn('Microphone could not be started for the local storyteller:', error);
        localFrameSinkRef.current = null;
        setErrorMessage('The microphone could not be started for the on-device storyteller.');
        setStatus('error');
        activeRef.current = false;
      }
    },
    [appendTranscript, attachMicrophone]
  );

  const stop = useCallback((): void => {
    // Marked first, so a reconnect that is already scheduled cannot outlive this call.
    stoppedByUserRef.current = true;
    autoStartRef.current = false;
    establishedAtRef.current = null;
    cancelReconnect();
    generationRef.current += 1;
    activeRef.current = false;
    cleanupSession();
    openLineRef.current = { ameen: null, student: null };
    setStatus('idle');
    setErrorMessage(null);
    setModel(null);
  }, [cancelReconnect, cleanupSession]);

  const start = useCallback((): void => {
    // Consumed first, so a stale flag can never suppress the budget reset on a later tap.
    const isAutoStart = autoStartRef.current;
    autoStartRef.current = false;

    if (activeRef.current) return;

    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      setErrorMessage('Live voice lessons need a browser with microphone support.');
      return;
    }

    // A learner-initiated start clears any queued retry and re-arms recovery, so an explicit
    // tap is always a deliberate fresh beginning rather than a continuation of the budget. An
    // automatic retry must *not* clear it, or the cap would never be reached.
    cancelReconnect();
    stoppedByUserRef.current = false;
    if (!isAutoStart) reconnectAttemptsRef.current = 0;

    generationRef.current += 1;
    const generation = generationRef.current;
    activeRef.current = true;
    establishedRef.current = false;
    failureRef.current = null;
    setErrorMessage(null);
    setStatus('requesting_token');

    /**
     * The model the token was constrained to, kept outside the try so a connection failure
     * can name it. "The voice session could not be started" is unactionable; naming the model
     * is what tells an operator that `GEMINI_LIVE_MODEL` points at a non-Live model.
     */
    let liveModel: string | null = null;

    /*
     * Which engine this session runs on, decided **before any network call**.
     *
     * This used to be two independent concurrent IIFEs: one probed for an on-device variant and
     * started the local session, the other immediately minted an ephemeral token and opened the
     * Gemini Live socket — unconditionally. Selecting the on-device engine therefore still opened
     * a cloud session, and both paths then called `attachMicrophone`, so the machine ran two
     * AudioContexts and two microphone tracks (one leaked), fed capture frames to Gemini *and* to
     * the local turn detector, and burned a single-use token per start. "The Gemini Live socket
     * path is skipped entirely" was the intent; it is now the behaviour, because the cloud path
     * is not entered until this probe has resolved.
     */
    const engineProbe = (async (): Promise<
      { kind: 'cloud' } | { kind: 'local'; variant: ModelVariant } | { kind: 'local-error'; message: string }
    > => {
      try {
        const { resolveModuleVariant } = await import('@/lib/audio/model-registry');
        const dbModule = await import('@/lib/db');
        const profile = await dbModule.db.userProfile.get('default_user');
        const localVariant = resolveModuleVariant(
          'tafsir-storyteller',
          profile?.moduleEngines,
          profile?.coachModelVariant
        );
        if (!localVariant) return { kind: 'cloud' };

        const { bootLocalEngine } = await import('@/lib/audio/local-engine-session');
        try {
          await bootLocalEngine(localVariant);
        } catch (error: unknown) {
          // No-fallback design: a chosen variant that cannot boot is reported, never silently
          // downgraded to the cloud engine.
          return {
            kind: 'local-error',
            message: error instanceof Error ? error.message : 'The on-device engine could not start.',
          };
        }
        return { kind: 'local', variant: localVariant };
      } catch {
        // Probe failure (e.g. IndexedDB unavailable) falls through to the cloud path.
        return { kind: 'cloud' };
      }
    })();

    /**
     * The in-flight `connect()`, tracked outside the `try` so a handshake that times out can
     * still be closed if the server eventually completes it.
     */
    let pendingConnect: Promise<Session> | null = null;

    void (async () => {
      try {
        const engine = await engineProbe;
        if (generation !== generationRef.current) return;

        if (engine.kind === 'local-error') {
          setErrorMessage(engine.message);
          setStatus('error');
          activeRef.current = false;
          return;
        }

        if (engine.kind === 'local') {
          localVariantRef.current = engine.variant;
          await runLocalStorytellerSession(generation);
          return;
        }

        const ticketResponse = await fetch('/api/tafsir/live-session', { method: 'POST' });
        if (generation !== generationRef.current) return;

        if (!ticketResponse.ok) {
          const payload: unknown = await ticketResponse.json().catch(() => null);
          setErrorMessage(
            readErrorMessage(payload, 'The voice storyteller is unavailable right now. Please retry.')
          );
          setStatus('error');
          activeRef.current = false;
          return;
        }

        const ticketParsed = liveSessionTicketSchema.safeParse(await ticketResponse.json());
        if (!ticketParsed.success) {
          setErrorMessage('The voice storyteller service returned an unusable session ticket.');
          setStatus('error');
          activeRef.current = false;
          return;
        }

        const ticket = ticketParsed.data;
        liveModel = ticket.model;

        if (generation !== generationRef.current) return;
        setStatus('connecting');

        // Loaded on demand: the Live SDK is large and only needed once the learner actually
        // starts a voice session, so it stays out of the initial client bundle.
        const { GoogleGenAI, Modality } = await import('@google/genai');
        if (generation !== generationRef.current) return;

        const ai = new GoogleGenAI({
          apiKey: ticket.token,
          httpOptions: { apiVersion: 'v1alpha' },
        });

        const player = new PCMAudioStreamPlayer(PLAYBACK_SAMPLE_RATE);
        playerRef.current = player;

        /*
         * The playback context is created here, inside the click that started the session,
         * rather than lazily when the first audio chunk arrives. Browsers only allow audio to
         * begin from a user gesture, so a context built later inside the socket callback stays
         * suspended: the session looks healthy while Ameen is silently inaudible.
         *
         * `prime()` now reports whether the context is genuinely running. This path is normally a
         * click (so it is), but an automatic reconnect reaches it from a timer, where a browser
         * may refuse to resume — and the answer is only surfaced once the session is live, so it
         * can never mask a terminal connection error.
         */
        const audioReady = await player.prime();
        if (generation !== generationRef.current) return;

        /**
         * Rejects the pending `connect()` the moment a close arrives mid-handshake, so the
         * real reason is reported instead of hanging until the timeout expires.
         */
        let rejectHandshake: ((error: Error) => void) | null = null;
        const handshakeFailed = new Promise<never>((_resolve, reject) => {
          rejectHandshake = reject;
        });
        const handshakeTimer = setTimeout(
          () =>
            rejectHandshake?.(
              new Error(
                `the server did not confirm the session within ${Math.round(
                  HANDSHAKE_TIMEOUT_MS / 1000
                )}s`
              )
            ),
          HANDSHAKE_TIMEOUT_MS
        );

        const connecting = ai.live.connect({
          // Must match the model the token was constrained to, or the server rejects it.
          model: ticket.model,
          callbacks: {
            onopen: () => {
              // Deliberately *not* "active": the socket is merely open. The setup message has
              // not even been sent yet, so claiming the session is live here is what made a
              // rejected handshake look like an active lesson that then died.
            },
            onmessage: (message: LiveServerMessage) => handleServerMessage(message, generation),
            onerror: (event: ErrorEvent) => {
              if (generation !== generationRef.current) return;
              const detail = event.message?.trim();
              console.error('Gemini Live session error:', detail ?? '(no message)');
              const message = detail
                ? `The voice session reported an error: ${detail}`
                : 'The voice session reported an error. Tap start to reconnect.';
              // Recorded so the close that follows cannot replace it with a vaguer message.
              failureRef.current = message;
              setErrorMessage(message);
              setStatus('error');
            },
            onclose: (event: CloseEvent) => {
              if (generation !== generationRef.current) return;

              const detail = describeClose(event);
              console.error(`Gemini Live session closed: ${detail}`);
              activeRef.current = false;

              // An error the socket already reported is more specific than "it closed",
              // but it is still worth one bounded retry: `onerror` also fires for transient
              // transport faults, which a fresh session usually survives.
              if (failureRef.current) {
                scheduleReconnect(detail);
                return;
              }

              if (!establishedRef.current) {
                // The handshake never completed, so this is a connection failure rather than an
                // interrupted lesson. Reporting it as "the session ended" is what hid the real
                // reason — which is how a non-existent Live model went unnoticed.
                const message = `The voice session could not be started because ${detail}.`;
                failureRef.current = message;
                rejectHandshake?.(new Error(detail));
                if (scheduleReconnect(detail)) return;
                setErrorMessage(message);
                setStatus('error');
                return;
              }

              // The lesson was live and the socket dropped. Recover automatically before
              // falling back to telling the child to press the button themselves.
              if (scheduleReconnect(detail)) return;

              setStatus('idle');
              setErrorMessage(`The voice session ended because ${detail}. Tap start to reconnect.`);
            },
          },
          config: {
            responseModalities: [Modality.AUDIO],
            temperature: 0.75,
            // The full persona is set once per session; the per-ayah packet is injected as a
            // client turn on load and again on every navigation.
            systemInstruction: {
              parts: [
                {
                  text: segmentRef.current
                    ? buildStorytellerInstruction(segmentRef.current, languageRef.current)
                    : 'You are Ustadh Ameen, a warm Quranic storyteller for a ten-year-old child. A lesson has not loaded yet, so greet the child and wait.',
                },
              ],
            },
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceId } },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        });
        pendingConnect = connecting;

        /*
         * `handshakeFailed` settles the instant the socket closes before setup completes (or the
         * timeout above elapses), so a rejected handshake is reported instead of leaving
         * `connect()` pending forever on a promise the server will never fulfil.
         */
        const session = await Promise.race([connecting, handshakeFailed]).finally(() =>
          clearTimeout(handshakeTimer)
        );

        if (generation !== generationRef.current) {
          try {
            session.close();
          } catch {
            /* nothing to close */
          }
          player.close();
          return;
        }

        sessionRef.current = session;
        establishedRef.current = true;
        setModel(ticket.model);

        // Stamp the handshake rather than clearing the retry budget here: the budget is reset
        // once this session has proved it is stable — see `RECONNECT_STABLE_AFTER_MS`.
        establishedAtRef.current = Date.now();
        reconnectingRef.current = false;

        if (generation !== generationRef.current) return;

        // The handshake is done, so the session is genuinely live from here on.
        setStatus('active');

        if (!audioReady) {
          setErrorMessage(
            "Your browser has not allowed audio to play yet, so Ameen may be silent. Stop and start the story again to unlock his voice."
          );
        }

        /*
         * Opening beat first, microphone second.
         *
         * Attaching the microphone can block on the browser's permission prompt for an
         * arbitrarily long time. Asking Ameen to begin before that happens means the lesson
         * starts as soon as the session is live and the child hears the story while answering
         * the prompt, instead of watching a silent bar.
         */
        tellCurrentStory();

        try {
          const attached = await attachMicrophone(generation);
          if (!attached) return;
        } catch (error: unknown) {
          console.warn('Microphone could not be started for the live lesson:', error);
          const message =
            'Microphone access was denied or the device is busy, so Ameen cannot hear you. Enable the microphone, then tap start.';
          // Recorded first so the close that follows cannot overwrite the real reason.
          failureRef.current = message;
          setErrorMessage(message);
          setStatus('error');
          activeRef.current = false;
          cleanupSession();
          return;
        }
      } catch (error: unknown) {
        if (generation !== generationRef.current) return;
        console.error('Live storyteller could not start:', error);

        /*
         * A queued reconnect owns the messaging at this point. Its explanation ("attempt 2 of
         * 3") is more useful than a terminal error, and reporting "stopped" here would
         * contradict a retry that is still about to run.
         */
        if (reconnectingRef.current) {
          activeRef.current = false;
          cleanupSession();
          return;
        }

        const detail = error instanceof Error ? error.message.trim() : '';
        setErrorMessage(
          liveModel
            ? `The voice session could not be opened with “${liveModel}”${
                detail ? ` — ${detail.slice(0, 180)}` : ''
              }`
            : 'The voice storyteller could not be started. Please retry.'
        );
        setStatus('error');
        activeRef.current = false;

        /*
         * A handshake that timed out may still be completed by the server afterwards. Without
         * this, that socket would stay open with nobody using it, holding a session open and
         * consuming the learner's quota until the server gave up on it.
         */
        if (pendingConnect) {
          void pendingConnect
            .then((late) => {
              try {
                late.close();
              } catch {
                /* already closed */
              }
            })
            .catch(() => undefined);
        }

        cleanupSession();
      }
    })();
  }, [
    attachMicrophone,
    cancelReconnect,
    cleanupSession,
    handleServerMessage,
    runLocalStorytellerSession,
    scheduleReconnect,
    tellCurrentStory,
    voiceId,
  ]);

  /*
   * The reconnect timer re-enters `start` through a ref rather than a dependency, which keeps
   * `start` free of a circular reference to the scheduler that calls it while still always
   * invoking the current closure.
   */
  useEffect(() => {
    startRef.current = start;
  }, [start]);

  const toggleMute = useCallback((): void => {
    setIsMuted((previous) => {
      const next = !previous;
      mutedRef.current = next;
      return next;
    });
  }, []);

  // Unmount teardown: release the microphone, the audio graph and the WebSocket, and cancel
  // any queued reconnect so it cannot resurrect a session on an unmounted component.
  useEffect(() => {
    return () => {
      stoppedByUserRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      generationRef.current += 1;
      activeRef.current = false;
      autoStartRef.current = false;
      establishedAtRef.current = null;
      cleanupSession();
    };
  }, [cleanupSession]);

  return {
    status,
    errorMessage,
    model,
    micLevelRef,
    transcript,
    isMuted,
    start,
    stop,
    toggleMute,
    clearTranscript,
    askAmeen,
    tellCurrentStory,
  };
}
