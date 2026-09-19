'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Cloud, Cpu, Loader2 } from 'lucide-react';
import { SpeechOrchestrator, type OrchestratorStatus } from '@/lib/audio/speech-orchestrator';
import type { EngineWordScore } from '@/lib/audio/capture-engine';
import { playReferenceClip, speakCoachCue, wordClipUrl } from '@/lib/audio/coach-tts';
import { showToast } from '@/lib/ui/toast';

/**
 * Reactive recitation coach dashboard.
 *
 * Word colors are driven by worker GOP scores: neutral grey → vivid green (correct) / red
 * (mispronounced). The orchestrator and the DOM never mix: React owns the word strip state,
 * and the orchestrator's per-frame traffic flows exclusively through refs and the worker, so
 * streaming audio never re-renders the tree.
 */

type WordState = 'neutral' | 'correct' | 'mispronounced' | 'active';

interface CoachCanvasProps {
  /** Uthmani words of the target verse, in order. */
  words: string[];
  verseKey: string;
}

const WORD_STATE_CLASS: Record<WordState, string> = {
  neutral: 'text-muted-foreground',
  correct: 'text-success-strong',
  mispronounced: 'text-danger-strong font-bold',
  active: 'text-primary underline decoration-primary/60 decoration-2 underline-offset-8',
};

const STATUS_META: Record<OrchestratorStatus, { label: string; icon: React.ElementType; className: string }> = {
  idle: { label: 'Ready', icon: Mic, className: 'bg-surface text-muted-foreground border-border' },
  connecting: { label: 'Connecting…', icon: Loader2, className: 'bg-info-subtle text-info-strong border-info/40' },
  'gemini-live': { label: 'Cloud coach', icon: Cloud, className: 'bg-success-subtle text-success-strong border-success/40' },
  'failover-pending': { label: 'Switching…', icon: Loader2, className: 'bg-warning-subtle text-warning-strong border-warning/40' },
  'local-engine': { label: 'On-device engine', icon: Cpu, className: 'bg-secondary-subtle text-secondary-strong border-secondary/40' },
  stopped: { label: 'Stopped', icon: Square, className: 'bg-surface text-muted-foreground border-border' },
  error: { label: 'Error', icon: Square, className: 'bg-danger-subtle text-danger-strong border-danger/40' },
};

export function RecitationCoachCanvas({ words, verseKey }: CoachCanvasProps) {
  const [status, setStatus] = useState<OrchestratorStatus>('idle');
  const [wordStates, setWordStates] = useState<WordState[]>(() => words.map(() => 'neutral'));
  const [coachMessage, setCoachMessage] = useState<string | null>(null);
  const orchestratorRef = useRef<SpeechOrchestrator | null>(null);
  const wordStatesRef = useRef<WordState[]>(wordStates);

  // Reset colors whenever the target verse changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets local UI state when the drilled verse changes; the same effect keeps the parallel mirror ref in sync so the audio callback never reads stale colors
    setWordStates(words.map(() => 'neutral'));
    wordStatesRef.current = words.map(() => 'neutral');
  }, [words, verseKey]);

  const applyScores = (scores: EngineWordScore[]): void => {
    const next = [...wordStatesRef.current];
    for (const score of scores) {
      if (score.verseKey !== verseKey) continue;
      if (score.wordIndex < next.length) {
        next[score.wordIndex] =
          score.verdict === 'correct' ? 'correct' : score.verdict === 'mispronounced' ? 'mispronounced' : 'neutral';
      }
    }
    wordStatesRef.current = next;
    setWordStates(next);
  };

  const handleStart = async (): Promise<void> => {
    if (orchestratorRef.current) return;
    setCoachMessage(null);

    const orchestrator = new SpeechOrchestrator(
      {
        onStatus: (next, detail) => {
          setStatus(next);
          if (next === 'failover-pending') {
            showToast(detail ?? 'Cloud coach unavailable — switched to the on-device engine.', 'info');
          }
          if (next === 'error') {
            showToast(detail ?? 'The recitation coach hit an error.', 'error');
          }
        },
        onWordScores: applyScores,
        onCoachCue: (lang, text) => {
          setCoachMessage(text);
          speakCoachCue(lang, text);
        },
        onReferenceAudioRequest: (key, wordIndex) => {
          void playReferenceClip(wordClipUrl(key, wordIndex));
        },
        onError: (message) => showToast(message, 'error'),
      },
      {
        tokenRefresher: async () => {
          try {
            const response = await fetch('/api/tafsir/live-session', { method: 'POST' });
            if (!response.ok) return null;
            const payload = (await response.json()) as { token?: string };
            return payload.token ?? null;
          } catch {
            return null;
          }
        },
      }
    );

    orchestratorRef.current = orchestrator;
    await orchestrator.start({ verseKey, words });
  };

  const handleStop = async (): Promise<void> => {
    await orchestratorRef.current?.stop();
    orchestratorRef.current = null;
    setStatus('stopped');
  };

  useEffect(() => {
    return () => {
      void orchestratorRef.current?.stop();
      orchestratorRef.current = null;
    };
  }, []);

  const meta = STATUS_META[status];
  const StatusIcon = meta.icon;
  const sessionActive = status !== 'idle' && status !== 'stopped' && status !== 'error';
  const isTransitioning = status === 'connecting' || status === 'failover-pending';

  return (
    <div className="rounded-3xl border border-border bg-card p-6 sm:p-8 space-y-6 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${meta.className}">
          <StatusIcon className={`w-3.5 h-3.5 ${isTransitioning ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>{meta.label}</span>
        </div>
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Surah {verseKey.split(':')[0]} · Ayah {verseKey.split(':')[1]}
        </span>
      </div>

      {/* Word strip: RTL, Uthmani, colored by live GOP verdicts. */}
      <div className="flex flex-row-reverse flex-wrap justify-end gap-x-3 gap-y-4" dir="rtl" lang="ar">
        {words.map((word, index) => (
          <span
            key={`${verseKey}-${index}`}
            className={`font-arabic text-3xl sm:text-4xl leading-loose select-text transition-colors duration-300 ${WORD_STATE_CLASS[wordStates[index] ?? 'neutral']}`}
          >
            {word}
          </span>
        ))}
      </div>

      {coachMessage && (
        <p role="status" className="rounded-xl bg-secondary-subtle px-4 py-3 text-xs font-semibold text-secondary-strong">
          {coachMessage}
        </p>
      )}

      <div className="flex items-center justify-center pt-2 border-t border-border">
        {!sessionActive ? (
          <button
            type="button"
            onClick={() => void handleStart()}
            disabled={isTransitioning}
            className="inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-md transition-all hover:bg-primary-hover active:scale-95 disabled:opacity-50"
          >
            <Mic className="w-4 h-4" aria-hidden="true" />
            <span>Start recitation</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleStop()}
            className="inline-flex items-center gap-2 rounded-2xl bg-card border border-border px-6 py-3 text-sm font-bold text-foreground shadow-md transition-all hover:bg-surface-hover active:scale-95"
          >
            <Square className="w-4 h-4 text-danger" aria-hidden="true" />
            <span>Stop</span>
          </button>
        )}
      </div>
    </div>
  );
}
