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
  MessageSquare,
  HelpCircle,
  RotateCcw,
} from 'lucide-react';

interface LiveTajweedCoachProps {
  currentLessonTitle?: string;
  currentActivityTitle?: string;
  promptArabic?: string;
  targetRule?: string;
  isOpen: boolean;
  onClose: () => void;
}

interface CoachMessage {
  id: string;
  sender: 'user' | 'coach';
  textEn: string;
  textTa?: string;
  makhrajTip?: string;
  accuracyRating?: string;
  timestamp: string;
}

export const LiveTajweedCoach: React.FC<LiveTajweedCoachProps> = ({
  currentLessonTitle = 'Tajweed Practice',
  currentActivityTitle = 'Letter Pronunciation',
  promptArabic,
  targetRule,
  isOpen,
  onClose,
}) => {
  const [messages, setMessages] = useState<CoachMessage[]>(() => [
    {
      id: 'm-init',
      sender: 'coach',
      textEn: `As-salamu alaykum! I am your live Gemini Tajweed Coach for "${currentLessonTitle}". Ask questions or tap the microphone to recite "${promptArabic || 'this lesson'}" aloud for instant pronunciation analysis.`,
      textTa: `அஸ்ஸலாமு அலைக்கும்! நான் உங்கள் நேரலை தஜ்வீத் ஆசிரியர். ஏதேனும் கேள்விகள் கேட்கலாம் அல்லது மைக்ரோஃபோன் மூலம் ஓதி உங்கள் உச்சரிப்பை சரிபார்க்கலாம்.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          sendToCoach({ audioBase64: base64, query: 'Student recited with microphone' });
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((t) => t.stop());
      };

      setRecordingSeconds(0);
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.warn('Microphone permission denied:', err);
      alert('Microphone access is unavailable or denied. You can type your questions below.');
    }
  };

  // Recording Timer
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 15) {
            if (mediaRecorderRef.current) {
              mediaRecorderRef.current.stop();
              setIsRecording(false);
            }
            return 15;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const sendToCoach = async ({
    query,
    audioBase64,
  }: {
    query?: string;
    audioBase64?: string;
  }) => {
    const text = query || inputQuery.trim();
    if (!text && !audioBase64) return;

    const userMsgId = 'u-' + Date.now();
    const newMsg: CoachMessage = {
      id: userMsgId,
      sender: 'user',
      textEn: audioBase64 ? '🎙️ [Live Voice Recitation Submitted]' : text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, newMsg]);
    setInputQuery('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/tajweed/live-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userQuery: text,
          audioBase64,
          audioMimeType: 'audio/webm',
          currentLessonTitle,
          currentActivityTitle,
          promptArabic,
          targetRule,
        }),
      });

      const data = await res.json();
      const coachMsg: CoachMessage = {
        id: 'c-' + Date.now(),
        sender: 'coach',
        textEn: data.coachResponseEn || 'Keep reciting with steady makhraj and focused breath.',
        textTa: data.coachResponseTa,
        makhrajTip: data.makhrajTip,
        accuracyRating: data.accuracyRating,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, coachMsg]);
    } catch (e) {
      console.error('Coach communication error:', e);
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
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay backdrop-blur-xs animate-in fade-in">
      <div className="bg-card rounded-3xl w-full max-w-lg h-[620px] max-h-[90vh] flex flex-col border border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-hero-bg text-hero-fg border-b border-hero-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-hero-card-bg flex items-center justify-center text-secondary">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold">Gemini Live Tajweed Coach</h3>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-hero-pill-bg text-hero-pill-fg">
                  AI Live
                </span>
              </div>
              <p className="text-[11px] text-hero-muted truncate max-w-[260px]">
                {currentLessonTitle} • {currentActivityTitle}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-hero-card-bg text-hero-muted hover:text-hero-fg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Prompt Context Banner */}
        {promptArabic && (
          <div className="px-4 py-2 bg-primary-subtle border-b border-primary/20 flex items-center justify-between text-xs shrink-0">
            <span className="text-[11px] font-semibold text-primary-strong">
              Current Target:
            </span>
            <span className="font-arabic text-xl font-bold text-foreground select-text">
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
                  <p>{m.textEn}</p>

                  {m.textTa && (
                    <p className="font-tamil text-foreground pt-1 border-t border-border">
                      <span className="font-sans font-bold text-primary-strong text-[10px] block mb-0.5">
                        தமிழ் வழிகாட்டல்:
                      </span>
                      {m.textTa}
                    </p>
                  )}

                  {m.makhrajTip && (
                    <div className="p-2 rounded-lg bg-secondary-subtle border border-secondary/30 text-secondary-strong text-[11px] flex items-start gap-1.5">
                      <span className="shrink-0">💡</span>
                      <span>{m.makhrajTip}</span>
                    </div>
                  )}

                  <span
                    className={`text-[9px] block text-right opacity-60 ${
                      isCoach ? 'text-muted-foreground' : 'text-primary-foreground'
                    }`}
                  >
                    {m.timestamp}
                  </span>
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex gap-2.5 items-center text-xs text-muted-foreground animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span>Gemini is analyzing pronunciation & Tajweed rules...</span>
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Quick Question Chips */}
        <div className="px-4 py-2 border-t border-border bg-card flex gap-2 overflow-x-auto no-scrollbar shrink-0">
          <button
            onClick={() =>
              sendToCoach({ query: 'How do I pronounce this correctly from its makhraj?' })
            }
            className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-surface border border-border text-muted-foreground hover:text-foreground hover:bg-surface-hover whitespace-nowrap transition-colors"
          >
            How to pronounce?
          </button>
          <button
            onClick={() =>
              sendToCoach({ query: 'Explain this Tajweed rule in Tamil (தமிழ் விளக்கம்).' })
            }
            className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-surface border border-border text-muted-foreground hover:text-foreground hover:bg-surface-hover whitespace-nowrap transition-colors font-tamil"
          >
            தமிழ் விளக்கம்
          </button>
          <button
            onClick={() =>
              sendToCoach({ query: 'What common mistakes should I avoid on this letter or rule?' })
            }
            className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-surface border border-border text-muted-foreground hover:text-foreground hover:bg-surface-hover whitespace-nowrap transition-colors"
          >
            Common mistakes
          </button>
        </div>

        {/* Input & Voice Controls */}
        <div className="p-3 sm:p-4 bg-surface border-t border-border flex items-center gap-2 shrink-0">
          {!isRecording ? (
            <button
              onClick={startVoiceRecording}
              className="p-3 rounded-2xl bg-danger/10 hover:bg-danger/20 text-danger border border-danger/20 active:scale-95 transition-all"
              title="Record recitation to get live AI feedback"
            >
              <Mic className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={stopVoiceRecording}
              className="px-3 py-2 rounded-2xl bg-danger text-white font-bold text-xs flex items-center gap-1.5 active:scale-95 transition-all shadow-md animate-pulse"
              title="Stop recording"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Stop ({recordingSeconds}s)</span>
            </button>
          )}

          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendToCoach({});
              }
            }}
            placeholder="Ask AI coach or tap mic to recite..."
            className="flex-1 bg-card border border-border rounded-2xl px-3.5 py-2.5 text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
          />

          <button
            onClick={() => sendToCoach({})}
            disabled={!inputQuery.trim() || isLoading}
            className="p-2.5 rounded-2xl bg-primary hover:bg-primary-hover disabled:opacity-40 text-primary-foreground transition-all shadow-xs active:scale-95"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
