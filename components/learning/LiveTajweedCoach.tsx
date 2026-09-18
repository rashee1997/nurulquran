'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Mic,
  Square,
  Send,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Maximize2,
  Languages,
  Zap,
} from 'lucide-react';
import { useLiveTajweed, TajweedLiveFeedback } from '@/hooks/use-live-tajweed';
import { db } from '@/lib/db';
import {
  FEEDBACK_LANGUAGE_OPTIONS,
  FeedbackLanguage,
  isEnglishEnabled,
  isTamilEnabled,
  normalizeFeedbackLanguage,
} from '@/lib/i18n/language';
import { AudioLevelMeter } from './AudioLevelMeter';
import { TajweedColorKey } from '@/components/quran/TajweedColorKey';

interface LiveTajweedCoachProps {
  currentLessonTitle?: string;
  currentActivityTitle?: string;
  promptArabic?: string;
  targetRule?: string;
  isOpen?: boolean;
  onClose?: () => void;
  variant?: 'modal' | 'embedded';
  onExpandModal?: () => void;
}

interface CoachChatMessage {
  id: string;
  sender: 'user' | 'coach';
  textEn: string;
  textTa?: string;
  makhrajTip?: string;
  makhrajTipTa?: string;
  detectedErrors?: string[];
  accuracyRating?: string;
  /** Local clock time; empty until the component is mounted (avoids hydration mismatch). */
  timestamp: string;
  latencyMs?: number;
  /** Non-evaluative notices (service unavailable) are rendered as notices, never as grades. */
  isNotice?: boolean;
}

function formatClockTime(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Compact tri-state language picker — English & Tamil / English only / Tamil only. */
const LanguageSwitcher: React.FC<{
  value: FeedbackLanguage;
  onChange: (language: FeedbackLanguage) => void;
  tone?: 'surface' | 'hero';
}> = ({ value, onChange, tone = 'surface' }) => (
  <div
    className={`flex items-center gap-0.5 p-0.5 rounded-full border shrink-0 ${
      tone === 'hero' ? 'bg-hero-pill-bg border-hero-border' : 'bg-surface border-border'
    }`}
    role="group"
    aria-label="Reply language"
  >
    <Languages
      className={`w-3 h-3 ml-1 shrink-0 ${tone === 'hero' ? 'text-hero-muted' : 'text-muted-foreground'}`}
      aria-hidden="true"
    />
    {FEEDBACK_LANGUAGE_OPTIONS.map((option) => {
      const isActive = option.id === value;
      return (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          title={option.previewNote}
          aria-pressed={isActive}
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-colors ${
            isActive
              ? 'bg-primary text-primary-foreground'
              : tone === 'hero'
                ? 'text-hero-muted hover:text-hero-fg'
                : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {option.short}
        </button>
      );
    })}
  </div>
);

export const LiveTajweedCoach: React.FC<LiveTajweedCoachProps> = ({
  currentLessonTitle = 'Tajweed Practice',
  currentActivityTitle = 'Letter Pronunciation',
  promptArabic,
  targetRule,
  isOpen = true,
  onClose,
  variant = 'modal',
  onExpandModal,
}) => {
  const [messages, setMessages] = useState<CoachChatMessage[]>(() => [
    {
      id: 'm-init',
      sender: 'coach',
      textEn: `As-salamu alaykum! This is the Recitation Guide for "${currentLessonTitle}". Tap the microphone to recite "${promptArabic || 'the exercise'}" aloud for Makhraj and Tajweed feedback.`,
      textTa:
        'அஸ்ஸலாமு அலைக்கும்! நான் உங்கள் நேரலை தஜ்வீத் ஆசிரியர். மைக்ரோஃபோனை அழுத்தி ஓதி உங்கள் உச்சரிப்பை சரிபார்க்கலாம்.',
      timestamp: '',
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isTypingLoading, setIsTypingLoading] = useState(false);
  const [languageOverride, setLanguageOverride] = useState<FeedbackLanguage | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);

  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const messageCounterRef = useRef(0);
  const chatAbortRef = useRef<AbortController | null>(null);

  const nextMessageId = useCallback((prefix: string): string => {
    messageCounterRef.current += 1;
    return `${prefix}-${messageCounterRef.current}`;
  }, []);

  const {
    status,
    audioLevelRef,
    latencyMs,
    errorMessage,
    latestFeedback,
    recordingSeconds,
    userProfile,
    startRecording,
    stopRecording,
  } = useLiveTajweed({
    currentLessonTitle,
    currentActivityTitle,
    promptArabic,
    targetRule,
    language: languageOverride ?? undefined,
    onFeedbackReceived: useCallback(
      (feedback: TajweedLiveFeedback) => {
        setMessages((previous) => [
          ...previous,
          {
            id: nextMessageId('coach'),
            sender: 'coach',
            textEn: feedback.coachResponseEn,
            textTa: feedback.coachResponseTa,
            makhrajTip: feedback.makhrajTip,
            makhrajTipTa: feedback.makhrajTipTa,
            detectedErrors: feedback.detectedErrors,
            accuracyRating: feedback.accuracyRating,
            latencyMs: feedback.latencyMs,
            timestamp: formatClockTime(),
          },
        ]);
      },
      [nextMessageId]
    ),
  });

  // Localise the opening timestamp only after mount: server-rendered and client clock
  // strings differ by locale and timezone, which produced hydration errors. This is
  // the deliberate two-pass pattern for a client-only value — it runs once, on mount,
  // and cannot cascade because the update is idempotent (`timestamp.length === 0`).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hydration correction for a client-only clock value
    setMessages((previous) =>
      previous.map((message) =>
        message.id === 'm-init' && message.timestamp.length === 0
          ? { ...message, timestamp: formatClockTime() }
          : message
      )
    );
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, status, isTypingLoading]);

  // Modal behaviour: Escape to close, focus trapped inside, focus restored on close.
  useEffect(() => {
    if (!isOpen || variant !== 'modal') return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.focus();

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => element.offsetParent !== null
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen, onClose, variant]);

  useEffect(() => () => chatAbortRef.current?.abort(), []);

  const language = languageOverride ?? normalizeFeedbackLanguage(userProfile?.aiFeedbackLanguage);
  const showEnglish = isEnglishEnabled(language);
  const showTamil = isTamilEnabled(language);

  const handleLanguageChange = async (next: FeedbackLanguage): Promise<void> => {
    setLanguageOverride(next);
    try {
      await db.userProfile.update('default_user', { aiFeedbackLanguage: next });
    } catch (error) {
      console.warn('Failed to persist feedback language preference:', error);
    }
  };

  const sendTypedQuery = async (queryText?: string): Promise<void> => {
    const text = (queryText ?? inputQuery).trim();
    if (text.length === 0 || isTypingLoading) return;

    setMessages((previous) => [
      ...previous,
      {
        id: nextMessageId('user'),
        sender: 'user',
        textEn: text,
        timestamp: formatClockTime(),
      },
    ]);
    setInputQuery('');
    setChatError(null);
    setIsTypingLoading(true);

    chatAbortRef.current?.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;

    try {
      const response = await fetch('/api/tajweed/live-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          userQuery: text,
          currentLessonTitle,
          currentActivityTitle,
          promptArabic,
          targetRule,
          voiceId: userProfile?.aiVoiceId || 'Kore',
          teacherPersona: userProfile?.aiTeacherPersona || 'balanced',
          language,
        }),
      });

      const payload: unknown = await response.json().catch(() => null);
      const record = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};

      if (!response.ok) {
        const message =
          typeof record.error === 'string'
            ? record.error
            : 'The study assistant could not answer just now. Please retry.';
        setChatError(message);
        return;
      }

      const textEn = typeof record.coachResponseEn === 'string' ? record.coachResponseEn : '';
      const textTa = typeof record.coachResponseTa === 'string' ? record.coachResponseTa : '';
      const makhrajTip = typeof record.makhrajTip === 'string' ? record.makhrajTip : undefined;
      const makhrajTipTa = typeof record.makhrajTipTa === 'string' ? record.makhrajTipTa : undefined;
      const accuracyRating =
        typeof record.accuracyRating === 'string' ? record.accuracyRating : undefined;
      const detectedErrors = Array.isArray(record.detectedErrors)
        ? record.detectedErrors.filter((item): item is string => typeof item === 'string')
        : undefined;

      if (textEn.length === 0 && textTa.length === 0 && !makhrajTip && !makhrajTipTa) {
        setChatError('The study assistant returned an empty answer. Please retry.');
        return;
      }

      setMessages((previous) => [
        ...previous,
        {
          id: nextMessageId('coach'),
          sender: 'coach',
          textEn,
          textTa,
          makhrajTip,
          makhrajTipTa,
          detectedErrors,
          accuracyRating,
          timestamp: formatClockTime(),
        },
      ]);
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      console.error('Study assistant request failed:', error);
      setChatError('Could not reach the study assistant. Check your connection and retry.');
    } finally {
      if (!controller.signal.aborted) {
        setIsTypingLoading(false);
      }
    }
  };

  if (!isOpen && variant === 'modal') return null;

  const liveAnnouncement = latestFeedback
    ? `Recitation feedback received. ${latestFeedback.accuracyRating ? `Rating ${latestFeedback.accuracyRating}. ` : ''}${
        latestFeedback.coachResponseEn
      }`
    : errorMessage ?? (status === 'analyzing' ? 'Evaluating your recitation.' : '');

  const renderFeedbackDetails = (
    message: Pick<
      CoachChatMessage,
      'makhrajTip' | 'makhrajTipTa' | 'detectedErrors' | 'accuracyRating'
    >
  ) => (
    <>
      {((showEnglish && message.makhrajTip) || (showTamil && message.makhrajTipTa)) && (
        <div className="p-2 rounded-lg bg-secondary-subtle border border-secondary/30 text-secondary-strong text-[11px] flex items-start gap-1.5">
          <span className="shrink-0" aria-hidden="true">
            💡
          </span>
          <div className={showEnglish ? '' : 'font-tamil'}>
            <span className="font-bold block text-[10px] uppercase font-sans">
              {showEnglish ? 'Makhraj Alignment:' : 'மக்ரிஜ் சீரமைப்பு:'}
            </span>
            <span>{showEnglish ? message.makhrajTip : message.makhrajTipTa}</span>
          </div>
        </div>
      )}

      {message.detectedErrors && message.detectedErrors.length > 0 && (
        <div className="p-2 rounded-lg bg-danger-subtle border border-danger/30 text-danger-strong text-[11px] space-y-0.5">
          <span className="font-bold block text-[10px] uppercase">Detected issues</span>
          <ul className="list-disc pl-4 space-y-0.5">
            {message.detectedErrors.map((detected, index) => (
              <li key={index}>{detected}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );

  /* =========================================================================
     VARIANT: EMBEDDED DOCKED BAR (Inline directly under the recitation card)
     ========================================================================= */
  if (variant === 'embedded') {
    return (
      <div
        id="embedded-live-tajweed-coach"
        className="rounded-2xl border border-primary/25 bg-card shadow-xs overflow-hidden transition-all"
      >
        {/* Docked Control Header */}
        <div className="p-3 bg-surface border-b border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-primary-subtle text-primary flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-foreground">Recitation Guide</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary-subtle text-primary-strong">
                  {userProfile?.aiVoiceId || 'Kore'} • {userProfile?.aiTeacherPersona || 'balanced'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher value={language} onChange={handleLanguageChange} />
            {latencyMs !== null && (
              <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                <ZapIcon />
                <span>{latencyMs}ms</span>
              </span>
            )}
            {onExpandModal && (
              <button
                type="button"
                onClick={onExpandModal}
                className="p-1 rounded-lg hover:bg-surface-muted text-muted-foreground hover:text-foreground text-xs font-semibold flex items-center gap-1 transition-colors"
                title="Expand chat"
              >
                <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline text-[10px]">Expand</span>
              </button>
            )}
          </div>
        </div>

        {/*
          Reference, not the point of the screen: the coach exists for the learner to recite,
          so the key is collapsed and can be opened beside the rule they are practising. It is
          the same component the reader and the lessons render.
        */}
        <div className="px-3 pt-3">
          <TajweedColorKey variant="stacked" collapsible />
        </div>

        {/* Live Audio Recitation Bar */}
        <div className="p-3 sm:p-4 space-y-3">
          <p role="status" aria-live="polite" className="sr-only">
            {liveAnnouncement}
          </p>

          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-danger-subtle border border-danger/30 text-danger-strong text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="text-[11px] leading-tight">{errorMessage}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            {status === 'listening' ? (
              <div className="flex-1 flex items-center justify-between px-3 py-2 rounded-xl bg-danger-subtle border border-danger/30">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-ping" aria-hidden="true" />
                  <span className="text-xs font-bold text-danger-strong">
                    Reciting ({recordingSeconds}s)…
                  </span>
                </div>

                <AudioLevelMeter
                  levelRef={audioLevelRef}
                  active={status === 'listening'}
                  barClassName="w-1 bg-destructive rounded-full"
                />

                <button
                  type="button"
                  onClick={stopRecording}
                  className="px-2.5 py-1 rounded-lg bg-destructive text-destructive-foreground text-xs font-bold shadow-xs active:scale-95"
                >
                  Evaluate
                </button>
              </div>
            ) : status === 'analyzing' ? (
              <div className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-surface-muted border border-border text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-primary" aria-hidden="true" />
                <span>Checking Makhraj and timing…</span>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground leading-tight">
                  Tap the microphone to recite{' '}
                  <span className="font-arabic font-bold text-foreground text-sm" lang="ar" dir="rtl">
                    {promptArabic || 'this verse'}
                  </span>{' '}
                  aloud.
                </p>

                <button
                  type="button"
                  onClick={startRecording}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold flex items-center gap-1.5 shadow-xs active:scale-95 transition-all shrink-0"
                >
                  <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Recite Aloud</span>
                </button>
              </div>
            )}
          </div>

          {latestFeedback && (
            <div className="p-3 rounded-xl bg-surface border border-border space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-success" aria-hidden="true" />
                  <span className="text-[11px] font-bold text-foreground">
                    Teacher feedback
                    {latestFeedback.tajweedRuleName ? ` (${latestFeedback.tajweedRuleName})` : ''}
                  </span>
                </div>
                {latestFeedback.accuracyRating && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary-subtle text-secondary-strong">
                    {latestFeedback.accuracyRating}
                  </span>
                )}
              </div>

              {showEnglish && latestFeedback.coachResponseEn && (
                <p className="text-xs text-foreground leading-relaxed">{latestFeedback.coachResponseEn}</p>
              )}

              {showTamil && latestFeedback.coachResponseTa && (
                <p className="font-tamil text-[11px] text-muted-foreground pt-1 border-t border-border leading-relaxed">
                  <span className="font-sans font-bold text-primary-strong text-[10px] mr-1">தமிழ்:</span>
                  {latestFeedback.coachResponseTa}
                </p>
              )}

              {renderFeedbackDetails(latestFeedback)}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* =========================================================================
     VARIANT: MODAL DIALOG (Full-featured chat & deep diagnostic consultation)
     ========================================================================= */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-tajweed-coach-title"
        tabIndex={-1}
        className="bg-card rounded-3xl w-full max-w-lg h-[640px] max-h-[90vh] flex flex-col border border-border shadow-2xl overflow-hidden focus:outline-hidden"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 bg-hero-bg text-hero-fg border-b border-hero-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-hero-card-bg flex items-center justify-center text-secondary">
              <Sparkles className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="live-tajweed-coach-title" className="text-sm font-bold">
                  Recitation Guide
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-hero-pill-bg text-hero-pill-fg">
                  Voice: {userProfile?.aiVoiceId || 'Kore'}
                </span>
                <LanguageSwitcher value={language} onChange={handleLanguageChange} tone="hero" />
              </div>
              <p className="text-[11px] text-hero-muted truncate max-w-[240px]">
                {currentLessonTitle} • {currentActivityTitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {latencyMs !== null && (
              <span className="text-[10px] font-mono text-hero-muted hidden sm:flex items-center gap-0.5">
                <ZapIcon />
                <span>{latencyMs}ms</span>
              </span>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-xl hover:bg-hero-card-bg text-hero-muted hover:text-hero-fg transition-colors"
                aria-label="Close Recitation Guide"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Current Prompt Context Banner */}
        {promptArabic && (
          <div className="px-4 py-2.5 bg-primary-subtle border-b border-primary/20 flex items-center justify-between text-xs shrink-0">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-primary-strong uppercase tracking-wider block">
                Target passage:
              </span>
              <span className="text-[11px] text-muted-foreground">{targetRule || 'Tajweed & Makharij'}</span>
            </div>
            <span className="font-arabic text-2xl font-bold text-foreground select-text leading-tight" lang="ar" dir="rtl">
              {promptArabic}
            </span>
          </div>
        )}

        {/* Messages List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <p role="status" aria-live="polite" className="sr-only">
            {liveAnnouncement}
          </p>

          {messages.map((message) => {
            const isCoach = message.sender === 'coach';
            return (
              <div key={message.id} className={`flex gap-2.5 ${isCoach ? 'justify-start' : 'justify-end'}`}>
                {isCoach && (
                  <div className="w-7 h-7 rounded-full bg-primary-subtle text-primary flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl p-3.5 text-xs space-y-2 shadow-2xs leading-relaxed ${
                    isCoach
                      ? 'bg-surface border border-border text-foreground'
                      : 'bg-primary text-primary-foreground font-medium'
                  }`}
                >
                  {(!isCoach || showEnglish) && <p>{message.textEn}</p>}

                  {isCoach && showTamil && message.textTa && (
                    <p className="font-tamil text-foreground pt-1 border-t border-border">
                      <span className="font-sans font-bold text-primary-strong text-[10px] block mb-0.5">
                        தமிழ் விளக்கம்:
                      </span>
                      {message.textTa}
                    </p>
                  )}

                  {isCoach && renderFeedbackDetails(message)}

                  <div className="flex items-center justify-between pt-1 text-[9px] opacity-70">
                    {message.accuracyRating && (
                      <span className="font-bold uppercase tracking-wider text-primary-strong">
                        Rating: {message.accuracyRating}
                      </span>
                    )}
                    <span className="ml-auto">{message.timestamp}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {(status === 'analyzing' || isTypingLoading) && (
            <div className="flex gap-2.5 items-center text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin text-primary" aria-hidden="true" />
              <span>Checking makhraj, harakat and Tajweed rules…</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-2xl bg-danger-subtle border border-danger/30 text-danger-strong text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          )}

          {chatError && (
            <div className="p-3 rounded-2xl bg-danger-subtle border border-danger/30 text-danger-strong text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{chatError}</span>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Quick Question Chips */}
        <div className="px-4 py-2 border-t border-border bg-card flex gap-2 overflow-x-auto no-scrollbar shrink-0">
          {showEnglish && (
            <button
              onClick={() => void sendTypedQuery('How do I articulate this clearly from its primary Makhraj point?')}
              className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-surface border border-border text-muted-foreground hover:text-foreground hover:bg-surface-hover whitespace-nowrap transition-colors"
            >
              How to articulate?
            </button>
          )}
          {showTamil && (
            <button
              onClick={() => void sendTypedQuery('Explain this Tajweed rule and vowel timing in Tamil (தமிழ் விளக்கம்).')}
              className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-surface border border-border text-muted-foreground hover:text-foreground hover:bg-surface-hover whitespace-nowrap transition-colors font-tamil"
            >
              தமிழ் விளக்கம்
            </button>
          )}
          {showEnglish && (
            <button
              onClick={() => void sendTypedQuery('What common mistakes do students make with this letter or rule?')}
              className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-surface border border-border text-muted-foreground hover:text-foreground hover:bg-surface-hover whitespace-nowrap transition-colors"
            >
              Common mistakes
            </button>
          )}
        </div>

        {/* Input & Voice Controls */}
        <div className="p-3 sm:p-4 bg-surface border-t border-border flex flex-col gap-2 shrink-0">
          {status === 'listening' && (
            <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-danger-subtle border border-danger/30 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-ping" aria-hidden="true" />
                <span className="font-bold text-danger-strong">
                  Listening to recitation ({recordingSeconds}s)…
                </span>
                <span className="text-[10px] text-muted-foreground hidden sm:inline">
                  (Stops automatically on a pause)
                </span>
              </div>

              <AudioLevelMeter
                levelRef={audioLevelRef}
                active={status === 'listening'}
                maxHeight={16}
                className="flex items-center gap-0.5 h-4"
                barClassName="w-1 bg-destructive rounded-full"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            {status !== 'listening' ? (
              <button
                type="button"
                onClick={startRecording}
                className="p-3 rounded-2xl bg-danger-subtle hover:bg-danger/20 text-danger-strong border border-danger/30 active:scale-95 transition-all shadow-xs"
                aria-label="Start recording your recitation"
                title="Tap to speak or recite aloud"
              >
                <Mic className="w-4 h-4" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="px-3 py-2.5 rounded-2xl bg-destructive text-destructive-foreground font-bold text-xs flex items-center gap-1.5 active:scale-95 transition-all shadow-md"
                aria-label="Stop recording and evaluate"
              >
                <Square className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Stop Now</span>
              </button>
            )}

            <label htmlFor="live-coach-question" className="sr-only">
              Ask the recitation guide a question
            </label>
            <input
              id="live-coach-question"
              type="text"
              value={inputQuery}
              onChange={(event) => setInputQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendTypedQuery();
                }
              }}
              placeholder="Ask a question or tap the mic to recite…"
              className="flex-1 bg-card border border-border rounded-2xl px-3.5 py-2.5 text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
            />

            <button
              type="button"
              onClick={() => void sendTypedQuery()}
              disabled={inputQuery.trim().length === 0 || isTypingLoading}
              aria-label="Send question"
              className="p-2.5 rounded-2xl bg-primary hover:bg-primary-hover disabled:opacity-40 text-primary-foreground transition-all shadow-xs active:scale-95"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Small inline bolt glyph used in the latency read-outs. */
const ZapIcon: React.FC = () => <Zap className="w-3 h-3 text-secondary" aria-hidden="true" />;
