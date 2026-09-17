'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  RECORDING_SAMPLE_RATE,
  downsampleBuffer,
  convertFloat32ToInt16PCM,
  arrayBufferToBase64,
  computeRmsVolume,
  PCMAudioStreamPlayer,
} from '@/lib/audio/pcm-audio';
import { db, UserProfile } from '@/lib/db';
import { FeedbackLanguage, normalizeFeedbackLanguage } from '@/lib/i18n/language';

export interface TajweedLiveFeedback {
  coachResponseEn: string;
  coachResponseTa?: string;
  makhrajTip?: string;
  makhrajTipTa?: string;
  tajweedRuleName?: string;
  accuracyRating?: 'Excellent' | 'Good' | 'Needs Practice' | 'Polished' | string;
  suggestedPractice?: string;
  latencyMs?: number;
  detectedErrors?: string[];
}

export type LiveCoachStatus =
  | 'idle'
  | 'listening'
  | 'analyzing'
  | 'feedback'
  | 'error';

export interface UseLiveTajweedOptions {
  currentLessonTitle?: string;
  currentActivityTitle?: string;
  promptArabic?: string;
  targetRule?: string;
  /** Explicit feedback language override; falls back to the saved profile preference. */
  language?: FeedbackLanguage;
  onFeedbackReceived?: (feedback: TajweedLiveFeedback) => void;
}

export function useLiveTajweed({
  currentLessonTitle = 'Quranic Tajweed',
  currentActivityTitle = 'Letter Pronunciation',
  promptArabic = '',
  targetRule = 'General Tajweed',
  language,
  onFeedbackReceived,
}: UseLiveTajweedOptions = {}) {
  const [status, setStatus] = useState<LiveCoachStatus>('idle');
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [latestFeedback, setLatestFeedback] = useState<TajweedLiveFeedback | null>(null);
  const [micPermissionState, setMicPermissionState] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);

  // Audio Context & Streaming Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasSpokenRef = useRef<boolean>(false);
  const sendStartTimeRef = useRef<number>(0);
  const playerRef = useRef<PCMAudioStreamPlayer | null>(null);

  // Load User Preferences
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const p = await db.userProfile.get('default_user');
        if (p) setUserProfile(p);
      } catch (err) {
        console.warn('Failed to load user profile for Tajweed coach:', err);
      }
    }
    fetchProfile();
  }, []);

  // Cleanup on unmount
  const cleanupAudio = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setAudioLevel(0);
    setRecordingSeconds(0);
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    return () => {
      cleanupAudio();
      player?.close();
    };
  }, [cleanupAudio]);

  /**
   * Evaluates the recorded PCM audio buffer by sending to the Tajweed AI Coach route.
   */
  const evaluateAudioBuffer = useCallback(
    async (recordedFloat32: Float32Array, inputSampleRate: number) => {
      setStatus('analyzing');
      sendStartTimeRef.current = performance.now();

      try {
        // Downsample to 16kHz Linear PCM
        const downsampled = downsampleBuffer(recordedFloat32, inputSampleRate, RECORDING_SAMPLE_RATE);
        const int16Pcm = convertFloat32ToInt16PCM(downsampled);
        const base64Audio = arrayBufferToBase64(new Uint8Array(int16Pcm.buffer, int16Pcm.byteOffset, int16Pcm.byteLength));

        const response = await fetch('/api/tajweed/live-coach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64: base64Audio,
            audioMimeType: 'audio/pcm;rate=16000',
            currentLessonTitle,
            currentActivityTitle,
            promptArabic,
            targetRule,
            voiceId: userProfile?.aiVoiceId || 'Kore',
            teacherPersona: userProfile?.aiTeacherPersona || 'balanced',
            language: normalizeFeedbackLanguage(language ?? userProfile?.aiFeedbackLanguage),
          }),
        });

        const roundTripLatency = Math.round(performance.now() - sendStartTimeRef.current);
        setLatencyMs(roundTripLatency);

        if (!response.ok) {
          throw new Error(`Server returned status ${response.status}`);
        }

        const data = await response.json();
        const feedback: TajweedLiveFeedback = {
          coachResponseEn: data.coachResponseEn || 'Makhraj articulation detected. Continue practicing with measured tempo.',
          coachResponseTa: data.coachResponseTa,
          makhrajTip: data.makhrajTip,
          makhrajTipTa: data.makhrajTipTa,
          tajweedRuleName: data.tajweedRuleName || targetRule,
          accuracyRating: data.accuracyRating || 'Good',
          suggestedPractice: data.suggestedPractice,
          latencyMs: roundTripLatency,
        };

        setLatestFeedback(feedback);
        setStatus('feedback');
        if (onFeedbackReceived) {
          onFeedbackReceived(feedback);
        }
      } catch (err: unknown) {
        console.error('Tajweed Evaluation Error:', err);
        setErrorMessage('Unable to connect to Tajweed live evaluation service. Please retry.');
        setStatus('error');
      }
    },
    [
      currentLessonTitle,
      currentActivityTitle,
      promptArabic,
      targetRule,
      language,
      userProfile,
      onFeedbackReceived,
    ]
  );

  /**
   * Finalizes the current recording session and dispatches the buffer for analysis.
   */
  const stopRecording = useCallback(() => {
    if (status !== 'listening') return;

    const inputRate = audioContextRef.current?.sampleRate || 44100;
    const allChunks = pcmChunksRef.current;
    pcmChunksRef.current = [];

    cleanupAudio();

    if (allChunks.length === 0) {
      setStatus('idle');
      return;
    }

    // Merge Float32Array chunks
    let totalLength = 0;
    for (const chunk of allChunks) {
      totalLength += chunk.length;
    }
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of allChunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    // If student recited for less than 0.3s, ignore as accidental click
    if (merged.length < inputRate * 0.3) {
      setStatus('idle');
      setErrorMessage('Recitation was too short. Please recite the verse clearly.');
      return;
    }

    evaluateAudioBuffer(merged, inputRate);
  }, [status, cleanupAudio, evaluateAudioBuffer]);

  /**
   * Starts live audio capture using 16kHz PCM streaming pipeline with VAD.
   */
  const startRecording = useCallback(async () => {
    setErrorMessage(null);
    pcmChunksRef.current = [];
    hasSpokenRef.current = false;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicPermissionState('denied');
      setErrorMessage('Audio recording is not supported in this browser environment.');
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

      mediaStreamRef.current = stream;
      setMicPermissionState('granted');

      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      // Use 2048 buffer size for ~46ms responsive audio processing frames
      const processor = audioCtx.createScriptProcessor(2048, 1, 1);
      scriptProcessorRef.current = processor;

      source.connect(processor);
      processor.connect(audioCtx.destination);

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Clone samples into storage buffer
        const copy = new Float32Array(inputData.length);
        copy.set(inputData);
        pcmChunksRef.current.push(copy);

        // Calculate RMS audio energy
        const volume = computeRmsVolume(inputData);
        setAudioLevel(volume);

        // Voice Activity Detection (VAD)
        if (volume > 15) {
          hasSpokenRef.current = true;
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        } else if (hasSpokenRef.current && volume <= 8) {
          // If silence detected after speaking, trigger auto-submit in 1.4 seconds
          if (!silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              stopRecording();
            }, 1400);
          }
        }
      };

      setStatus('listening');
      setRecordingSeconds(0);

      // Enforce 15-second max recitation guard
      recordIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 14) {
            stopRecording();
            return 15;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: unknown) {
      console.warn('Microphone permission or hardware error:', err);
      setMicPermissionState('denied');
      setErrorMessage('Microphone access was denied or is busy. Please enable microphone permissions in your browser.');
      setStatus('error');
    }
  }, [stopRecording]);

  const reset = useCallback(() => {
    cleanupAudio();
    setStatus('idle');
    setErrorMessage(null);
    setLatestFeedback(null);
    setLatencyMs(null);
  }, [cleanupAudio]);

  return {
    status,
    audioLevel,
    latencyMs,
    errorMessage,
    latestFeedback,
    micPermissionState,
    recordingSeconds,
    userProfile,
    startRecording,
    stopRecording,
    reset,
  };
}
