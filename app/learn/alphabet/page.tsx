'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  Volume2, 
  ChevronLeft, 
  BookOpen,
  Headphones
} from 'lucide-react';
import { ARABIC_ALPHABET, ArabicLetterMeta, playLetterAudio } from '@/lib/audio/alphabet-audio';
import { previewAudio } from '@/lib/audio/preview-audio';
import { db } from '@/lib/db';
import { evaluateStreak } from '@/lib/learning/xp-engine';
import { localDayKey } from '@/lib/time/day';
import { shuffle } from '@/lib/utils';
import confetti from 'canvas-confetti';

type VowelMode = 'isolated' | 'fatha' | 'kasra' | 'damma' | 'tanween' | 'sukoon';
type CategoryFilter = 'all' | 'throat' | 'tongue' | 'lips' | 'emphatic' | 'qalqalah';

export default function AlphabetStudioPage() {
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  const [vowelMode, setVowelMode] = useState<VowelMode>('isolated');
  const [activePlayingId, setActivePlayingId] = useState<string | null>(null);
  const [selectedLetter, setSelectedLetter] = useState<ArabicLetterMeta>(
    () => ARABIC_ALPHABET[0] as ArabicLetterMeta
  );
  const [quizMode, setQuizMode] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
  const [quizTotal, setQuizTotal] = useState(0);
  const [quizQuestion, setQuizQuestion] = useState<{
    target: ArabicLetterMeta;
    options: ArabicLetterMeta[];
    selectedAnswer: string | null;
    isCorrect: boolean | null;
  } | null>(null);

  // Leaving the studio releases the shared player, so a letter cannot keep sounding
  // over the page the learner navigates to next.
  useEffect(() => () => previewAudio.stop(), []);

  const handlePlaySound = async (letter: ArabicLetterMeta) => {
    setActivePlayingId(letter.id);
    const clearIfStillActive = (state: 'playing' | 'ended' | 'error'): void => {
      if (state === 'ended' || state === 'error') {
        // Only clear the indicator if this letter is still the one highlighted;
        // tapping a second letter used to be cancelled by the first one finishing.
        setActivePlayingId((previous) => (previous === letter.id ? null : previous));
      }
    };

    try {
      await playLetterAudio(letter, clearIfStillActive);
    } finally {
      clearIfStillActive('ended');
    }
  };

  const getVowelGlyph = (baseLetter: string, mode: VowelMode) => {
    switch (mode) {
      case 'fatha':
        return `${baseLetter}\u064E`;
      case 'kasra':
        return `${baseLetter}\u0650`;
      case 'damma':
        return `${baseLetter}\u064F`;
      case 'tanween':
        return `${baseLetter}\u064B`;
      case 'sukoon':
        return `${baseLetter}\u0652`;
      default:
        return baseLetter;
    }
  };

  const getVowelPhonetic = (name: string, mode: VowelMode) => {
    const base = name.split(' ')[0];
    switch (mode) {
      case 'fatha':
        return `${base} + a (Fatha)`;
      case 'kasra':
        return `${base} + i (Kasra)`;
      case 'damma':
        return `${base} + u (Damma)`;
      case 'tanween':
        return `${base} + an (Tanween)`;
      case 'sukoon':
        return `Silent stop (Sukoon)`;
      default:
        return name;
    }
  };

  // Filter letters
  const filteredLetters = ARABIC_ALPHABET.filter((letter) => {
    if (selectedCategory === 'all') return true;
    if (selectedCategory === 'throat') return letter.category === 'throat';
    if (selectedCategory === 'tongue') return letter.category === 'tongue';
    if (selectedCategory === 'lips') return letter.category === 'lips';
    if (selectedCategory === 'emphatic') return letter.isEmphatic;
    if (selectedCategory === 'qalqalah') {
      return ['ق', 'ط', 'ب', 'ج', 'د'].includes(letter.letter);
    }
    return true;
  });

  // Quiz generator
  const startQuiz = () => {
    setQuizMode(true);
    generateNextQuestion();
  };

  const generateNextQuestion = () => {
    const target = ARABIC_ALPHABET[Math.floor(Math.random() * ARABIC_ALPHABET.length)] ?? selectedLetter;
    const distractors = shuffle(ARABIC_ALPHABET.filter((l) => l.id !== target.id)).slice(0, 3);
    const options = shuffle([target, ...distractors]);

    setQuizQuestion({
      target,
      options,
      selectedAnswer: null,
      isCorrect: null,
    });

    // Auto play target audio
    setTimeout(() => {
      handlePlaySound(target);
    }, 200);
  };

  const handleQuizAnswer = async (option: ArabicLetterMeta) => {
    if (!quizQuestion || quizQuestion.selectedAnswer !== null) return;
    const isCorrect = option.id === quizQuestion.target.id;
    setQuizQuestion({
      ...quizQuestion,
      selectedAnswer: option.id,
      isCorrect,
    });
    setQuizTotal((prev) => prev + 1);

    if (isCorrect) {
      setQuizScore((prev) => prev + 1);
      confetti({ particleCount: 30, spread: 50 });
      try {
        const profile = await db.userProfile.get('default_user');
        if (profile) {
          const streakEval = evaluateStreak(profile.lastActiveDate, profile.streakCount);
          await db.userProfile.update('default_user', {
            totalXp: profile.totalXp + 10,
            streakCount: streakEval.newStreak,
            lastActiveDate: localDayKey(),
          });
        }
      } catch (e) {
        console.warn(e);
      }
    }
  };

  return (
    <div id="alphabet-studio" className="space-y-6 animate-in fade-in duration-300 pb-16">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/learn"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors py-1.5 px-2.5 rounded-lg hover:bg-surface-hover"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Curriculum</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (quizMode) {
                setQuizMode(false);
              } else {
                startQuiz();
              }
            }}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 ${
              quizMode
                ? 'bg-card border border-border text-foreground'
                : 'bg-primary hover:bg-primary-hover text-primary-foreground'
            }`}
          >
            {quizMode ? <BookOpen className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
            <span>{quizMode ? 'Letter Explorer' : 'Ear Training Quiz'}</span>
          </button>
        </div>
      </div>

      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-card border border-border p-6 sm:p-8 text-foreground shadow-xs">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-subtle text-primary text-xs font-semibold">
              <Volume2 className="w-3.5 h-3.5 text-secondary" />
              <span>Noorani Qaida & Makharij</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Arabic Alphabet
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm max-w-xl leading-relaxed">
              Listen to recordings of all 28 letters, practise throat and tongue makharij, and explore harakat (fatha, kasra, damma) with Tamil phonetics.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-surface p-3 rounded-2xl border border-border">
            <button
              onClick={() => handlePlaySound(selectedLetter)}
              className="w-12 h-12 rounded-xl bg-secondary hover:bg-secondary-hover text-secondary-foreground flex items-center justify-center shadow-md transition-transform active:scale-90"
              title="Play Selected Letter Audio"
            >
              <Volume2 className="w-6 h-6" />
            </button>
            <div className="pr-2">
              <span className="text-[10px] uppercase font-bold text-primary block">Selected</span>
              <p className="text-sm font-bold text-foreground">{selectedLetter.nameEn} ({selectedLetter.nameArabic})</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quiz Screen Mode */}
      {quizMode && quizQuestion ? (
        <div className="max-w-xl mx-auto p-6 sm:p-8 rounded-3xl bg-card border border-border shadow-md space-y-6 animate-in zoom-in-95">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <span className="text-xs font-bold text-primary uppercase tracking-wider">
              Ear Training: Identify the Letter
            </span>
            <span className="text-xs font-semibold text-muted-foreground">
              Score: {quizScore} / {quizTotal}
            </span>
          </div>

          <div className="text-center py-6 space-y-4">
            <p className="text-xs text-muted-foreground">
              Listen to the pronunciation and select the matching Arabic letter:
            </p>

            <button
              onClick={() => handlePlaySound(quizQuestion.target)}
              className={`inline-flex items-center gap-3 px-6 py-4 rounded-2xl text-sm font-bold shadow-md transition-all active:scale-95 ${
                activePlayingId === quizQuestion.target.id
                  ? 'bg-secondary text-secondary-foreground ring-4 ring-secondary/30 animate-pulse'
                  : 'bg-primary hover:bg-primary-hover text-primary-foreground'
              }`}
            >
              <Volume2 className="w-5 h-5" />
              <span>{activePlayingId === quizQuestion.target.id ? 'Playing Sound...' : 'Replay Sound'}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {quizQuestion.options.map((opt) => {
              const isSelected = quizQuestion.selectedAnswer === opt.id;
              const isTarget = opt.id === quizQuestion.target.id;
              let btnStyle = 'border-border hover:border-primary/40 bg-surface hover:bg-surface-hover text-foreground';

              if (quizQuestion.selectedAnswer !== null) {
                if (isTarget) {
                  btnStyle = 'border-primary bg-primary-subtle text-primary-strong ring-2 ring-primary';
                } else if (isSelected) {
                  btnStyle = 'border-danger bg-danger-subtle text-danger-strong ring-2 ring-danger';
                } else {
                  btnStyle = 'opacity-40 border-border bg-surface text-muted-foreground';
                }
              }

              return (
                <button
                  key={opt.id}
                  disabled={quizQuestion.selectedAnswer !== null}
                  onClick={() => handleQuizAnswer(opt)}
                  className={`p-4 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 active:scale-98 min-h-[90px] ${btnStyle}`}
                >
                  <span className="font-arabic text-4xl" lang="ar" dir="rtl">
                    {opt.letter}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">{opt.nameEn}</span>
                </button>
              );
            })}
          </div>

          {quizQuestion.selectedAnswer !== null && (
            <div className="space-y-3 pt-2">
              <div
                className={`p-4 rounded-2xl text-center text-xs font-bold ${
                  quizQuestion.isCorrect
                    ? 'bg-success-subtle text-success-strong'
                    : 'bg-danger-subtle text-danger-strong'
                }`}
              >
                {quizQuestion.isCorrect ? (
                  <span>Alhamdulillah! Correct! +10 XP earned.</span>
                ) : (
                  <span>
                    Incorrect. The sound played was{' '}
                    <strong>{quizQuestion.target.nameEn} ({quizQuestion.target.letter})</strong>.
                  </span>
                )}
              </div>

              <button
                onClick={generateNextQuestion}
                className="w-full py-3 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-xs shadow-md transition-all active:scale-95"
              >
                Next Audio Challenge
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Regular Studio View */
        <div className="space-y-6">
          {/* Controls Bar: Vowel Mode & Category Filters */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-4 sm:p-5 rounded-3xl border border-border shadow-xs">
            {/* Vowel selector */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                Harakat / Vowel Mark
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: 'isolated', label: 'Plain (حروف)', sub: 'Isolated' },
                    { id: 'fatha', label: 'Fatha (ـَ)', sub: 'Short A' },
                    { id: 'kasra', label: 'Kasra (ـِ)', sub: 'Short I' },
                    { id: 'damma', label: 'Damma (ـُ)', sub: 'Short U' },
                    { id: 'tanween', label: 'Tanween (ـً)', sub: 'Double An' },
                    { id: 'sukoon', label: 'Sukoon (ـْ)', sub: 'Rest / Stop' },
                  ] as const
                ).map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setVowelMode(v.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      vowelMode === v.id
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'bg-surface text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Category Filter */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                Makhraj / Articulation Category
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: 'all', label: 'All 28' },
                    { id: 'throat', label: 'Throat (حلق)' },
                    { id: 'tongue', label: 'Tongue (لسان)' },
                    { id: 'lips', label: 'Lips (شفتين)' },
                    { id: 'emphatic', label: 'Heavy (مفخم)' },
                    { id: 'qalqalah', label: 'Qalqalah (قلقلة)' },
                  ] as const
                ).map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      selectedCategory === cat.id
                        ? 'bg-secondary text-secondary-foreground font-bold shadow-xs'
                        : 'bg-surface text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main Grid & Inspector Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Letters Grid (2 cols on lg) */}
            <div className="lg:col-span-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 gap-3">
                {filteredLetters.map((item) => {
                  const isPlaying = activePlayingId === item.id;
                  const isSelected = selectedLetter.id === item.id;
                  const displayGlyph = getVowelGlyph(item.letter, vowelMode);

                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        setSelectedLetter(item);
                        handlePlaySound(item);
                      }}
                      className={`group relative p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between items-center text-center select-none active:scale-97 min-h-[140px] ${
                        isSelected
                          ? 'bg-primary-subtle border-primary ring-2 ring-primary/40 shadow-xs'
                          : 'bg-card border-border hover:border-primary/40 hover:bg-surface-hover'
                      }`}
                    >
                      {/* Audio indicator badge */}
                      <div className="w-full flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">
                          {item.nameEn}
                        </span>
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                            isPlaying
                              ? 'bg-secondary text-secondary-foreground animate-bounce'
                              : 'bg-surface text-muted-foreground group-hover:text-primary'
                          }`}
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </div>
                      </div>

                      {/* Giant Arabic Glyph */}
                      <p className="font-arabic text-5xl my-1 text-foreground transition-transform group-hover:scale-110" lang="ar" dir="rtl">
                        {displayGlyph}
                      </p>

                      {/* Transliteration & Tamil */}
                      <div className="mt-1 space-y-0.5">
                        <span className="text-xs font-bold text-primary block">
                          {item.nameTa}
                        </span>
                        <span className="text-[10px] text-muted-foreground block truncate max-w-[100px]">
                          {item.category}
                        </span>
                      </div>

                      {/* Playing pulse waves */}
                      {isPlaying && (
                        <div className="absolute inset-0 rounded-2xl border-2 border-secondary pointer-events-none animate-pulse" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Letter Deep-Dive Inspector (1 col on lg) */}
            <div className="space-y-5">
              <div className="sticky top-20 bg-card border border-border rounded-3xl p-6 shadow-md space-y-5">
                {/* Header of Inspector */}
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div>
                    <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                      Letter Profile
                    </span>
                    <h3 className="text-xl font-extrabold text-foreground">
                      {selectedLetter.nameEn} • {selectedLetter.nameTa}
                    </h3>
                  </div>

                  <button
                    onClick={() => handlePlaySound(selectedLetter)}
                    className="p-3 rounded-2xl bg-primary hover:bg-primary-hover text-primary-foreground shadow-md active:scale-95 transition-transform"
                    title="Play audio pronunciation"
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                </div>

                {/* Big Center Display */}
                <div className="text-center py-4 bg-surface rounded-2xl border border-border">
                  <p className="font-arabic text-7xl text-foreground select-none my-2" lang="ar" dir="rtl">
                    {getVowelGlyph(selectedLetter.letter, vowelMode)}
                  </p>
                  <p className="text-xs font-semibold text-muted-foreground">
                    {getVowelPhonetic(selectedLetter.nameEn, vowelMode)}
                  </p>
                </div>

                {/* 4 Script Positions (Isolated, Initial, Medial, Final) */}
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Letter Positions (أشكال الحرف)
                  </span>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="p-2.5 rounded-xl bg-surface border border-border">
                      <span className="text-[10px] text-muted-foreground block mb-1">Final</span>
                      <span className="font-arabic text-2xl text-foreground" lang="ar" dir="rtl">
                        {selectedLetter.forms.final}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-surface border border-border">
                      <span className="text-[10px] text-muted-foreground block mb-1">Medial</span>
                      <span className="font-arabic text-2xl text-foreground" lang="ar" dir="rtl">
                        {selectedLetter.forms.medial}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-surface border border-border">
                      <span className="text-[10px] text-muted-foreground block mb-1">Initial</span>
                      <span className="font-arabic text-2xl text-foreground" lang="ar" dir="rtl">
                        {selectedLetter.forms.initial}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-primary-subtle border border-primary/40">
                      <span className="text-[10px] text-primary block mb-1 font-bold">Isolated</span>
                      <span className="font-arabic text-2xl text-primary-strong" lang="ar" dir="rtl">
                        {selectedLetter.forms.isolated}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Makhraj (Point of Articulation) */}
                <div className="space-y-1.5 p-4 rounded-2xl bg-secondary-subtle border border-secondary/30">
                  <span className="text-[10px] font-bold text-secondary-strong uppercase tracking-wider block">
                    Makhraj (உச்சரிப்புத் தானம்)
                  </span>
                  <p className="text-xs text-foreground leading-relaxed font-medium">
                    {selectedLetter.makhrajEn}
                  </p>
                  <p className="text-xs text-primary-strong font-tamil leading-relaxed pt-1 border-t border-border">
                    {selectedLetter.makhrajTa}
                  </p>
                </div>

                {/* Sample Quranic Word */}
                {selectedLetter.sampleWord && (
                  <div className="space-y-1.5 p-4 rounded-2xl bg-surface border border-border">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                      Sample Vocabulary Word
                    </span>
                    <div className="flex items-center justify-between">
                      <span className="font-arabic text-3xl text-primary" lang="ar" dir="rtl">
                        {selectedLetter.sampleWord.arabic}
                      </span>
                      <div className="text-right">
                        <span className="text-xs font-bold text-foreground block">
                          {selectedLetter.sampleWord.transliteration}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {selectedLetter.sampleWord.translationEn} • {selectedLetter.sampleWord.translationTa}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
