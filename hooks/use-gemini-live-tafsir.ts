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

  /** Bumped by `stop` and by unmount so a pending start cannot attach to a dead session. */
  const generationRef = useRef(0);
  const activeRef = useRef(false);
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

  /* ---------------------------------------------------------------------- */
  /* Transcript                                                              */
  /* ---------------------------------------------------------------------- */

  const appendTranscript = useCallback((speaker: 'ameen' | 'student', text: string): void => {
    if (text.length === 0) return;
    const chunk = text;
    setTranscript((previous) => {
      const openId = openLineRef.current[speaker];
      if (openId) {
        const index = previous.findIndex((line) => line.id === openId);
        if (index !== -1) {
          const next = [...previous];
          next[index] = { ...next[index], text: `${next[index].text}${chunk}` };
          return next;
        }
      }
      const id = `${speaker}-${Date.now()}-${previous.length}`;
      openLineRef.current[speaker] = id;
      return [...previous, { id, speaker, text: chunk, at: Date.now() }];
    });
  }, []);

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
    cleanupAudio();

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

        const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
        // 16-bit PCM is only addressable through Int16Array when the byte count is even.
        // An odd or empty trailing chunk would make the constructor throw *inside* this
        // handler, which kills the session's message pump for every later message — so a
        // malformed chunk is dropped instead.
        if (bytes.byteLength < 2 || bytes.byteLength % 2 !== 0) continue;

        playerRef.current?.queuePCM16Chunk(new Int16Array(bytes.buffer));
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
        console.warn('Gemini Live will close this session soon:', message.goAway.timeLeft);
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
    const packet = currentContextPacket();
    if (!session || !packet) return;
    openLineRef.current.ameen = null;
    session.sendClientContent({
      turns: [
        {
          role: 'user',
          parts: [
            {
              text: `${packet}\n\nNow tell me the story of this ayah, as we agreed.`,
            },
          ],
        },
      ],
      turnComplete: true,
    });
  }, [currentContextPacket]);

  const askAmeen = useCallback((question: string): void => {
    const session = sessionRef.current;
    const trimmed = question.trim();
    if (!session || trimmed.length === 0) return;
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

      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new AudioContextClass();
      inputContextRef.current = context;

      const source = context.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      const onFrame = (frame: Float32Array): void => {
        if (!activeRef.current) return;
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

  const stop = useCallback((): void => {
    generationRef.current += 1;
    activeRef.current = false;
    cleanupSession();
    openLineRef.current = { ameen: null, student: null };
    setStatus('idle');
    setErrorMessage(null);
    setModel(null);
  }, [cleanupSession]);

  const start = useCallback((): void => {
    if (activeRef.current) return;

    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      setErrorMessage('Live voice lessons need a browser with microphone support.');
      return;
    }

    generationRef.current += 1;
    const generation = generationRef.current;
    activeRef.current = true;
    setErrorMessage(null);
    setStatus('requesting_token');

    void (async () => {
      try {
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

        const session = await ai.live.connect({
          // Must match the model the token was constrained to, or the server rejects it.
          model: ticket.model,
          callbacks: {
            onopen: () => {
              if (generation !== generationRef.current) return;
              setStatus('active');
            },
            onmessage: (message: LiveServerMessage) => handleServerMessage(message, generation),
            onerror: (event: ErrorEvent) => {
              if (generation !== generationRef.current) return;
              console.error('Gemini Live session error:', event.message);
              setErrorMessage('The voice session was interrupted. Tap start to reconnect.');
              setStatus('error');
            },
            onclose: () => {
              if (generation !== generationRef.current) return;
              // A close we did not ask for is worth telling the learner about.
              if (activeRef.current) {
                setStatus('idle');
                setErrorMessage('The voice session ended. Tap start to reconnect.');
                activeRef.current = false;
              }
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
        setModel(ticket.model);

        try {
          const attached = await attachMicrophone(generation);
          if (!attached) return;
        } catch (error: unknown) {
          console.warn('Microphone could not be started for the live lesson:', error);
          setErrorMessage(
            'Microphone access was denied or the device is busy. Enable the microphone and try again.'
          );
          setStatus('error');
          activeRef.current = false;
          cleanupSession();
          return;
        }

        if (generation !== generationRef.current) return;

        // Opening beat: hand Ameen this ayah and ask him to begin.
        tellCurrentStory();
      } catch (error: unknown) {
        if (generation !== generationRef.current) return;
        console.error('Live storyteller could not start:', error);
        setErrorMessage('The voice storyteller could not be started. Please retry.');
        setStatus('error');
        activeRef.current = false;
        cleanupSession();
      }
    })();
  }, [attachMicrophone, cleanupSession, handleServerMessage, tellCurrentStory, voiceId]);

  const toggleMute = useCallback((): void => {
    setIsMuted((previous) => {
      const next = !previous;
      mutedRef.current = next;
      return next;
    });
  }, []);

  // Unmount teardown: release the microphone, the audio graph and the WebSocket.
  useEffect(() => {
    return () => {
      generationRef.current += 1;
      activeRef.current = false;
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
