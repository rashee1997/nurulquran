'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { SURAHS } from '@/lib/quran/surahs';
import { quranProvider } from '@/lib/quran/alquran-cloud';
import { Verse, QuranWord } from '@/lib/quran/types';
import { db } from '@/lib/db';
import { calculateNextReview, initializeVerseProgress } from '@/lib/learning/srs-engine';
import { evaluateStreak } from '@/lib/learning/xp-engine';
import confetti from 'canvas-confetti';
import { 
  Brain, 
  Volume2, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  Sparkles, 
  Clock, 
  Eye, 
  EyeOff, 
  ArrowRight,
  Shuffle
} from 'lucide-react';
import { TutorPanel } from '@/components/ai/TutorPanel';

export type HifzModeKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J';

function MemorizationContent() {
  const searchParams = useSearchParams();
  const initialMode = (searchParams.get('mode') as HifzModeKey) || 'A';

  const [activeMode, setActiveMode] = useState<HifzModeKey>(initialMode);
  const [selectedSurahId, setSelectedSurahId] = useState<number>(1);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [currentVerseIndex, setCurrentVerseIndex] = useState(0);
  const [loadingVerses, setLoadingVerses] = useState(true);

  // Mode Specific State
  const [assembledTokens, setAssembledTokens] = useState<string[]>([]);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(15);
  const [timerActive, setTimerActive] = useState(false);
  const [aiTutorOpen, setAiTutorOpen] = useState(false);
  const [aiTutorPrompt, setAiTutorPrompt] = useState('');

  const resetModeState = React.useCallback(() => {
    setAssembledTokens([]);
    setSelectedChoice(null);
    setIsAnswerChecked(false);
    setIsCorrect(false);
    setIsRevealed(false);
    setTimerSeconds(15);
    setTimerActive(false);
  }, []);

  // Load verses for the selected Surah
  useEffect(() => {
    async function loadSurahVerses() {
      setLoadingVerses(true);
      try {
        const v = await quranProvider.getChapterVerses(selectedSurahId);
        setVerses(v);
        setCurrentVerseIndex(0);
        resetModeState();
      } catch (e) {
        console.error('Failed to load verses for memorization:', e);
      } finally {
        setLoadingVerses(false);
      }
    }
    loadSurahVerses();
  }, [selectedSurahId, resetModeState]);

  // Mode I: Timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeMode === 'I' && timerActive && timerSeconds > 0) {
      interval = setInterval(() => setTimerSeconds(prev => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [activeMode, timerActive, timerSeconds]);

  const currentVerse = verses[currentVerseIndex] || verses[0];

  const playAudio = (url?: string, text?: string) => {
    if (url) {
      const audio = new Audio(url);
      audio.play().catch(e => console.warn(e));
    } else if (text && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ar-SA';
      u.rate = 0.85;
      window.speechSynthesis.speak(u);
    }
  };

  const awardXP = async (amount: number) => {
    try {
      const profile = await db.userProfile.get('default_user');
      if (profile) {
        const streakEval = evaluateStreak(profile.lastActiveDate, profile.streakCount);
        await db.userProfile.update('default_user', {
          totalXp: profile.totalXp + amount,
          streakCount: streakEval.newStreak,
          lastActiveDate: new Date().toISOString().split('T')[0],
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelfGrade = async (quality: number) => {
    if (!currentVerse) return;
    const key = `${currentVerse.surah}:${currentVerse.ayah}`;
    let prog = await db.verseProgress.get(key);
    if (!prog) {
      prog = initializeVerseProgress(currentVerse.surah, currentVerse.ayah);
    }

    const next = calculateNextReview(prog, quality);
    await db.verseProgress.put(next);

    if (quality >= 3) {
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
      await awardXP(15);
    }

    // Go to next verse
    if (currentVerseIndex < verses.length - 1) {
      setCurrentVerseIndex(prev => prev + 1);
      resetModeState();
    } else {
      setIsRevealed(false);
      alert('You have completed this Surah review round! Alhamdulillah!');
    }
  };

  // Helper for multiple choices
  const getChoiceOptions = () => {
    if (!verses || verses.length === 0) return [];
    const correct = currentVerse.textUthmani;
    const others = verses.filter(v => v.ayah !== currentVerse.ayah).slice(0, 3).map(v => v.textUthmani);
    return [correct, ...others].sort(() => Math.random() - 0.5);
  };

  const handleCheckMultipleChoice = (chosen: string) => {
    setSelectedChoice(chosen);
    const correct = chosen === currentVerse.textUthmani;
    setIsCorrect(correct);
    setIsAnswerChecked(true);

    if (correct) {
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
      awardXP(10);
    }
  };

  const modesList = [
    { id: 'A', name: 'Listen & Repeat', icon: '🎧' },
    { id: 'B', name: 'Complete Verse', icon: '✍️' },
    { id: 'C', name: 'Word Reordering', icon: '🧩' },
    { id: 'D', name: 'First Word Prompt', icon: '💡' },
    { id: 'E', name: 'Audio to Ayah', icon: '🔊' },
    { id: 'F', name: 'Meaning to Ayah', icon: '🌐' },
    { id: 'G', name: 'Missing Segment', icon: '🔍' },
    { id: 'H', name: 'Blind Recitation (SRS)', icon: '🙈' },
    { id: 'I', name: 'Speed Recall (15s)', icon: '⚡' },
    { id: 'J', name: 'AI Guided Hifz', icon: '🤖' },
  ];

  return (
    <div id="memorization-suite" className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header & Surah Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">
              10 Hifz Memorization Modes
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Targeted cognitive practice with SM-2 spaced repetition integration
            </p>
          </div>
        </div>

        {/* Surah Dropdown selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500">Surah:</label>
          <select
            value={selectedSurahId}
            onChange={(e) => setSelectedSurahId(Number(e.target.value))}
            className="text-xs font-semibold px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 outline-hidden cursor-pointer"
          >
            {SURAHS.slice(0, 30).map((s) => (
              <option key={s.id} value={s.id}>
                {s.id}. {s.nameSimple} ({s.nameEnglish}) - {s.versesCount} Ayahs
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Mode Picker Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {modesList.map((m) => (
          <button
            key={m.id}
            onClick={() => {
              setActiveMode(m.id as HifzModeKey);
              resetModeState();
            }}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeMode === m.id
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <span>{m.icon}</span>
            <span>Mode {m.id}: {m.name}</span>
          </button>
        ))}
      </div>

      {/* Current Verse Navigation Bar */}
      {verses.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 bg-slate-100 dark:bg-slate-800/60 rounded-2xl text-xs font-semibold text-slate-600 dark:text-slate-400">
          <span>
            Ayah {currentVerseIndex + 1} of {verses.length} (Surah {currentVerse?.surah}:{currentVerse?.ayah})
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={currentVerseIndex === 0}
              onClick={() => {
                setCurrentVerseIndex(prev => Math.max(0, prev - 1));
                resetModeState();
              }}
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              disabled={currentVerseIndex === verses.length - 1}
              onClick={() => {
                setCurrentVerseIndex(prev => Math.min(verses.length - 1, prev + 1));
                resetModeState();
              }}
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Main Interactive Stage for the Selected Mode */}
      {loadingVerses ? (
        <div className="text-center py-20 text-slate-400">
          <Brain className="w-8 h-8 mx-auto mb-2 animate-spin text-blue-500" />
          <p className="text-xs">Loading authentic verses for Surah {selectedSurahId}...</p>
        </div>
      ) : currentVerse ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-lg space-y-6">

          {/* MODE A: LISTEN & REPEAT */}
          {activeMode === 'A' && (
            <div className="space-y-6 text-center">
              <div className="space-y-1">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Mode A • Auditory Loop</span>
                <h3 className="text-lg font-bold">Listen & Repeat</h3>
                <p className="text-xs text-slate-500">Listen to the Ayah repeatedly, recite along, and internalize the rhythm.</p>
              </div>

              <div className="py-8 px-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800">
                <p className="font-arabic text-3xl sm:text-4xl text-slate-900 dark:text-slate-100 leading-loose dir-rtl" dir="rtl">
                  {currentVerse.textUthmani}
                </p>
                <p className="text-xs text-slate-500 mt-4 max-w-lg mx-auto">
                  {currentVerse.translationEn}
                </p>
                {currentVerse.translationTa && (
                  <p className="text-xs text-emerald-600 font-tamil mt-1">
                    {currentVerse.translationTa}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => playAudio(currentVerse.audioUrl, currentVerse.textUthmani)}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md transition-all active:scale-95"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>Play Recitation</span>
                </button>
                <button
                  onClick={() => handleSelfGrade(4)}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition-all active:scale-95"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Mastered This Verse (+15 XP)</span>
                </button>
              </div>
            </div>
          )}

          {/* MODE B: COMPLETE THE VERSE */}
          {activeMode === 'B' && (
            <div className="space-y-6">
              <div className="text-center space-y-1">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Mode B • Continuation</span>
                <h3 className="text-lg font-bold">Complete the Verse</h3>
                <p className="text-xs text-slate-500">Read the starting words and choose the correct continuation.</p>
              </div>

              {/* Prompt showing only first half */}
              <div className="py-6 px-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border text-center dir-rtl" dir="rtl">
                <p className="font-arabic text-3xl text-emerald-800 dark:text-emerald-300">
                  {currentVerse.words.slice(0, Math.max(2, Math.floor(currentVerse.words.length / 2))).map(w => w.arabic).join(' ')} ... ؟
                </p>
              </div>

              {/* Choices */}
              <div className="space-y-2.5">
                {getChoiceOptions().map((opt, idx) => (
                  <button
                    key={idx}
                    disabled={isAnswerChecked}
                    onClick={() => handleCheckMultipleChoice(opt)}
                    className={`w-full p-4 rounded-xl border text-right font-arabic text-xl dir-rtl transition-all ${
                      isAnswerChecked && opt === currentVerse.textUthmani
                        ? 'bg-emerald-500 text-white border-emerald-600'
                        : selectedChoice === opt && !isCorrect
                        ? 'bg-rose-500 text-white border-rose-600'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-blue-500'
                    }`}
                    dir="rtl"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* MODE C: WORD REORDERING */}
          {activeMode === 'C' && (
            <div className="space-y-6">
              <div className="text-center space-y-1">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Mode C • Syntax Assembly</span>
                <h3 className="text-lg font-bold">Word Reordering</h3>
                <p className="text-xs text-slate-500">Assemble the words of this Ayah into their exact canonical order.</p>
              </div>

              {/* Workspace */}
              <div className="min-h-[80px] p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-wrap gap-2 items-center justify-center dir-rtl" dir="rtl">
                {assembledTokens.length === 0 ? (
                  <span className="text-xs text-slate-400 font-sans" dir="ltr">Tap tokens below in order</span>
                ) : (
                  assembledTokens.map((tok, tIdx) => (
                    <button
                      key={tIdx}
                      onClick={() => setAssembledTokens(prev => prev.filter((_, i) => i !== tIdx))}
                      className="font-arabic text-2xl px-3 py-1.5 rounded-xl bg-blue-600 text-white shadow-xs hover:bg-rose-500 transition-colors"
                    >
                      {tok}
                    </button>
                  ))
                )}
              </div>

              {/* Shuffled Available Tokens */}
              <div className="flex flex-wrap gap-2 justify-center dir-rtl" dir="rtl">
                {currentVerse.words.map((w, idx) => {
                  const isUsed = assembledTokens.includes(w.arabic);
                  return (
                    <button
                      key={idx}
                      disabled={isUsed || isAnswerChecked}
                      onClick={() => setAssembledTokens(prev => [...prev, w.arabic])}
                      className={`font-arabic text-2xl px-4 py-2 rounded-xl border transition-all ${
                        isUsed
                          ? 'opacity-30 border-slate-200 pointer-events-none'
                          : 'bg-white dark:bg-slate-800 border-slate-200 hover:border-blue-500'
                      }`}
                    >
                      {w.arabic}
                    </button>
                  );
                })}
              </div>

              <div className="pt-2">
                <button
                  onClick={() => {
                    const ans = assembledTokens.join(' ').trim();
                    const target = currentVerse.words.map(w => w.arabic).join(' ').trim();
                    const correct = ans === target;
                    setIsCorrect(correct);
                    setIsAnswerChecked(true);
                    if (correct) {
                      confetti({ particleCount: 50, spread: 60 });
                      awardXP(15);
                    }
                  }}
                  className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md"
                >
                  Check Canonical Order
                </button>
              </div>
            </div>
          )}

          {/* MODE D: FIRST WORD PROMPT */}
          {activeMode === 'D' && (
            <div className="space-y-6 text-center">
              <div className="space-y-1">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Mode D • Initial Trigger</span>
                <h3 className="text-lg font-bold">First Word Recall</h3>
                <p className="text-xs text-slate-500">Trigger your memory using just the initial word.</p>
              </div>

              <div className="py-8 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border text-center">
                <span className="text-xs font-semibold text-slate-400 block mb-2">First Word:</span>
                <p className="font-arabic text-4xl text-emerald-600 font-bold">
                  {currentVerse.words[0]?.arabic}
                </p>
                {isRevealed && (
                  <p className="font-arabic text-2xl text-slate-800 dark:text-slate-200 mt-6 leading-loose animate-in fade-in">
                    {currentVerse.textUthmani}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setIsRevealed(!isRevealed)}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 text-xs font-bold"
                >
                  {isRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  <span>{isRevealed ? 'Hide Full Verse' : 'Reveal Full Verse'}</span>
                </button>
              </div>
            </div>
          )}

          {/* MODE E: AUDIO TO AYAH */}
          {activeMode === 'E' && (
            <div className="space-y-6">
              <div className="text-center space-y-1">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Mode E • Auditory Recognition</span>
                <h3 className="text-lg font-bold">Audio to Ayah Match</h3>
                <p className="text-xs text-slate-500">Play the audio clip and select which Ayah was recited.</p>
              </div>

              <div className="text-center py-4">
                <button
                  onClick={() => playAudio(currentVerse.audioUrl, currentVerse.textUthmani)}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md active:scale-95"
                >
                  <Volume2 className="w-5 h-5" />
                  <span>Play Mystery Recitation</span>
                </button>
              </div>

              <div className="space-y-2.5">
                {getChoiceOptions().map((opt, idx) => (
                  <button
                    key={idx}
                    disabled={isAnswerChecked}
                    onClick={() => handleCheckMultipleChoice(opt)}
                    className={`w-full p-4 rounded-xl border text-right font-arabic text-xl dir-rtl transition-all ${
                      isAnswerChecked && opt === currentVerse.textUthmani
                        ? 'bg-emerald-500 text-white border-emerald-600'
                        : selectedChoice === opt && !isCorrect
                        ? 'bg-rose-500 text-white border-rose-600'
                        : 'bg-white dark:bg-slate-800 border-slate-200 hover:border-blue-500'
                    }`}
                    dir="rtl"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* MODE F: MEANING TO AYAH */}
          {activeMode === 'F' && (
            <div className="space-y-6">
              <div className="text-center space-y-1">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Mode F • Semantic Association</span>
                <h3 className="text-lg font-bold">Meaning to Ayah Match</h3>
                <p className="text-xs text-slate-500">Read the English & Tamil translations, then match with the Arabic text.</p>
              </div>

              <div className="p-6 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border space-y-2 text-center">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  &ldquo;{currentVerse.translationEn}&rdquo;
                </p>
                {currentVerse.translationTa && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 font-tamil">
                    &ldquo;{currentVerse.translationTa}&rdquo;
                  </p>
                )}
              </div>

              <div className="space-y-2.5">
                {getChoiceOptions().map((opt, idx) => (
                  <button
                    key={idx}
                    disabled={isAnswerChecked}
                    onClick={() => handleCheckMultipleChoice(opt)}
                    className={`w-full p-4 rounded-xl border text-right font-arabic text-xl dir-rtl transition-all ${
                      isAnswerChecked && opt === currentVerse.textUthmani
                        ? 'bg-emerald-500 text-white border-emerald-600'
                        : selectedChoice === opt && !isCorrect
                        ? 'bg-rose-500 text-white border-rose-600'
                        : 'bg-white dark:bg-slate-800 border-slate-200 hover:border-blue-500'
                    }`}
                    dir="rtl"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* MODE G: MISSING SEGMENT */}
          {activeMode === 'G' && (
            <div className="space-y-6">
              <div className="text-center space-y-1">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Mode G • Cloze Deletion</span>
                <h3 className="text-lg font-bold">Missing Segment</h3>
                <p className="text-xs text-slate-500">Identify the missing word in the verse.</p>
              </div>

              <div className="p-6 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border text-center dir-rtl" dir="rtl">
                <p className="font-arabic text-3xl leading-loose">
                  {currentVerse.words.map((w, i) => (
                    i === 1 ? (
                      <span key={i} className="px-3 py-1 bg-amber-200 dark:bg-amber-900/60 rounded-lg text-amber-900 dark:text-amber-200 mx-1">
                        [ ؟ ]
                      </span>
                    ) : (
                      <span key={i} className="mx-1">{w.arabic}</span>
                    )
                  ))}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[currentVerse.words[1]?.arabic, ...currentVerse.words.slice(2, 5).map(w => w.arabic)]
                  .filter(Boolean)
                  .sort((a, b) => (a.charCodeAt(0) % 7) - (b.charCodeAt(0) % 7))
                  .map((opt, oIdx) => (
                    <button
                      key={oIdx}
                      disabled={isAnswerChecked}
                      onClick={() => {
                        const correct = opt === currentVerse.words[1]?.arabic;
                        setIsCorrect(correct);
                        setSelectedChoice(opt);
                        setIsAnswerChecked(true);
                        if (correct) {
                          confetti({ particleCount: 50 });
                          awardXP(10);
                        }
                      }}
                      className={`p-4 rounded-xl border text-center font-arabic text-2xl transition-all ${
                        isAnswerChecked && opt === currentVerse.words[1]?.arabic
                          ? 'bg-emerald-500 text-white'
                          : selectedChoice === opt && !isCorrect
                          ? 'bg-rose-500 text-white'
                          : 'bg-white dark:bg-slate-800 border-slate-200'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* MODE H: BLIND RECITATION (SRS SELF-RATING) */}
          {activeMode === 'H' && (
            <div className="space-y-6 text-center">
              <div className="space-y-1">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Mode H • Blind Recitation & SM-2 SRS</span>
                <h3 className="text-lg font-bold">Mental Recitation & Self-Rating</h3>
                <p className="text-xs text-slate-500">Recite Ayah {currentVerse.surah}:{currentVerse.ayah} from memory, then reveal and rate your retention quality.</p>
              </div>

              <div className="p-8 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border min-h-[140px] flex flex-col items-center justify-center">
                {!isRevealed ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-slate-400">Verse hidden for blind recall</p>
                    <button
                      onClick={() => setIsRevealed(true)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Reveal Verse</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 animate-in fade-in">
                    <p className="font-arabic text-3xl sm:text-4xl text-slate-900 dark:text-slate-100 leading-loose dir-rtl" dir="rtl">
                      {currentVerse.textUthmani}
                    </p>
                    <p className="text-xs text-slate-500">{currentVerse.translationEn}</p>
                  </div>
                )}
              </div>

              {/* SM-2 Rating Buttons */}
              {isRevealed && (
                <div className="space-y-2 pt-2 animate-in slide-in-from-bottom-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Grade Your Recall (Spaced Repetition Engine)
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <button
                      onClick={() => handleSelfGrade(1)}
                      className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-rose-700 dark:text-rose-300 text-xs font-bold hover:bg-rose-100"
                    >
                      Again (&lt;1d)
                    </button>
                    <button
                      onClick={() => handleSelfGrade(3)}
                      className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 text-amber-700 dark:text-amber-300 text-xs font-bold hover:bg-amber-100"
                    >
                      Hard (1-2d)
                    </button>
                    <button
                      onClick={() => handleSelfGrade(4)}
                      className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-emerald-700 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-100"
                    >
                      Good (3-5d)
                    </button>
                    <button
                      onClick={() => handleSelfGrade(5)}
                      className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 text-blue-700 dark:text-blue-300 text-xs font-bold hover:bg-blue-100"
                    >
                      Easy (7+d)
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MODE I: TIMED SPEED RECALL */}
          {activeMode === 'I' && (
            <div className="space-y-6 text-center">
              <div className="space-y-1">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Mode I • Rapid Memory Check</span>
                <h3 className="text-lg font-bold">Timed Speed Recall (15s)</h3>
                <p className="text-xs text-slate-500">Check if your neural pathways can recall the verse within 15 seconds.</p>
              </div>

              <div className="flex items-center justify-center gap-2">
                <Clock className="w-5 h-5 text-amber-500" />
                <span className={`text-2xl font-extrabold ${timerSeconds <= 5 ? 'text-rose-500 animate-ping' : 'text-slate-800 dark:text-slate-200'}`}>
                  {timerSeconds}s
                </span>
              </div>

              {!timerActive && (
                <button
                  onClick={() => {
                    setTimerSeconds(15);
                    setTimerActive(true);
                  }}
                  className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-md"
                >
                  Start 15s Countdown
                </button>
              )}

              {timerActive && (
                <div className="p-6 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border space-y-4">
                  <p className="font-arabic text-3xl text-slate-900 dark:text-slate-100 leading-loose dir-rtl" dir="rtl">
                    {currentVerse.textUthmani}
                  </p>
                  <button
                    onClick={() => {
                      setTimerActive(false);
                      confetti({ particleCount: 60 });
                      awardXP(20);
                    }}
                    className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md"
                  >
                    I Recited It In Time! (+20 XP)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* MODE J: AI GUIDED HIFZ SESSION */}
          {activeMode === 'J' && (
            <div className="space-y-6 text-center">
              <div className="space-y-1">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Mode J • AI Tutor Mentorship</span>
                <h3 className="text-lg font-bold">AI Guided Hifz Session</h3>
                <p className="text-xs text-slate-500">Work directly with the AI tutor to identify phonetic pitfalls and mnemonic associations.</p>
              </div>

              <div className="p-6 bg-emerald-50/50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800/50 text-center space-y-3">
                <Sparkles className="w-8 h-8 text-amber-500 mx-auto" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Ready to test Surah {currentVerse.surah}:{currentVerse.ayah}
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 max-w-md mx-auto">
                  The AI tutor will ask you targeted questions about roots, Tajweed phonetics, and Tamil/English context for this verse.
                </p>
                <button
                  onClick={() => {
                    setAiTutorPrompt(`Please guide me in memorizing Surah ${currentVerse.surah}:${currentVerse.ayah} ("${currentVerse.textUthmani}"). Give me: 1) Memory anchors / root connections, 2) Tajweed pronunciation watch-outs, 3) Tamil explanation to reinforce meaning.`);
                    setAiTutorOpen(true);
                  }}
                  className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md"
                >
                  Start AI Coaching for this Ayah
                </button>
              </div>
            </div>
          )}

        </div>
      ) : null}

      {/* Floating AI Tutor Panel when triggered */}
      <TutorPanel
        isOpen={aiTutorOpen}
        onClose={() => setAiTutorOpen(false)}
        initialPrompt={aiTutorPrompt}
      />
    </div>
  );
}

export default function MemorizationPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-xs text-slate-400">Loading Memorization Suite...</div>}>
      <MemorizationContent />
    </Suspense>
  );
}
