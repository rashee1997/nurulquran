'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  Loader2,
  MessageCircleQuestion,
  Mic,
  Send,
  Square,
  ThumbsUp,
} from 'lucide-react';
import { db } from '@/lib/db';
import { arrayBufferToBase64 } from '@/lib/audio/pcm-audio';
import type { ReflectionReply, ReflectionVerdict, TafsirLanguage } from '@/lib/tafsir/types';

interface InteractiveReflectionBlockProps {
  surah: number;
  ayah: number;
  surahNameSimple: string;
  language: TafsirLanguage;
  /** True once the lesson context exists; a reflection is graded against that context. */
  lessonReady: boolean;
}

/** Hard ceiling on a single spoken answer, so a stuck microphone cannot run forever. */
const MAX_RECORDING_SECONDS = 20;

const VERDICT_PRESENTATION: Record<
  ReflectionVerdict,
  { label: string; className: string; icon: React.ElementType }
> = {
  understood: {
    label: 'You understood it',
    className: 'bg-success-subtle text-success-strong border-success/30',
    icon: ThumbsUp,
  },
  partly: {
    label: 'Almost — keep going',
    className: 'bg-warning-subtle text-warning-strong border-warning/30',
    icon: Lightbulb,
  },
  needs_story: {
    label: 'Let us hear the story again',
    className: 'bg-info-subtle text-info-strong border-info/30',
    icon: MessageCircleQuestion,
  },
};

type ReflectionStatus = 'idle' | 'recording' | 'submitting' | 'answered' | 'error';

function readErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'object' && payload !== null) {
    const message = (payload as Record<string, unknown>).error;
    if (typeof message === 'string' && message.trim().length > 0) return message.trim();
  }
  return fallback;
}

/**
 * Reflection check for one ayah: the child explains what they understood, in writing or out
 * loud, and Ameen responds.
 *
 * Voice answers use `MediaRecorder` (webm/opus, which the evaluation route already accepts)
 * rather than the Live session's raw PCM pipeline. A reflection is a discrete, bounded clip
 * that is uploaded once, so the simpler encoding is the right tool; the streaming 16 kHz PCM
 * path exists for the continuous bidirectional session.
 *
 * Every resource is released on stop and on unmount: the recorder, the microphone tracks, the
 * auto-stop timer and the in-flight request. A permission prompt answered after navigation
 * cannot leave a live microphone behind, because the pending start re-checks a generation
 * counter before attaching.
 */
export const InteractiveReflectionBlock: React.FC<InteractiveReflectionBlockProps> = ({
  surah,
  ayah,
  surahNameSimple,
  language,
  lessonReady,
}) => {
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<ReflectionStatus>('idle');
  const [reply, setReply] = useState<ReflectionReply | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const preferredLanguage = language === 'ta' ? 'ta' : 'en';

  const releaseCapture = useCallback((): void => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        /* already stopping */
      }
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
  }, []);

  const submit = useCallback(
    async (payload: { question?: string; audioBase64?: string }): Promise<void> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const generation = generationRef.current;
      setStatus('submitting');
      setErrorMessage(null);

      try {
        const response = await fetch('/api/tafsir/reflect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            surah,
            ayah,
            language: preferredLanguage,
            ...payload,
          }),
        });

        if (generation !== generationRef.current) return;

        if (!response.ok) {
          const body: unknown = await response.json().catch(() => null);
          setErrorMessage(
            readErrorMessage(body, 'Your reflection could not be reviewed. Please try again.')
          );
          setStatus('error');
          return;
        }

        const parsed = (await response.json()) as ReflectionReply;
        if (generation !== generationRef.current) return;

        setReply(parsed);
        setStatus('answered');

        // Progress is recorded only after a reply actually arrives, so an unanswered attempt
        // never counts towards the surah's reflection progress.
        const verseKey = `${surah}:${ayah}`;
        try {
          const existing = await db.tafsirProgress.get(verseKey);
          await db.tafsirProgress.put({
            verseKey,
            surah,
            ayah,
            state: 'reflected',
            reflectionCount: (existing?.reflectionCount ?? 0) + 1,
            lastReflectionAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        } catch (progressError: unknown) {
          console.warn('Reflection progress could not be saved:', progressError);
        }
      } catch (error: unknown) {
        if (controller.signal.aborted || generation !== generationRef.current) return;
        console.error('Reflection submission failed:', error);
        setErrorMessage('The reflection service could not be reached. Please try again.');
        setStatus('error');
      }
    },
    [ayah, preferredLanguage, surah]
  );

  const stopRecording = useCallback((): void => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    // `onstop` performs the upload once the final chunk has been flushed.
    try {
      recorder.stop();
    } catch (error: unknown) {
      console.warn('Recorder could not be stopped:', error);
      releaseCapture();
      setStatus('idle');
    }
  }, [releaseCapture]);

  const startRecording = useCallback((): void => {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setErrorMessage('Recording is not supported in this browser. Please type your answer instead.');
      setStatus('error');
      return;
    }

    generationRef.current += 1;
    const generation = generationRef.current;

    setReply(null);
    setErrorMessage(null);
    setStatus('recording');
    setRecordingSeconds(0);

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // The permission prompt may resolve after a navigation; never attach then.
        if (generation !== generationRef.current) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }

        streamRef.current = stream;
        chunksRef.current = [];

        const mimeType = MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : '';

        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        recorderRef.current = recorder;

        recorder.ondataavailable = (event: BlobEvent) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          chunksRef.current = [];
          releaseCapture();

          if (generation !== generationRef.current) return;

          if (blob.size === 0) {
            setErrorMessage('That recording was empty. Please try again, or type your answer.');
            setStatus('error');
            return;
          }

          void (async () => {
            const buffer = await blob.arrayBuffer();
            const base64 = arrayBufferToBase64(buffer);
            await submit({ audioBase64: base64 });
          })();
        };

        recorder.start();

        timerRef.current = setInterval(() => {
          setRecordingSeconds((previous) => Math.min(previous + 1, MAX_RECORDING_SECONDS));
        }, 1000);

        autoStopRef.current = setTimeout(() => stopRecording(), MAX_RECORDING_SECONDS * 1000);
      } catch (error: unknown) {
        console.warn('Microphone could not be opened for the reflection:', error);
        setErrorMessage(
          'Microphone access was denied or the device is busy. You can type your answer instead.'
        );
        setStatus('error');
        releaseCapture();
      }
    })();
  }, [releaseCapture, stopRecording, submit]);

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      releaseCapture();
    };
  }, [releaseCapture]);

  const verseKey = `${surah}:${ayah}`;
  const [renderedVerseKey, setRenderedVerseKey] = useState(verseKey);

  /*
   * A new ayah is a new question: never leave the previous verse's reply on screen beside the
   * new Arabic text. Resetting during render is React's documented pattern for adjusting state
   * when a prop changes, and it avoids the cascading render an effect would cause.
   */
  if (verseKey !== renderedVerseKey) {
    setRenderedVerseKey(verseKey);
    setReply(null);
    setDraft('');
    setErrorMessage(null);
    setStatus('idle');
    setRecordingSeconds(0);
  }

  /*
   * The microphone and the recorder are external resources, so releasing them belongs in an
   * effect. Without this, navigating to the next ayah mid-recording left the recorder and the
   * microphone running with no visible control, and the pending upload was only invalidated on
   * unmount. The generation bump makes any late `onstop` bail out instead of submitting the
   * previous verse's answer against the new one.
   */
  useEffect(() => {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    releaseCapture();
  }, [verseKey, releaseCapture]);

  return (
    <section
      id="tafsir-reflection"
      aria-label="Your reflection"
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface-muted">
        <MessageCircleQuestion className="w-4 h-4 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-bold text-foreground">Your turn</h2>
        <span className="text-[11px] text-muted-foreground ml-auto hidden sm:inline">
          {surahNameSimple} {surah}:{ayah}
        </span>
      </div>

      <div className="p-4 space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          In your own words — what did this ayah teach you? Tell Ameen by text, or say it out loud.
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            const question = draft.trim();
            if (question.length === 0) return;
            setReply(null);
            void submit({ question });
          }}
          className="space-y-2"
        >
          <label htmlFor="tafsir-reflection-input" className="sr-only">
            Your reflection
          </label>
          <textarea
            id="tafsir-reflection-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            maxLength={2000}
            disabled={status === 'submitting' || status === 'recording'}
            placeholder="For example: I learned that Allah is the Most Merciful, and that being kind is a way of thanking Him…"
            className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40 disabled:opacity-60 resize-y"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={!lessonReady || draft.trim().length === 0 || status === 'submitting' || status === 'recording'}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {status === 'submitting' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{status === 'submitting' ? 'Ameen is reading…' : 'Send to Ameen'}</span>
            </button>

            {status === 'recording' ? (
              <button
                type="button"
                onClick={stopRecording}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive text-destructive-foreground text-xs font-bold transition-opacity hover:opacity-90"
              >
                <Square className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Stop · {recordingSeconds}s</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={!lessonReady || status === 'submitting'}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface border border-border hover:bg-surface-hover text-foreground text-xs font-bold transition-colors disabled:opacity-40"
              >
                <Mic className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                <span>Answer by voice</span>
              </button>
            )}

            {status === 'recording' && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-destructive">
                <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" aria-hidden="true" />
                Recording — up to {MAX_RECORDING_SECONDS}s
              </span>
            )}
          </div>
        </form>

        {errorMessage && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive-subtle px-3.5 py-2.5 text-[11px] font-medium text-destructive-strong"
          >
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        {reply && (
          /*
            Ameen's reply quotes and paraphrases the commentary, so it carries the same
            protection as the reader: a translation engine must not rewrite the Tamil or the
            Arabic terms inside it.
          */
          <div
            translate="no"
            className="notranslate rounded-xl border border-primary/30 bg-primary-subtle p-3.5 space-y-2.5"
          >
            <p className="text-sm font-semibold text-foreground leading-relaxed flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-primary-strong" aria-hidden="true" />
              <span>{reply.encouragement}</span>
            </p>

            {reply.explanation && (
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                {reply.explanation}
              </p>
            )}

            {reply.followUpQuestion && (
              <p className="text-xs font-semibold text-primary-strong leading-relaxed flex items-start gap-2">
                <MessageCircleQuestion className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{reply.followUpQuestion}</span>
              </p>
            )}

            {reply.verdict &&
              (() => {
                const presentation = VERDICT_PRESENTATION[reply.verdict];
                const VerdictIcon = presentation.icon;
                return (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${presentation.className}`}
                  >
                    <VerdictIcon className="w-3 h-3" aria-hidden="true" />
                    {presentation.label}
                  </span>
                );
              })()}
          </div>
        )}
      </div>
    </section>
  );
};
