'use client';

import React, { useState } from 'react';
import {
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Send,
  Sparkles,
  Volume2,
  Captions,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { VoiceActivityWaveform } from './VoiceActivityWaveform';
import type { UseGeminiLiveTafsirResult } from '@/hooks/use-gemini-live-tafsir';
import type { LiveStorytellerStatus, TafsirLanguage } from '@/lib/tafsir/types';

interface GeminiLiveStorytellerBarProps {
  live: UseGeminiLiveTafsirResult;
  /** Null until the lesson has assembled; the start control waits for it. */
  lessonReady: boolean;
  language: TafsirLanguage;
}

type StatusTone = 'idle' | 'busy' | 'live' | 'speaking' | 'error';

const STATUS_PRESENTATION: Record<
  LiveStorytellerStatus,
  { label: string; labelTamil: string; tone: StatusTone }
> = {
  idle: { label: 'Storyteller is off', labelTamil: 'கதை ஆசிரியர் அணைக்கப்பட்டுள்ளார்', tone: 'idle' },
  requesting_token: { label: 'Opening a lesson…', labelTamil: 'இணைக்கிறது…', tone: 'busy' },
  connecting: { label: 'Connecting…', labelTamil: 'இணைக்கிறது…', tone: 'busy' },
  reconnecting: {
    label: 'Reconnecting…',
    labelTamil: 'மீண்டும் இணைக்கிறது…',
    tone: 'busy',
  },
  active: { label: 'Listening to you', labelTamil: 'உங்களைக் கேட்கிறார்', tone: 'live' },
  speaking: { label: 'Ameen is telling the story', labelTamil: 'ஆமீன் கதை சொல்கிறார்', tone: 'speaking' },
  interrupted: { label: 'Your turn', labelTamil: 'உங்கள் முறை', tone: 'live' },
  error: { label: 'Voice session stopped', labelTamil: 'குரல் அமர்வு நின்றது', tone: 'error' },
  unsupported: { label: 'Voice not supported here', labelTamil: 'இங்கு குரல் ஆதரவு இல்லை', tone: 'error' },
};

const TONE_CLASSES: Record<StatusTone, string> = {
  idle: 'bg-surface-muted text-muted-foreground border-border',
  busy: 'bg-info-subtle text-info-strong border-info/40',
  live: 'bg-success-subtle text-success-strong border-success/40',
  speaking: 'bg-secondary-subtle text-secondary-strong border-secondary/40',
  error: 'bg-destructive-subtle text-destructive-strong border-destructive/40',
};

const RUNNING_STATUSES: readonly LiveStorytellerStatus[] = [
  'requesting_token',
  'connecting',
  'reconnecting',
  'active',
  'speaking',
  'interrupted',
];

/**
 * The audio control bar for the Live storyteller.
 *
 * Owns no audio state of its own: the session lives in `useGeminiLiveTafsir` and is passed
 * in, so exactly one microphone stream and one WebSocket exist no matter how often this
 * header re-renders. The waveform reads its level from a ref, so speaking does not re-render
 * this component either.
 */
export const GeminiLiveStorytellerBar: React.FC<GeminiLiveStorytellerBarProps> = ({
  live,
  lessonReady,
  language,
}) => {
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const { status, errorMessage, model, micLevelRef, transcript, isMuted } = live;
  const isRunning = RUNNING_STATUSES.includes(status);
  const presentation = STATUS_PRESENTATION[status];

  const submitQuestion = (event: React.FormEvent): void => {
    event.preventDefault();
    const question = draft.trim();
    if (question.length === 0) return;
    live.askAmeen(question);
    setDraft('');
  };

  return (
    <section
      id="tafsir-live-storyteller"
      aria-label="Voice storyteller"
      className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden"
    >
      <div className="flex flex-wrap items-center gap-3 p-3.5 sm:p-4">
        <div className="flex items-center gap-2 shrink-0">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
              isRunning
                ? 'bg-primary-subtle text-primary-strong border-primary/30'
                : 'bg-surface-muted text-muted-foreground border-border'
            }`}
          >
            {status === 'requesting_token' ||
            status === 'connecting' ||
            status === 'reconnecting' ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Radio className="w-4 h-4" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground leading-tight">Ustadh Ameen</p>
            <p className="text-[11px] text-muted-foreground leading-tight">
              Voice storyteller · Live audio
            </p>
          </div>
        </div>

        <span
          className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold shrink-0 ${TONE_CLASSES[presentation.tone]}`}
          role="status"
          aria-live="polite"
        >
          {language === 'ta' && !isRunning ? presentation.labelTamil : presentation.label}
        </span>

        <VoiceActivityWaveform
          levelRef={micLevelRef}
          isActive={status === 'active' || status === 'interrupted' || status === 'speaking'}
          isMuted={isMuted}
          className="h-9 flex-1 min-w-[120px]"
        />

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {isRunning ? (
            <>
              <button
                type="button"
                onClick={live.toggleMute}
                aria-pressed={isMuted}
                title={isMuted ? 'Unmute your microphone' : 'Mute your microphone'}
                className={`p-2 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  isMuted
                    ? 'bg-warning-subtle text-warning-strong border-warning/40'
                    : 'bg-surface border-border hover:bg-surface-hover text-foreground'
                }`}
              >
                {isMuted ? (
                  <MicOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Mic className="w-4 h-4" aria-hidden="true" />
                )}
                <span className="hidden sm:inline">{isMuted ? 'Muted' : 'Mic on'}</span>
              </button>

              <button
                type="button"
                onClick={live.tellCurrentStory}
                disabled={!lessonReady}
                className="p-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold transition-opacity hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                <span>Tell me the story</span>
              </button>

              <button
                type="button"
                onClick={live.stop}
                className="p-2 rounded-xl bg-destructive text-destructive-foreground text-xs font-bold transition-opacity hover:opacity-90 flex items-center gap-1.5"
              >
                <PhoneOff className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">End</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={live.start}
              disabled={!lessonReady || status === 'unsupported'}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold transition-opacity hover:opacity-90 disabled:opacity-40 flex items-center gap-2"
            >
              <Volume2 className="w-4 h-4" aria-hidden="true" />
              <span>Start voice lesson</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setTranscriptOpen((open) => !open)}
            aria-expanded={transcriptOpen}
            aria-controls="tafsir-transcript"
            className="p-2 rounded-xl bg-surface border border-border hover:bg-surface-hover text-foreground transition-colors"
            title="Show or hide the lesson transcript"
          >
            <Captions className="w-4 h-4" aria-hidden="true" />
            <span className="sr-only">Toggle transcript</span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-2 px-4 py-2.5 border-t border-destructive/30 bg-destructive-subtle text-destructive-strong text-[11px] font-medium"
        >
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      {transcriptOpen && (
        <div id="tafsir-transcript" className="border-t border-border">
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Lesson transcript
            </span>
            <div className="flex items-center gap-3">
              {model && (
                <span className="text-[10px] font-mono text-muted-foreground">{model}</span>
              )}
              {transcript.length > 0 && (
                <button
                  type="button"
                  onClick={live.clearTranscript}
                  className="text-[11px] font-semibold text-primary hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/*
            The transcript is a live speech-to-text rendering of the spoken lesson, not
            scripture. It is still marked untranslatable so a browser translation engine
            cannot rewrite the Arabic terms and Tamil sentences Ameen actually said.
          */}
          <div
            translate="no"
            className="notranslate max-h-56 overflow-y-auto px-4 pb-3 space-y-2"
          >
            {transcript.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                Nothing yet. Start the voice lesson and Ameen&rsquo;s words will appear here as he
                speaks.
              </p>
            ) : (
              transcript.map((line) => (
                <p key={line.id} className="text-xs leading-relaxed">
                  <span
                    className={`font-bold mr-1.5 ${
                      line.speaker === 'ameen' ? 'text-primary-strong' : 'text-secondary-strong'
                    }`}
                  >
                    {line.speaker === 'ameen' ? 'Ameen' : 'You'}:
                  </span>
                  <span
                    className={
                      line.speaker === 'ameen' ? 'text-foreground font-tamil' : 'text-muted-foreground'
                    }
                  >
                    {line.text}
                  </span>
                </p>
              ))
            )}
          </div>
        </div>
      )}

      {isRunning && (
        <form
          onSubmit={submitQuestion}
          className="flex items-center gap-2 px-3.5 pb-3.5 sm:px-4 sm:pb-4"
        >
          <label htmlFor="tafsir-question" className="sr-only">
            Ask Ameen a question
          </label>
          <input
            id="tafsir-question"
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask Ameen a question about this ayah…"
            maxLength={500}
            className="flex-1 px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
          />
          <button
            type="submit"
            disabled={draft.trim().length === 0}
            className="p-2 rounded-xl bg-surface border border-border hover:bg-surface-hover text-foreground disabled:opacity-40 transition-colors"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
            <span className="sr-only">Send question</span>
          </button>
        </form>
      )}
    </section>
  );
};
