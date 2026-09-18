'use client';

import { useState, useRef, useEffect, useCallback, type MutableRefObject } from 'react';
import {
  RECORDING_SAMPLE_RATE,
  downsampleBuffer,
  convertFloat32ToInt16PCM,
  arrayBufferToBase64,
  computeRmsVolume,
} from '@/lib/audio/pcm-audio';
import { db, UserProfile } from '@/lib/db';
import { FeedbackLanguage, normalizeFeedbackLanguage } from '@/lib/i18n/language';
import { isAccuracyRating, type AccuracyRating } from '@/lib/ai/verdict';

/**
 * Captures a short recitation, downsamples it to 16 kHz mono PCM, and submits it
 * to the Tajweed evaluation route.
 *
 * Lifecycle guarantees:
 *  - the microphone, AudioContext, node graph, timers and in-flight request are all
 *    released by `cleanupAudio`/unmount, even if the learner never presses stop;
 *  - stop conditions (voice-activity pause, hard duration cap, manual stop) are
 *    driven from refs, so a callback captured by a timer can never see stale state;
 *  - audio level is published through a ref and sampled by a rAF-driven waveform,
 *    so recording does not re-render the React tree ~21 times a second.
 */

/** RMS level (0-100) that counts as speech. Above ordinary room tone. */
export const SPEECH_GATE = 38;
/** RMS level below which a pause is considered to have begun (hysteresis). */
export const SILENCE_GATE = 22;
/** Silence length after speech that auto-submits the recitation. */
const AUTO_SUBMIT_PAUSE_MS = 1400;
/** Minimum speech time before auto-submit is allowed. */
const MIN_SPEECH_MS = 400;
/** Hard ceiling on a single recitation. */
export const MAX_RECORDING_SECONDS = 15;
/** Recordings shorter than this are treated as an accidental tap. */
const MIN_RECORDING_SECONDS = 0.3;

export interface TajweedLiveFeedback {
  coachResponseEn: string;
  coachResponseTa?: string;
  makhrajTip?: string;
  makhrajTipTa?: string;
  tajweedRuleName?: string;
  accuracyRating?: AccuracyRating;
  suggestedPractice?: string;
  detectedErrors?: string[];
  latencyMs?: number;
  /** Verbatim words heard; present only when `requestTranscript` was set. */
  transcript?: string;
}

export type LiveCoachStatus = 'idle' | 'listening' | 'analyzing' | 'feedback' | 'error';

export type MicPermissionState = 'prompt' | 'granted' | 'denied';

export interface UseLiveTajweedOptions {
  currentLessonTitle?: string;
  currentActivityTitle?: string;
  promptArabic?: string;
  targetRule?: string;
  /** Explicit feedback language override; falls back to the saved profile preference. */
  language?: FeedbackLanguage;
  onFeedbackReceived?: (feedback: TajweedLiveFeedback) => void;
  maxSeconds?: number;
  /** Ask the service for a verbatim transcript, for local mistake detection. */
  requestTranscript?: boolean;
}

export interface UseLiveTajweedResult {
  status: LiveCoachStatus;
  /** Live RMS level (0-100). Read from a ref by the waveform; never causes a render. */
  audioLevelRef: MutableRefObject<number>;
  latencyMs: number | null;
  errorMessage: string | null;
  latestFeedback: TajweedLiveFeedback | null;
  micPermissionState: MicPermissionState;
  recordingSeconds: number;
  userProfile: UserProfile | null;
  /**
   * The last recording this hook captured, as raw 16 kHz mono PCM16 base64 (or null
   * before any capture). Lets a caller keep the learner's own attempt for replay without
   * re-recording; it holds no text and never leaves the device.
   */
  lastRecordingBase64: string | null;
  startRecording: () => void;
  stopRecording: () => void;
  reset: () => void;
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readStringArray(source: Record<string, unknown>, key: string): string[] | undefined {
  const value = source[key];
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return items.length > 0 ? items.map((item) => item.trim()) : undefined;
}

/** Narrows an untrusted response body into typed feedback. */
function normalizeFeedback(payload: unknown): TajweedLiveFeedback | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const source = payload as Record<string, unknown>;

  const rating = readString(source, 'accuracyRating');
  const accuracyRating = isAccuracyRating(rating) ? rating : undefined;

  const feedback: TajweedLiveFeedback = {
    coachResponseEn: readString(source, 'coachResponseEn') ?? '',
    coachResponseTa: readString(source, 'coachResponseTa'),
    makhrajTip: readString(source, 'makhrajTip'),
    makhrajTipTa: readString(source, 'makhrajTipTa'),
    tajweedRuleName: readString(source, 'tajweedRuleName'),
    accuracyRating,
    suggestedPractice: readString(source, 'suggestedPractice'),
    detectedErrors: readStringArray(source, 'detectedErrors'),
  };

  const latency = source.latencyMs;
  if (typeof latency === 'number' && Number.isFinite(latency)) {
    feedback.latencyMs = latency;
  }
  if (typeof source.transcript === 'string') {
    feedback.transcript = source.transcript.trim();
  }

  if (
    feedback.coachResponseEn.length === 0 &&
    !feedback.coachResponseTa &&
    !feedback.makhrajTip &&
    !feedback.makhrajTipTa
  ) {
    return null;
  }

  return feedback;
}

function readErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'object' && payload !== null) {
    const message = (payload as Record<string, unknown>).error;
    if (typeof message === 'string' && message.trim().length > 0) return message.trim();
  }
  return fallback;
}

export function useLiveTajweed({
  currentLessonTitle = 'Quranic Tajweed',
  currentActivityTitle = 'Letter Pronunciation',
  promptArabic = '',
  targetRule = 'General Tajweed',
  language,
  onFeedbackReceived,
  maxSeconds = MAX_RECORDING_SECONDS,
  requestTranscript = false,
}: UseLiveTajweedOptions = {}): UseLiveTajweedResult {
  const [status, setStatus] = useState<LiveCoachStatus>('idle');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [latestFeedback, setLatestFeedback] = useState<TajweedLiveFeedback | null>(null);
  const [micPermissionState, setMicPermissionState] = useState<MicPermissionState>('prompt');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [lastRecordingBase64, setLastRecordingBase64] = useState<string | null>(null);

  const audioLevelRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSpokenRef = useRef(false);
  const speechStartedAtRef = useRef<number | null>(null);
  const isRecordingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  /**
   * Bumped by `reset` and by unmount.
   *
   * `getUserMedia` resolves only after the learner answers the permission prompt, so a
   * reset (or a navigation) during that prompt used to be followed by a stream arriving
   * into a component that had already moved on — the microphone stayed open and the
   * recorder ran with no visible controls. The pending start compares this counter and
   * releases the stream if it changed.
   */
  const startGenerationRef = useRef(0);

  const stopRecordingRef = useRef<() => void>(() => {});
  const onFeedbackRef = useRef(onFeedbackReceived);
  const profileRef = useRef<UserProfile | null>(null);

  useEffect(() => {
    onFeedbackRef.current = onFeedbackReceived;
  }, [onFeedbackReceived]);

  useEffect(() => {
    let active = true;
    async function fetchProfile(): Promise<void> {
      try {
        const profile = await db.userProfile.get('default_user');
        if (!active) return;
        setUserProfile(profile ?? null);
        profileRef.current = profile ?? null;
      } catch (error) {
        console.warn('Failed to load user profile for the Tajweed coach:', error);
      }
    }
    void fetchProfile();
    return () => {
      active = false;
    };
  }, []);

  const clearTimers = useCallback((): void => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (counterIntervalRef.current) {
      clearInterval(counterIntervalRef.current);
      counterIntervalRef.current = null;
    }
    if (capTimeoutRef.current) {
      clearTimeout(capTimeoutRef.current);
      capTimeoutRef.current = null;
    }
  }, []);

  /** Releases every capture resource. Safe to call repeatedly. */
  const cleanupAudio = useCallback((): void => {
    clearTimers();

    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      try {
        processorRef.current.disconnect();
      } catch {
        // Node already detached.
      }
      processorRef.current = null;
    }

    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {
        // Source already detached.
      }
      sourceRef.current = null;
    }

    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }

    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== 'closed') {
      void context.close().catch(() => undefined);
    }

    audioLevelRef.current = 0;
    hasSpokenRef.current = false;
    speechStartedAtRef.current = null;
    isRecordingRef.current = false;
    setRecordingSeconds(0);
  }, [clearTimers]);

  const evaluateAudioBuffer = useCallback(
    async (recordedFloat32: Float32Array, inputSampleRate: number): Promise<void> => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus('analyzing');
      setErrorMessage(null);
      const startedAt = performance.now();

      try {
        const downsampled = downsampleBuffer(recordedFloat32, inputSampleRate, RECORDING_SAMPLE_RATE);
        const int16Pcm = convertFloat32ToInt16PCM(downsampled);
        const base64Audio = arrayBufferToBase64(
          new Uint8Array(int16Pcm.buffer, int16Pcm.byteOffset, int16Pcm.byteLength)
        );
        // Keep the learner's own attempt so the caller can offer replay-vs-Qari after grading.
        setLastRecordingBase64(base64Audio);

        const response = await fetch('/api/tajweed/live-coach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            audioBase64: base64Audio,
            audioMimeType: 'audio/pcm;rate=16000',
            currentLessonTitle,
            currentActivityTitle,
            promptArabic,
            targetRule,
            voiceId: profileRef.current?.aiVoiceId || 'Kore',
            teacherPersona: profileRef.current?.aiTeacherPersona || 'balanced',
            language: normalizeFeedbackLanguage(language ?? profileRef.current?.aiFeedbackLanguage),
            requestTranscript,
          }),
        });

        if (requestId !== requestIdRef.current) return;

        const roundTripLatency = Math.round(performance.now() - startedAt);

        if (!response.ok) {
          const payload: unknown = await response.json().catch(() => null);
          setLatencyMs(roundTripLatency);
          setErrorMessage(
            readErrorMessage(
              payload,
              'The recitation could not be evaluated. Please check your connection and retry.'
            )
          );
          setStatus('error');
          return;
        }

        const payload: unknown = await response.json().catch(() => null);
        if (requestId !== requestIdRef.current) return;

        const feedback = normalizeFeedback(payload);
        if (!feedback) {
          setLatencyMs(roundTripLatency);
          setErrorMessage('The evaluation service returned an unusable result. Please retry.');
          setStatus('error');
          return;
        }

        const result: TajweedLiveFeedback = {
          ...feedback,
          tajweedRuleName: feedback.tajweedRuleName ?? targetRule,
          latencyMs: roundTripLatency,
        };

        setLatencyMs(roundTripLatency);
        setLatestFeedback(result);
        setStatus('feedback');
        onFeedbackRef.current?.(result);
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        if (requestId !== requestIdRef.current) return;
        console.error('Tajweed evaluation failed:', error);
        setErrorMessage(
          'Unable to reach the recitation feedback service. Your recitation was not graded — please retry.'
        );
        setStatus('error');
      }
    },
    [currentActivityTitle, currentLessonTitle, language, promptArabic, requestTranscript, targetRule]
  );

  /** Finalizes the recording and dispatches it for evaluation. */
  const finalizeRecording = useCallback((): void => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;

    const inputRate = audioContextRef.current?.sampleRate || 44100;
    const chunks = pcmChunksRef.current;
    pcmChunksRef.current = [];

    cleanupAudio();

    if (chunks.length === 0) {
      setStatus('idle');
      return;
    }

    let totalLength = 0;
    for (const chunk of chunks) {
      totalLength += chunk.length;
    }
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    if (merged.length < inputRate * MIN_RECORDING_SECONDS) {
      setStatus('idle');
      setErrorMessage('That recitation was too short to evaluate. Please recite the passage clearly.');
      return;
    }

    void evaluateAudioBuffer(merged, inputRate);
  }, [cleanupAudio, evaluateAudioBuffer]);

  // The timers created inside startRecording call through this ref, so they always
  // reach the current implementation instead of a stale closure that would no-op.
  useEffect(() => {
    stopRecordingRef.current = finalizeRecording;
  }, [finalizeRecording]);

  const stopRecording = useCallback((): void => {
    stopRecordingRef.current();
  }, []);

  const startRecording = useCallback(async (): Promise<void> => {
    if (isRecordingRef.current) return;

    setErrorMessage(null);
    setLatestFeedback(null);
    setLatencyMs(null);
    pcmChunksRef.current = [];
    hasSpokenRef.current = false;
    speechStartedAtRef.current = null;
    audioLevelRef.current = 0;
    const generationAtStart = startGenerationRef.current;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMicPermissionState('denied');
      setErrorMessage('Audio recording is not supported in this browser.');
      setStatus('error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // A reset or a navigation may have happened while the permission prompt was open;
      // never leak a granted stream into a capture session nobody is watching.
      if (generationAtStart !== startGenerationRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }

      mediaStreamRef.current = stream;
      setMicPermissionState('granted');

      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const processor = audioCtx.createScriptProcessor(2048, 1, 1);
      processorRef.current = processor;

      source.connect(processor);
      processor.connect(audioCtx.destination);

      processor.onaudioprocess = (event) => {
        if (!isRecordingRef.current) return;

        const inputData = event.inputBuffer.getChannelData(0);
        const copy = new Float32Array(inputData.length);
        copy.set(inputData);
        pcmChunksRef.current.push(copy);

        const level = computeRmsVolume(inputData);
        audioLevelRef.current = level;

        const now = performance.now();

        if (level > SPEECH_GATE) {
          if (speechStartedAtRef.current === null) {
            speechStartedAtRef.current = now;
          }
          hasSpokenRef.current = true;
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
          return;
        }

        const hasSpokenLongEnough =
          hasSpokenRef.current &&
          speechStartedAtRef.current !== null &&
          now - speechStartedAtRef.current >= MIN_SPEECH_MS;

        if (level <= SILENCE_GATE && hasSpokenLongEnough && !silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            silenceTimerRef.current = null;
            stopRecordingRef.current();
          }, AUTO_SUBMIT_PAUSE_MS);
        }
      };

      isRecordingRef.current = true;
      setStatus('listening');
      setRecordingSeconds(0);

      counterIntervalRef.current = setInterval(() => {
        setRecordingSeconds((previous) => Math.min(previous + 1, maxSeconds));
      }, 1000);

      capTimeoutRef.current = setTimeout(() => {
        stopRecordingRef.current();
      }, maxSeconds * 1000);
    } catch (error: unknown) {
      console.warn('Microphone permission or hardware error:', error);
      cleanupAudio();
      setMicPermissionState('denied');
      setErrorMessage(
        'Microphone access was denied or the device is busy. Enable microphone permission and try again.'
      );
      setStatus('error');
    }
  }, [cleanupAudio, maxSeconds]);

  const reset = useCallback((): void => {
    // Invalidate any start that is still waiting on the permission prompt.
    startGenerationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    requestIdRef.current += 1;
    cleanupAudio();
    setStatus('idle');
    setErrorMessage(null);
    setLatestFeedback(null);
    setLatencyMs(null);
  }, [cleanupAudio]);

  // Unmount teardown: release capture resources and cancel any in-flight request.
  useEffect(() => {
    return () => {
      startGenerationRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      isRecordingRef.current = false;
      cleanupAudio();
    };
  }, [cleanupAudio]);

  return {
    status,
    audioLevelRef,
    latencyMs,
    errorMessage,
    latestFeedback,
    micPermissionState,
    recordingSeconds,
    userProfile,
    lastRecordingBase64,
    startRecording: () => {
      void startRecording();
    },
    stopRecording,
    reset,
  };
}
