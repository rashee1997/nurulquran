'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Mic,
  Square,
  Volume2,
  Send,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  HelpCircle,
  RotateCcw,
  Zap,
  Maximize2,
  Minimize2,
  Languages,
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
  accuracyRating?: string;
  timestamp: string;
  latencyMs?: number;
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
    title="Reply language"
  >
    <Languages
      className={`w-3 h-3 ml-1 shrink-0 ${tone === 'hero' ? 'text-hero-muted' : 'text-muted-foreground'}`}
    />
    {FEEDBACK_LANGUAGE_OPTIONS.map((option) => {
      const isActive = option.id === value;
      return (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          title={option.previewNote}
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
      textTa: `அஸ்ஸலாமு அலைக்கும்! நான் உங்கள் நேரலை தஜ்வீத் ஆசிரியர். மைக்ரோஃபோனை அழுத்தி ஓதி உங்கள் உச்சரிப்பை சரிபார்க்கலாம்.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isTypingLoading, setIsTypingLoading] = useState(false);
  const [languageOverride, setLanguageOverride] = useState<FeedbackLanguage | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Hook for Web Audio 16kHz PCM streaming and Gemini live evaluation
  const {
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
  } = useLiveTajweed({
    currentLessonTitle,
    currentActivityTitle,
    promptArabic,
    targetRule,
    // null = follow the saved profile preference (loaded inside the hook)
    language: languageOverride ?? undefined,
    onFeedbackReceived: (fb: TajweedLiveFeedback) => {
      const coachMsg: CoachChatMessage = {
        id: 'c-' + Date.now(),
        sender: 'coach',
        textEn: fb.coachResponseEn,
        textTa: fb.coachResponseTa,
        makhrajTip: fb.makhrajTip,
        makhrajTipTa: fb.makhrajTipTa,
        accuracyRating: fb.accuracyRating,
        latencyMs: fb.latencyMs,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, coachMsg]);
    },
  });

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status, isTypingLoading]);

  const language = languageOverride ?? normalizeFeedbackLanguage(userProfile?.aiFeedbackLanguage);
  const showEnglish = isEnglishEnabled(language);
  const showTamil = isTamilEnabled(language);

  // Switching language here persists the same preference used by Settings and the voice preview
  const handleLanguageChange = async (next: FeedbackLanguage) => {
    setLanguageOverride(next);
    try {
      await db.userProfile.update('default_user', { aiFeedbackLanguage: next });
    } catch (err) {
      console.warn('Failed to persist feedback language preference:', err);
    }
  };

  // Send typed query to coach
  const sendTypedQuery = async (queryText?: string) => {
    const text = queryText || inputQuery.trim();
    if (!text || isTypingLoading) return;

    const userMsgId = 'u-' + Date.now();
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        sender: 'user',
        textEn: text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setInputQuery('');
    setIsTypingLoading(true);

    try {
      const res = await fetch('/api/tajweed/live-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: 'c-' + Date.now(),
          sender: 'coach',
          textEn: data.coachResponseEn || 'Keep reciting with steady makhraj and focused breath.',
          textTa: data.coachResponseTa,
          makhrajTip: data.makhrajTip,
          makhrajTipTa: data.makhrajTipTa,
          accuracyRating: data.accuracyRating,
          latencyMs: data.latencyMs,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err) {
      console.error('Coach communication error:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: 'c-err-' + Date.now(),
          sender: 'coach',
          textEn: `For "${promptArabic || currentLessonTitle}": Pronounce firmly from its designated articulation point and hold harakat counts steadily.`,
          textTa: `"${promptArabic || currentLessonTitle}" க்கான வழிகாட்டல்: அதன் அசல் தானத்திலிருந்து (மக்ரிஜ்) தெளிவாக உச்சரித்து கால அளவைப் பேணவும்.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsTypingLoading(false);
    }
  };

  if (!isOpen && variant === 'modal') return null;

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
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-foreground">Recitation Guide</span>
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-primary-subtle text-primary-strong">
                  {userProfile?.aiVoiceId || 'Kore'} • {userProfile?.aiTeacherPersona || 'balanced'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher value={language} onChange={handleLanguageChange} />
            {latencyMs && (
              <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                <Zap className="w-3 h-3 text-secondary" />
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
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[10px]">Expand</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Audio Recitation Bar */}
        <div className="p-3 sm:p-4 space-y-3">
          {/* Error notice if mic permission denied */}
          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-destructive-subtle border border-destructive/30 text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="text-[11px] leading-tight">{errorMessage}</span>
            </div>
          )}

          {/* Recording or Active State */}
          <div className="flex items-center justify-between gap-3">
            {status === 'listening' ? (
              <div className="flex-1 flex items-center justify-between px-3 py-2 rounded-xl bg-destructive-subtle border border-destructive/30">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-ping" />
                  <span className="text-xs font-bold text-destructive">
                    Reciting ({recordingSeconds}s)...
                  </span>
                </div>

                {/* Animated waveform bars */}
                <div className="flex items-center gap-1 h-5">
                  {[0.4, 0.9, 1.3, 0.7, 1.5, 0.8, 0.5, 1.2].map((factor, idx) => {
                    const barHeight = Math.max(3, Math.min(18, (audioLevel * factor) / 4));
                    return (
                      <div
                        key={idx}
                        className="w-1 bg-destructive rounded-full transition-all duration-75"
                        style={{ height: `${barHeight}px` }}
                      />
                    );
                  })}
                </div>

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
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span>Checking Makhraj and timing…</span>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground leading-tight">
                  Tap microphone to recite <span className="font-arabic font-bold text-foreground text-sm">{promptArabic || 'this verse'}</span> aloud.
                </p>

                <button
                  type="button"
                  onClick={startRecording}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold flex items-center gap-1.5 shadow-xs active:scale-95 transition-all shrink-0"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Recite Aloud</span>
                </button>
              </div>
            )}
          </div>

          {/* Latest Coach Feedback Card */}
          {latestFeedback && (
            <div className="p-3 rounded-xl bg-surface border border-border space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                  <span className="text-[11px] font-bold text-foreground">
                    Teacher Feedback ({latestFeedback.tajweedRuleName})
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

              {((showEnglish && latestFeedback.makhrajTip) || (showTamil && latestFeedback.makhrajTipTa)) && (
                <div className="p-2 rounded-lg bg-secondary-subtle border border-secondary/30 text-secondary-strong text-[11px] flex items-start gap-1.5">
                  <span className="shrink-0">💡</span>
                  <span>
                    {showEnglish
                      ? latestFeedback.makhrajTip
                      : latestFeedback.makhrajTipTa}
                  </span>
                </div>
              )}
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
      <div className="bg-card rounded-3xl w-full max-w-lg h-[640px] max-h-[90vh] flex flex-col border border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-hero-bg text-hero-fg border-b border-hero-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-hero-card-bg flex items-center justify-center text-secondary">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold">Recitation Guide</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-hero-pill-bg text-hero-pill-fg">
                  Voice: {userProfile?.aiVoiceId || 'Kore'}
                </span>
                <LanguageSwitcher
                  value={language}
                  onChange={handleLanguageChange}
                  tone="hero"
                />
              </div>
              <p className="text-[11px] text-hero-muted truncate max-w-[260px]">
                {currentLessonTitle} • {currentActivityTitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {latencyMs && (
              <span className="text-[10px] font-mono text-hero-muted hidden sm:inline flex items-center gap-0.5">
                <Zap className="w-3 h-3 text-secondary" />
                <span>{latencyMs}ms</span>
              </span>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-xl hover:bg-hero-card-bg text-hero-muted hover:text-hero-fg transition-colors"
                title="Close Recitation Guide"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Current Prompt Context Banner */}
        {promptArabic && (
          <div className="px-4 py-2.5 bg-primary-subtle border-b border-primary/20 flex items-center justify-between text-xs shrink-0">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-primary-strong uppercase tracking-wider block">
                Target Passage:
              </span>
              <span className="text-[11px] text-muted-foreground">{targetRule || 'Tajweed & Makharij'}</span>
            </div>
            <span className="font-arabic text-2xl font-bold text-foreground select-text leading-tight">
              {promptArabic}
            </span>
          </div>
        )}

        {/* Messages List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m) => {
            const isCoach = m.sender === 'coach';
            return (
              <div
                key={m.id}
                className={`flex gap-2.5 ${isCoach ? 'justify-start' : 'justify-end'}`}
              >
                {isCoach && (
                  <div className="w-7 h-7 rounded-full bg-primary-subtle text-primary flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl p-3.5 text-xs space-y-2 shadow-2xs leading-relaxed ${
                    isCoach
                      ? 'bg-surface border border-border text-foreground'
                      : 'bg-primary text-primary-foreground font-medium'
                  }`}
                >
                  {(!isCoach || showEnglish) && <p>{m.textEn}</p>}

                  {isCoach && showTamil && m.textTa && (
                    <p className="font-tamil text-foreground pt-1 border-t border-border">
                      <span className="font-sans font-bold text-primary-strong text-[10px] block mb-0.5">
                        தமிழ் விளக்கம்:
                      </span>
                      {m.textTa}
                    </p>
                  )}

                  {((showEnglish && m.makhrajTip) || (showTamil && m.makhrajTipTa)) && (
                    <div className="p-2 rounded-lg bg-secondary-subtle border border-secondary/30 text-secondary-strong text-[11px] flex items-start gap-1.5">
                      <span className="shrink-0">💡</span>
                      <div className={showEnglish ? '' : 'font-tamil'}>
                        <span className="font-bold block text-[10px] uppercase font-sans">
                          {showEnglish ? 'Makhraj Alignment:' : 'மக்ரிஜ் சீரமைப்பு:'}
                        </span>
                        <span>{showEnglish ? m.makhrajTip : m.makhrajTipTa}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 text-[9px] opacity-65">
                    {m.accuracyRating && (
                      <span className="font-bold uppercase tracking-wider text-primary-strong">
                        Rating: {m.accuracyRating}
                      </span>
                    )}
                    <span className="ml-auto">{m.timestamp}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {(status === 'analyzing' || isTypingLoading) && (
            <div className="flex gap-2.5 items-center text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span>Checking Makhraj, harakat and Tajweed rules…</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-2xl bg-destructive-subtle border border-destructive/30 text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Quick Question Chips */}
        <div className="px-4 py-2 border-t border-border bg-card flex gap-2 overflow-x-auto no-scrollbar shrink-0">
          {showEnglish && (
            <button
              onClick={() =>
                sendTypedQuery('How do I articulate this clearly from its primary Makhraj point?')
              }
              className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-surface border border-border text-muted-foreground hover:text-foreground hover:bg-surface-hover whitespace-nowrap transition-colors"
            >
              How to articulate?
            </button>
          )}
          {showTamil && (
            <button
              onClick={() =>
                sendTypedQuery('Explain this Tajweed rule and vowel timing in Tamil (தமிழ் விளக்கம்).')
              }
              className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-surface border border-border text-muted-foreground hover:text-foreground hover:bg-surface-hover whitespace-nowrap transition-colors font-tamil"
            >
              தமிழ் விளக்கம்
            </button>
          )}
          {showEnglish && (
            <button
              onClick={() =>
                sendTypedQuery('What common mistakes do students make with this letter or rule?')
              }
              className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-surface border border-border text-muted-foreground hover:text-foreground hover:bg-surface-hover whitespace-nowrap transition-colors"
            >
              Common mistakes
            </button>
          )}
        </div>

        {/* Input & Voice Controls */}
        <div className="p-3 sm:p-4 bg-surface border-t border-border flex flex-col gap-2 shrink-0">
          {/* Active Audio Waveform when recording */}
          {status === 'listening' && (
            <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-destructive-subtle border border-destructive/30 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-ping" />
                <span className="font-bold text-destructive">
                  Listening to recitation ({recordingSeconds}s)...
                </span>
                <span className="text-[10px] text-muted-foreground hidden sm:inline">
                  (Auto-evaluates upon pause)
                </span>
              </div>

              {/* Dynamic waveform meter bars */}
              <div className="flex items-center gap-0.5 h-4">
                {[0.4, 0.8, 1.2, 0.7, 1.4, 0.9, 0.5, 1.1].map((factor, idx) => {
                  const barHeight = Math.max(3, Math.min(16, (audioLevel * factor) / 4));
                  return (
                    <div
                      key={idx}
                      className="w-1 bg-destructive rounded-full transition-all duration-75"
                      style={{ height: `${barHeight}px` }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            {status !== 'listening' ? (
              <button
                type="button"
                onClick={startRecording}
                className="p-3 rounded-2xl bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 active:scale-95 transition-all shadow-xs"
                title="Tap to speak or recite aloud"
              >
                <Mic className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="px-3 py-2.5 rounded-2xl bg-destructive text-destructive-foreground font-bold text-xs flex items-center gap-1.5 active:scale-95 transition-all shadow-md"
                title="Stop recording"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Stop Now</span>
              </button>
            )}

            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendTypedQuery();
                }
              }}
              placeholder="Ask a question or tap mic to recite..."
              className="flex-1 bg-card border border-border rounded-2xl px-3.5 py-2.5 text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
            />

            <button
              type="button"
              onClick={() => sendTypedQuery()}
              disabled={!inputQuery.trim() || isTypingLoading}
              className="p-2.5 rounded-2xl bg-primary hover:bg-primary-hover disabled:opacity-40 text-primary-foreground transition-all shadow-xs active:scale-95"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
