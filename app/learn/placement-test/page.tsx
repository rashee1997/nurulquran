'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { db, UserProfile } from '@/lib/db';
import {
  Sparkles,
  Mic,
  Square,
  CheckCircle2,
  Award,
  ArrowRight,
  RotateCcw,
  Loader2,
  Unlock,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { isEnglishEnabled, isTamilEnabled, normalizeFeedbackLanguage } from '@/lib/i18n/language';

interface DiagnosticQuestion {
  id: string;
  category: string;
  question: string;
  arabicExample?: string;
  options: string[];
  correctIndex: number;
  ruleExplanationEn: string;
  ruleExplanationTa: string;
}

const DIAGNOSTIC_QUESTIONS: DiagnosticQuestion[] = [
  {
    id: 'q1',
    category: 'Noon Sakinah & Tanween',
    question: 'When Noon Sakinah meets the letter Baa (ب) like in "مِنۢ بَعْدِ", which rule applies?',
    arabicExample: 'مِنۢ بَعْدِ',
    options: [
      'Iqlab (Transforming Noon into Meem with Ghunnah)',
      'Izhar Halqi (Clear pronunciation without nasal pause)',
      'Idgham bila-Ghunnah (Merging without nasal sound)',
      'Madd Lazim (6 counts elongation)',
    ],
    correctIndex: 0,
    ruleExplanationEn: 'Iqlab transforms Noon Sakinah into a soft Meem with 2-count Ghunnah before Baa.',
    ruleExplanationTa: 'பா (ب) முன் வரும் நூன் சாகினா குன்னாவுடன் கூடிய மீமாக மாற்றப்பட்டு ஓதப்படும் (இக்லாப்).',
  },
  {
    id: 'q2',
    category: 'Ahkam al-Madd',
    question: 'How many counts of prolongation are required for Madd Lazim Kalimi Muthaqqal (e.g. "وَلَا ٱلضَّآلِّينَ")?',
    arabicExample: 'وَلَا ٱلضَّآلِّينَ',
    options: ['6 Harakat (Compulsory)', '2 Harakat (Natural)', '4 Harakat', '1 Harakat'],
    correctIndex: 0,
    ruleExplanationEn: 'Madd Lazim must be held for 6 complete counts due to the following Shaddah.',
    ruleExplanationTa: 'ஷத்தாவைத் தொடர்ந்து வரும் மத்து லாஸிம் கலிமீ 6 முழு ஹரக்கத் நீட்டப்பட வேண்டும்.',
  },
  {
    id: 'q3',
    category: 'Ahkam al-Qalqalah',
    question: 'Which of the following is NOT one of the 5 Qalqalah bouncing letters (قُطْبُ جَدّ)?',
    arabicExample: 'ق ، ط ، ب ، ج ، د',
    options: ['س (Seen)', 'ق (Qaf)', 'ط (Taa)', 'د (Dal)'],
    correctIndex: 0,
    ruleExplanationEn: 'The 5 Qalqalah letters are Qaf, Taa, Baa, Jeem, Dal. Seen (س) is a whispering letter (Hams).',
    ruleExplanationTa: 'கல்கலா எழுத்துக்கள் ஐந்திலும் சீன் (س) இல்லை; அது ஹம்ஸ் வகையைச் சேர்ந்தது.',
  },
  {
    id: 'q4',
    category: 'Makharij al-Huroof',
    question: 'What is the precise articulation point (Makhraj) of the Arabic letter Dhaad (ض)?',
    arabicExample: 'ض',
    options: [
      'The side/edge of the tongue pressing against the upper molars',
      'The tip of the tongue between the front incisors',
      'The deep bottom of the throat',
      'The two outer lips pressed tightly',
    ],
    correctIndex: 0,
    ruleExplanationEn: 'Dhaad is articulated from one or both edges of the tongue contacting the upper molars with Istitalah.',
    ruleExplanationTa: 'ளாதின் (ض) மக்ரிஜ்: நாவின் பக்கவாட்டு ஓரம் மேல் கடைவாய்ப் பற்களுடன் இணைவதாகும்.',
  },
];

/** Response contract of `POST /api/tajweed/evaluate`. */
interface PlacementEvaluation {
  score: number;
  passed: boolean;
  accuracyPercent: number;
  feedbackEn: string;
  feedbackTa: string;
  tajweedRulesObserved: string[];
  makhrajTipsEn: string;
  makhrajTipsTa: string;
  strengths: string[];
  areasForImprovement: string[];
  unlockedLevel: number;
  bonusXp: number;
}

interface ApiErrorPayload {
  error?: string;
  code?: string;
}

const RECORDING_LIMIT_SECONDS = 20;

function isPlacementEvaluation(value: unknown): value is PlacementEvaluation {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.score === 'number' &&
    typeof candidate.passed === 'boolean' &&
    Array.isArray(candidate.tajweedRulesObserved) &&
    (typeof candidate.feedbackEn === 'string' || typeof candidate.feedbackTa === 'string')
  );
}

export default function TajweedPlacementExamPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [step, setStep] = useState<'intro' | 'quiz' | 'recitation' | 'evaluating' | 'result'>('intro');

  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});

  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [audioMimeType, setAudioMimeType] = useState('audio/webm');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  const [evalResult, setEvalResult] = useState<PlacementEvaluation | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    let active = true;
    db.userProfile
      .get('default_user')
      .then((user) => {
        if (active && user) setProfile(user);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      isMountedRef.current = false;
    };
  }, []);

  const releaseMicrophone = useCallback((): void => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
  }, []);

  // Every path out of the page releases the microphone. The previous version only
  // stopped the tracks inside `onstop`, so abandoning the exam mid-recording left
  // the browser's recording indicator on.
  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null;
        recorder.ondataavailable = null;
        try {
          recorder.stop();
        } catch {
          // Already stopped.
        }
      }
      releaseMicrophone();
    };
  }, [releaseMicrophone]);

  const feedbackLanguage = normalizeFeedbackLanguage(profile?.aiFeedbackLanguage);
  const showEnglishFeedback = isEnglishEnabled(feedbackLanguage);
  const showTamilFeedback = isTamilEnabled(feedbackLanguage);

  const diagnosticScore = useMemo(
    () =>
      DIAGNOSTIC_QUESTIONS.reduce(
        (total, question) => (selectedAnswers[question.id] === question.correctIndex ? total + 1 : total),
        0
      ),
    [selectedAnswers]
  );

  const stopRecording = useCallback((): void => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      setIsRecording(false);
      return;
    }
    try {
      recorder.stop();
    } catch (error) {
      console.warn('Recorder could not be stopped cleanly:', error);
    }
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async (): Promise<void> => {
    setMicError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMicError('This browser does not expose microphone recording.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isMountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        if (!isMountedRef.current) return;

        setAudioBlob(blob);
        setAudioMimeType(mimeType);

        const reader = new FileReader();
        reader.onloadend = () => {
          if (isMountedRef.current && typeof reader.result === 'string') {
            setAudioBase64(reader.result);
          }
        };
        reader.onerror = () => {
          if (isMountedRef.current) {
            setMicError('The recording could not be read. Please record again.');
          }
        };
        reader.readAsDataURL(blob);
        releaseMicrophone();
      };

      recorder.onerror = () => {
        if (isMountedRef.current) {
          setMicError('Recording failed. Please try again.');
          setIsRecording(false);
        }
        releaseMicrophone();
      };

      setRecordingSeconds(0);
      setAudioBlob(null);
      setAudioBase64(null);
      recorder.start();
      setIsRecording(true);
    } catch (error) {
      console.warn('Microphone permission denied or unavailable:', error);
      setMicError(
        'Microphone access is unavailable or was denied. A recitation recording is required before the exam can be assessed.'
      );
      releaseMicrophone();
    }
  }, [releaseMicrophone]);

  // Countdown timer for the recording window.
  useEffect(() => {
    if (!isRecording) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(() => {
      setRecordingSeconds((previous) => Math.min(RECORDING_LIMIT_SECONDS, previous + 1));
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRecording]);

  // Auto-stop at the limit — done in an effect rather than inside a state updater,
  // where calling `recorder.stop()` was a side effect in a reducer.
  useEffect(() => {
    if (isRecording && recordingSeconds >= RECORDING_LIMIT_SECONDS) {
      stopRecording();
    }
  }, [isRecording, recordingSeconds, stopRecording]);

  const submitForEvaluation = useCallback(async (): Promise<void> => {
    setStep('evaluating');
    setIsSubmitting(true);
    setEvalError(null);
    setEvalResult(null);

    try {
      const answers = Object.fromEntries(
        Object.entries(selectedAnswers).map(([questionId, optionIndex]) => {
          const question = DIAGNOSTIC_QUESTIONS.find((q) => q.id === questionId);
          return [questionId, question?.options[optionIndex] ?? `${optionIndex}`];
        })
      );

      const res = await fetch('/api/tajweed/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          audioMimeType,
          targetVerseArabic: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ • غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ',
          targetRule: 'Makharij, Noon Sakinah, Madd Lazim, Tarqeeq/Tafkheem',
          answers,
          examType: 'placement',
          userLevel: profile?.level || 1,
          language: feedbackLanguage,
        }),
      });

      const payload: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const message = (payload as ApiErrorPayload | null)?.error;
        throw new Error(message || 'The evaluation service rejected this submission.');
      }

      if (!isPlacementEvaluation(payload)) {
        throw new Error('The evaluation service returned an unusable result.');
      }

      setEvalResult(payload);

      // Rewards are applied only when the server has actually graded the recitation
      // and passed it. Previously any error path (missing key, network failure,
      // unparsable response) issued a Level-10 certificate and 150 XP.
      if (payload.passed) {
        const unlockedLevels = Array.from({ length: payload.unlockedLevel }, (_, index) => index + 1);
        await db.userProfile.update('default_user', {
          tajweedCertifiedLevel: payload.unlockedLevel,
          unlockedLevels,
          placementExamPassedAt: new Date().toISOString(),
          totalXp: (profile?.totalXp || 0) + payload.bonusXp,
        });

        try {
          confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
        } catch (error) {
          console.warn('Celebration effect unavailable:', error);
        }
      }
    } catch (error) {
      setEvalError(
        error instanceof Error
          ? error.message
          : 'The recitation could not be assessed. Nothing was graded — please try again.'
      );
    } finally {
      if (isMountedRef.current) {
        setIsSubmitting(false);
        setStep('result');
      }
    }
  }, [audioBase64, audioMimeType, feedbackLanguage, profile, selectedAnswers]);

  const resetExam = useCallback((): void => {
    setStep('intro');
    setAudioBlob(null);
    setAudioBase64(null);
    setEvalResult(null);
    setEvalError(null);
    setSelectedAnswers({});
    setCurrentQIndex(0);
    setRecordingSeconds(0);
  }, []);

  return (
    <div id="placement-exam" className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300 pb-12">
      <div className="bg-card rounded-3xl p-6 sm:p-8 text-foreground border border-border shadow-xs space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-subtle text-primary text-xs font-semibold">
          <Award className="w-3.5 h-3.5 text-secondary" aria-hidden="true" />
          <span>Oral assessment</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
          Place a Level by Reciting
        </h1>
        <p className="text-muted-foreground text-xs sm:text-sm max-w-xl leading-relaxed">
          Already know the letters and Tajweed rules? Recite aloud to be placed above the introductory
          levels.
        </p>
      </div>

      {/* STEP 1: INTRO */}
      {step === 'intro' && (
        <div className="bg-card rounded-3xl p-6 sm:p-8 border border-border space-y-6 shadow-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-surface border border-border space-y-1">
              <ShieldCheck className="w-5 h-5 text-primary" aria-hidden="true" />
              <h2 className="text-sm font-bold text-foreground">Fixed rule set</h2>
              <p className="text-xs text-muted-foreground">
                Evaluation is limited to the rules of the Hafs &apos;an &apos;Asim reading.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-surface border border-border space-y-1">
              <Mic className="w-5 h-5 text-secondary" aria-hidden="true" />
              <h2 className="text-sm font-bold text-foreground">Recorded recitation</h2>
              <p className="text-xs text-muted-foreground">
                Your microphone audio is assessed for makharij, vowels and ghunnah.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-surface border border-border space-y-1">
              <Unlock className="w-5 h-5 text-primary" aria-hidden="true" />
              <h2 className="text-sm font-bold text-foreground">Levels opened by assessment</h2>
              <p className="text-xs text-muted-foreground">
                A graded pass of 75% or higher places you into the advanced levels and grants 150 XP.
              </p>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border">
            <Link href="/learn" className="text-xs font-semibold text-muted-foreground hover:text-foreground">
              ← Back to Curriculum Map
            </Link>
            <button
              type="button"
              onClick={() => setStep('quiz')}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-sm shadow-md active:scale-95 transition-all"
            >
              <span>Begin Placement Exam</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: DIAGNOSTIC QUIZ */}
      {step === 'quiz' && (
        <div className="bg-card rounded-3xl p-6 sm:p-8 border border-border space-y-6 shadow-xs">
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs font-bold text-muted-foreground">
              <span>Section 1 of 2: Tajweed Diagnostic Rules</span>
              <span>
                Question {currentQIndex + 1} of {DIAGNOSTIC_QUESTIONS.length}
              </span>
            </div>
            <div className="w-full bg-surface border border-border h-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 rounded-full"
                style={{ width: `${((currentQIndex + 1) / DIAGNOSTIC_QUESTIONS.length) * 100}%` }}
              />
            </div>
          </div>

          {(() => {
            const question = DIAGNOSTIC_QUESTIONS[currentQIndex];
            if (!question) return null;

            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-primary-subtle text-primary">
                    {question.category}
                  </span>
                  <h2 className="text-base sm:text-lg font-bold text-foreground leading-snug">
                    {question.question}
                  </h2>
                  {question.arabicExample && (
                    <div className="p-3 rounded-xl bg-surface border border-border text-center">
                      <span className="font-arabic text-2xl text-foreground select-text" dir="rtl" lang="ar">
                        {question.arabicExample}
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-2 pt-2">
                  {question.options.map((option, optionIndex) => {
                    const isChosen = selectedAnswers[question.id] === optionIndex;
                    return (
                      <button
                        type="button"
                        key={`${question.id}-${optionIndex}`}
                        onClick={() =>
                          setSelectedAnswers((previous) => ({ ...previous, [question.id]: optionIndex }))
                        }
                        aria-pressed={isChosen}
                        className={`w-full p-3.5 rounded-xl border text-left text-xs font-semibold transition-all flex items-center justify-between ${
                          isChosen
                            ? 'bg-primary-subtle border-primary text-primary-strong ring-2 ring-primary/20'
                            : 'bg-surface border-border hover:bg-surface-hover text-foreground'
                        }`}
                      >
                        <span>{option}</span>
                        {isChosen && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <button
              type="button"
              onClick={() => {
                if (currentQIndex > 0) setCurrentQIndex(currentQIndex - 1);
                else setStep('intro');
              }}
              className="text-xs font-bold text-muted-foreground hover:text-foreground px-3 py-2"
            >
              Previous
            </button>

            {currentQIndex < DIAGNOSTIC_QUESTIONS.length - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentQIndex(currentQIndex + 1)}
                disabled={selectedAnswers[DIAGNOSTIC_QUESTIONS[currentQIndex]?.id ?? ''] === undefined}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-bold transition-all shadow-xs"
              >
                <span>Next Question</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep('recitation')}
                disabled={selectedAnswers[DIAGNOSTIC_QUESTIONS[currentQIndex]?.id ?? ''] === undefined}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-bold transition-all shadow-md active:scale-95"
              >
                <span>Proceed to Oral Recitation</span>
                <Mic className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: ORAL RECITATION */}
      {step === 'recitation' && (
        <div className="bg-card rounded-3xl p-6 sm:p-8 border border-border space-y-6 shadow-xs">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-secondary-subtle text-secondary-strong text-xs font-bold">
              <Mic className="w-3 h-3" aria-hidden="true" />
              <span>Section 2 of 2: Recitation</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-foreground">Recite the Test Passage Aloud</h2>
            <p className="text-xs text-muted-foreground">
              Press Record, recite the verse below into your microphone, then press Stop. Makharij, Madd
              and Tajweed are then assessed.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-surface border border-border text-center space-y-3">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Surah Al-Fatihah • Verses 1 & 7
            </p>
            <p className="font-arabic text-3xl sm:text-4xl text-foreground leading-loose select-text" dir="rtl" lang="ar">
              بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ
            </p>
            <p
              className="font-arabic text-2xl sm:text-3xl text-primary font-bold leading-loose select-text"
              dir="rtl"
              lang="ar"
            >
              غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ
            </p>
            <div className="text-[11px] text-muted-foreground pt-2 border-t border-border">
              Key checks: light Laam in Bismillah, clean Dhaad articulation, 6-count Madd Lazim on
              Walad-Daaalleen.
            </div>
          </div>

          <div className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-surface border border-border">
            {!isRecording ? (
              <button
                type="button"
                onClick={() => void startRecording()}
                className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-danger hover:bg-danger-hover text-danger-foreground font-bold text-sm shadow-md active:scale-95 transition-all"
              >
                <Mic className="w-5 h-5" aria-hidden="true" />
                <span>{audioBlob ? 'Record Again' : 'Start Voice Recording'}</span>
              </button>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-danger animate-ping" aria-hidden="true" />
                  <span role="status" className="text-sm font-bold text-danger-strong">
                    Recording: {recordingSeconds}s / {RECORDING_LIMIT_SECONDS}s
                  </span>
                </div>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-card border border-border hover:bg-surface-hover text-foreground font-bold text-sm shadow-md active:scale-95 transition-all"
                >
                  <Square className="w-4 h-4 text-danger" aria-hidden="true" />
                  <span>Stop &amp; Review Recording</span>
                </button>
              </div>
            )}

            {audioBlob && !isRecording && (
              <p className="pt-2 text-xs font-semibold text-success-strong flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" aria-hidden="true" />
                <span>Recording captured — it will be assessed when you submit.</span>
              </p>
            )}

            {micError && (
              <p role="alert" className="text-xs font-semibold text-danger-strong bg-danger-subtle rounded-xl px-3 py-2">
                {micError}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border">
            <button
              type="button"
              onClick={() => setStep('quiz')}
              className="text-xs font-bold text-muted-foreground hover:text-foreground"
            >
              ← Back to Diagnostic Questions
            </button>

            <div className="w-full sm:w-auto flex flex-col items-stretch sm:items-end gap-2">
              <button
                type="button"
                onClick={() => void submitForEvaluation()}
                disabled={isSubmitting || !audioBase64}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:pointer-events-none text-primary-foreground font-bold text-xs shadow-md active:scale-95 transition-all"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>Evaluating Tajweed…</span>
                  </>
                ) : (
                  <>
                    <Award className="w-4 h-4 text-secondary" aria-hidden="true" />
                    <span>Submit for assessment</span>
                  </>
                )}
              </button>
              {!audioBase64 && (
                <p className="text-[11px] text-muted-foreground text-center sm:text-right">
                  A recording is required — the exam cannot be graded without hearing your recitation.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: EVALUATING */}
      {step === 'evaluating' && (
        <div className="bg-card rounded-3xl p-12 border border-border text-center space-y-4 shadow-xs">
          <Loader2 className="w-8 h-8 mx-auto text-primary animate-spin" aria-hidden="true" />
          <h2 className="text-xl font-bold text-foreground">Assessing your recitation…</h2>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            Checking articulation points, Noon Sakinah nasalisation and Madd length. This can take up to
            a minute.
          </p>
        </div>
      )}

      {/* STEP 5: RESULT */}
      {step === 'result' && (
        <div className="bg-card rounded-3xl p-6 sm:p-8 border border-border space-y-6 shadow-xs">
          {evalError ? (
            <div className="p-6 rounded-2xl text-center space-y-3 bg-danger-subtle border border-danger/40">
              <AlertCircle className="w-8 h-8 mx-auto text-danger-strong" aria-hidden="true" />
              <h2 className="text-lg font-bold text-danger-strong">Assessment not completed</h2>
              <p role="alert" className="text-xs text-danger-strong max-w-lg mx-auto">
                {evalError}
              </p>
              <p className="text-[11px] text-muted-foreground max-w-lg mx-auto">
                No level was unlocked and no XP was awarded, because your recitation was not graded.
              </p>
            </div>
          ) : evalResult ? (
            <>
              <div
                className={`p-6 rounded-2xl text-center space-y-2 border ${
                  evalResult.passed
                    ? 'bg-success-subtle border-success/40 text-success-strong'
                    : 'bg-secondary-subtle border-secondary/40 text-secondary-strong'
                }`}
              >
                <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center bg-card shadow-xs">
                  {evalResult.passed ? (
                    <Award className="w-6 h-6 text-success" aria-hidden="true" />
                  ) : (
                    <RotateCcw className="w-6 h-6 text-secondary" aria-hidden="true" />
                  )}
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold">
                  {evalResult.passed ? 'Placement complete' : 'Not placed yet'}
                </h2>
                <p className="text-xs opacity-90 max-w-lg mx-auto">
                  {evalResult.passed
                    ? `You scored ${evalResult.score}/100. Levels 2–${evalResult.unlockedLevel} are now open and ${evalResult.bonusXp} XP was added.`
                    : `You scored ${evalResult.score}/100. We recommend starting with Level 1 or 2 to reinforce makharij foundations.`}
                </p>
                <p className="text-[11px] opacity-80">
                  Written diagnostic: {diagnosticScore}/{DIAGNOSTIC_QUESTIONS.length} correct.
                </p>
              </div>

              <div
                className={`grid grid-cols-1 gap-4 ${
                  showEnglishFeedback && showTamilFeedback ? 'md:grid-cols-2' : ''
                }`}
              >
                {showEnglishFeedback && evalResult.feedbackEn && (
                  <div className="p-4 rounded-2xl bg-surface border border-border space-y-2">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      English feedback &amp; Makhraj tips
                    </h3>
                    <p className="text-xs text-foreground leading-relaxed">{evalResult.feedbackEn}</p>
                    {evalResult.makhrajTipsEn && (
                      <p className="text-[11px] text-primary-strong font-medium pt-1">
                        Tip: {evalResult.makhrajTipsEn}
                      </p>
                    )}
                  </div>
                )}

                {showTamilFeedback && evalResult.feedbackTa && (
                  <div className="p-4 rounded-2xl bg-surface border border-border space-y-2 font-tamil">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider font-sans">
                      தமிழ் மதிப்பீடு மற்றும் வழிகாட்டல்
                    </h3>
                    <p className="text-xs text-foreground leading-relaxed">{evalResult.feedbackTa}</p>
                    {evalResult.makhrajTipsTa && (
                      <p className="text-[11px] text-primary-strong font-medium pt-1">
                        உச்சரிப்பு குறிப்பு: {evalResult.makhrajTipsTa}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {evalResult.tajweedRulesObserved.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Tajweed disciplines observed
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {evalResult.tajweedRulesObserved.map((rule) => (
                      <span
                        key={rule}
                        className="text-xs font-semibold px-3 py-1 rounded-full bg-primary-subtle text-primary-strong flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                        {rule}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {evalResult.areasForImprovement.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Areas to improve
                  </h3>
                  <ul className="text-xs text-foreground space-y-1 list-disc pl-4">
                    {evalResult.areasForImprovement.map((area) => (
                      <li key={area}>{area}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : null}

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border">
            <button
              type="button"
              onClick={resetExam}
              className="text-xs font-bold text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{evalError ? 'Start over' : 'Retake assessment'}</span>
            </button>

            <Link
              href="/learn"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-xs shadow-md active:scale-95 transition-all"
            >
              <span>Open the curriculum</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
