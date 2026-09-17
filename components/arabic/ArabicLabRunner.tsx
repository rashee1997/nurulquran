'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ArabicLabActivity,
  ArabicLabBuildActivity,
  ArabicLabChoiceActivity,
  ArabicLabDialogueActivity,
  ArabicLabDictationActivity,
  ArabicLabLesson,
  ArabicLabStrokeActivity,
  ArabicTrack,
} from '@/lib/arabic/types';
import { getArabicDialog } from '@/lib/arabic/dialogs';
import { recordMasteredEntries, recordStrokeScore } from '@/lib/arabic/progress';
import { isEnglishEnabled, isTamilEnabled, type FeedbackLanguage } from '@/lib/i18n/language';
import { BilingualLines } from './Bilingual';
import { RegisterBridgePanel } from './RegisterBridgePanel';
import { StrokeTraceCanvas } from './StrokeTraceCanvas';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  PenLine,
  RotateCcw,
  Sparkles,
  Trophy,
  Volume2,
  X,
  XCircle,
} from 'lucide-react';

const TRACK_META: Record<ArabicTrack, { label: string; className: string }> = {
  reading: { label: 'Reading', className: 'bg-info-subtle text-info-strong border-info/30' },
  writing: { label: 'Writing', className: 'bg-secondary-subtle text-secondary-strong border-secondary/30' },
  grammar: { label: 'Grammar · Naḥw & Ṣarf', className: 'bg-primary-subtle text-primary-strong border-primary/30' },
  register: { label: 'Register bridge', className: 'bg-muted text-foreground border-border-strong' },
};

const ARABIC_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

/** Comparison normaliser: diacritics, alef/ya/ta variants and punctuation are forgiven. */
export function normalizeArabic(value: string): string {
  return value
    .replace(ARABIC_DIACRITICS, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\u0600-\u06FF\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isArabicText(value: string): boolean {
  return /[\u0600-\u06FF]/.test(value);
}

/** Deterministic shuffle so option order is stable across renders and remounts. */
function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  let state = 7;
  for (let i = 0; i < seed.length; i += 1) {
    state = (state * 31 + seed.charCodeAt(i)) % 2147483647;
  }
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (state * 1103515245 + 12345) % 2147483647;
    const j = state % (i + 1);
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return out;
}

function bilingual(en: string, ta: string, language: FeedbackLanguage): string {
  if (isTamilEnabled(language) && !isEnglishEnabled(language)) return ta;
  return en;
}

interface ActivityProps<A extends ArabicLabActivity> {
  activity: A;
  language: FeedbackLanguage;
  onAnswered: (correct: boolean) => void;
}

// ---------------------------------------------------------------------------
// Feedback footer shared by every activity
// ---------------------------------------------------------------------------

const FeedbackBlock: React.FC<{
  correct: boolean;
  explanationEn?: string;
  explanationTa?: string;
  language: FeedbackLanguage;
  extra?: React.ReactNode;
}> = ({ correct, explanationEn, explanationTa, language, extra }) => (
  <div
    className={`p-3.5 rounded-xl border space-y-2 ${
      correct ? 'bg-success-subtle border-success/30' : 'bg-destructive-subtle border-destructive/25'
    }`}
  >
    <div className="flex items-center gap-2">
      {correct ? (
        <CheckCircle2 className="w-4 h-4 text-success-strong shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-destructive-strong shrink-0" />
      )}
      <span
        className={`text-xs font-bold ${correct ? 'text-success-strong' : 'text-destructive-strong'}`}
      >
        {correct ? 'Correct' : 'Not quite'}
      </span>
    </div>
    {explanationEn && explanationTa && (
      <BilingualLines
        language={language}
        text={{ en: explanationEn, ta: explanationTa }}
        className="text-[11px] text-foreground/90 leading-relaxed"
      />
    )}
    {extra}
  </div>
);

// ---------------------------------------------------------------------------
// 1. Multiple choice family (iʿrāb, register compare, tashkeel, joins, sarf)
// ---------------------------------------------------------------------------

const ChoiceCard: React.FC<ActivityProps<ArabicLabChoiceActivity>> = ({
  activity,
  language,
  onAnswered,
}) => {
  const options = useMemo(() => seededShuffle(activity.options, activity.id), [activity.id, activity.options]);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const correct = selected === activity.correctAnswer;

  const check = () => {
    if (!selected || checked) return;
    setChecked(true);
    onAnswered(selected === activity.correctAnswer);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {options.map((option) => {
          const isSelected = selected === option;
          const isAnswer = option === activity.correctAnswer;
          const tone = checked
            ? isAnswer
              ? 'border-success/60 bg-success-subtle'
              : isSelected
                ? 'border-destructive/50 bg-destructive-subtle'
                : 'border-border bg-card opacity-70'
            : isSelected
              ? 'border-primary bg-primary-subtle'
              : 'border-border bg-card hover:border-primary/50 hover:bg-surface-hover';

          return (
            <button
              key={option}
              type="button"
              disabled={checked}
              onClick={() => setSelected(option)}
              dir={isArabicText(option) ? 'rtl' : 'ltr'}
              className={`w-full text-left px-3.5 py-3 rounded-xl border text-sm font-semibold transition-all ${tone} ${
                isArabicText(option) ? 'font-arabic text-lg leading-loose' : ''
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>

      {!checked ? (
        <button
          type="button"
          disabled={!selected}
          onClick={check}
          className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold disabled:opacity-40 transition-colors"
        >
          Check answer
        </button>
      ) : (
        <FeedbackBlock
          correct={correct}
          explanationEn={activity.explanationEn}
          explanationTa={activity.explanationTa}
          language={language}
          extra={
            !correct ? (
              <p className="text-[11px] text-muted-foreground">
                Correct answer:{' '}
                <span className="font-arabic text-base text-foreground" dir="rtl">
                  {activity.correctAnswer}
                </span>
              </p>
            ) : undefined
          }
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 2. Spoken production — arrange tokens into the MSA sentence
// ---------------------------------------------------------------------------

const BuildCard: React.FC<ActivityProps<ArabicLabBuildActivity>> = ({ activity, language, onAnswered }) => {
  const pool = useMemo(() => seededShuffle(activity.tokens, activity.id), [activity.id, activity.tokens]);
  const [picked, setPicked] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const remaining = useMemo(() => {
    const counts = new Map<string, number>();
    picked.forEach((token) => counts.set(token, (counts.get(token) ?? 0) + 1));
    return pool.filter((token) => {
      const used = counts.get(token) ?? 0;
      if (used === 0) return true;
      counts.set(token, used - 1);
      return false;
    });
  }, [picked, pool]);

  const correct = normalizeArabic(picked.join(' ')) === normalizeArabic(activity.correctAnswer);

  const check = () => {
    if (picked.length === 0 || checked) return;
    setChecked(true);
    onAnswered(correct);
  };

  return (
    <div className="space-y-3">
      <div
        dir="rtl"
        className="min-h-[76px] p-3 rounded-xl border-2 border-dashed border-border-strong bg-surface-muted flex flex-wrap gap-2 items-center"
      >
        {picked.length === 0 ? (
          <span className="text-[11px] text-muted-foreground mx-auto">
            Tap the words below to build the sentence
          </span>
        ) : (
          picked.map((token, index) => (
            <button
              key={`${token}-${index}`}
              type="button"
              disabled={checked}
              onClick={() => setPicked((current) => current.filter((_, i) => i !== index))}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-arabic text-lg leading-none"
            >
              {token}
            </button>
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-2" dir="rtl">
        {remaining.map((token, index) => (
          <button
            key={`${token}-${index}`}
            type="button"
            disabled={checked}
            onClick={() => setPicked((current) => [...current, token])}
            className="px-3 py-1.5 rounded-lg bg-card border border-border hover:border-primary/50 font-arabic text-lg leading-none text-foreground disabled:opacity-50"
          >
            {token}
          </button>
        ))}
      </div>

      {!checked ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPicked([])}
            className="px-3 py-2.5 rounded-xl bg-muted border border-border text-xs font-semibold hover:bg-surface-hover"
          >
            Reset
          </button>
          <button
            type="button"
            disabled={picked.length === 0}
            onClick={check}
            className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold disabled:opacity-40 transition-colors"
          >
            Check sentence
          </button>
        </div>
      ) : (
        <FeedbackBlock
          correct={correct}
          explanationEn={activity.explanationEn}
          explanationTa={activity.explanationTa}
          language={language}
          extra={
            <p className="text-[11px] text-muted-foreground">
              Target:{' '}
              <span className="font-arabic text-base text-foreground" dir="rtl">
                {activity.correctAnswer}
              </span>
            </p>
          }
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 3. Handwriting — guided tracing
// ---------------------------------------------------------------------------

const StrokeCard: React.FC<ActivityProps<ArabicLabStrokeActivity>> = ({ activity, language, onAnswered }) => {
  const [attempted, setAttempted] = useState(false);

  return (
    <div className="space-y-3">
      <StrokeTraceCanvas
        letterId={activity.writing.letterId}
        form={activity.writing.form}
        language={language}
        onPassed={(score) => {
          if (attempted) return;
          setAttempted(true);
          void recordStrokeScore(activity.writing.letterId, activity.writing.form, score);
          onAnswered(true);
        }}
      />
      {!attempted && (
        <button
          type="button"
          onClick={() => {
            setAttempted(true);
            onAnswered(false);
          }}
          className="w-full py-2 rounded-xl bg-muted border border-border text-[11px] font-semibold text-muted-foreground hover:bg-surface-hover"
        >
          Continue without a passing trace
        </button>
      )}
      {attempted && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-success-subtle border border-success/30">
          <CheckCircle2 className="w-4 h-4 text-success-strong shrink-0" />
          <span className="text-[11px] font-bold text-success-strong">
            {bilingual(
              'Tracing recorded — the score is stored with your best attempt.',
              'வரைவு பதிவாகிவிட்டது — சிறந்த முயற்சியின் மதிப்பெண் சேமிக்கப்பட்டது.',
              language
            )}
          </span>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 4. Dialogue practice — the spoken register in situation
// ---------------------------------------------------------------------------

const DialogueCard: React.FC<ActivityProps<ArabicLabDialogueActivity>> = ({ activity, language, onAnswered }) => {
  const dialog = getArabicDialog(activity.dialogId);
  const [showTransliteration, setShowTransliteration] = useState(false);
  const [spokenTurns, setSpokenTurns] = useState<number[]>([]);
  const learnerTurns = dialog?.turns.reduce<number[]>(
    (acc, turn, index) => (turn.speaker === 'learner' ? [...acc, index] : acc),
    []
  ) ?? [];
  const allSpoken = learnerTurns.length > 0 && learnerTurns.every((index) => spokenTurns.includes(index));

  if (!dialog) {
    return (
      <div className="p-4 rounded-xl bg-muted text-xs text-muted-foreground">
        This dialog could not be loaded.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-foreground">{dialog.titleArabic}</p>
          <BilingualLines
            language={language}
            text={{ en: dialog.scenarioEn, ta: dialog.scenarioTa }}
            className="text-[11px] text-muted-foreground"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowTransliteration((current) => !current)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted border border-border text-[10px] font-bold text-muted-foreground hover:bg-surface-hover shrink-0"
        >
          {showTransliteration ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          <span>{showTransliteration ? 'Hide transliteration' : 'Show transliteration'}</span>
        </button>
      </div>

      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {dialog.turns.map((turn, index) => {
          const isLearner = turn.speaker === 'learner';
          const spoken = spokenTurns.includes(index);
          return (
            <div
              key={`${turn.arabicMsa}-${index}`}
              className={`p-3 rounded-xl border ${
                isLearner ? 'bg-primary-subtle/60 border-primary/25' : 'bg-card border-border'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    isLearner ? 'text-primary-strong' : 'text-muted-foreground'
                  }`}
                >
                  {isLearner ? 'You' : 'Teacher'}
                </span>
                {isLearner && (
                  <button
                    type="button"
                    onClick={() =>
                      setSpokenTurns((current) =>
                        current.includes(index) ? current.filter((i) => i !== index) : [...current, index]
                      )
                    }
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                      spoken
                        ? 'bg-success text-success-foreground border-success'
                        : 'bg-card border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    <Volume2 className="w-3 h-3" />
                    <span>{spoken ? 'Said aloud' : 'Mark as said aloud'}</span>
                  </button>
                )}
              </div>
              <p className="font-arabic text-xl text-foreground leading-loose" dir="rtl">
                {turn.arabicMsa}
              </p>
              {showTransliteration && (
                <p className="text-[11px] italic text-muted-foreground mt-1">{turn.transliteration}</p>
              )}
              <BilingualLines
                language={language}
                text={{ en: turn.glossEn, ta: turn.glossTa }}
                className="text-[11px] text-muted-foreground mt-1"
              />
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={!allSpoken}
        onClick={() => onAnswered(true)}
        className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold disabled:opacity-40 transition-colors"
      >
        {allSpoken
          ? 'Finish dialogue drill'
          : `Say ${learnerTurns.length - spokenTurns.length} more turn(s) out loud`}
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 5. Dictation
// ---------------------------------------------------------------------------

const DictationCard: React.FC<ActivityProps<ArabicLabDictationActivity>> = ({
  activity,
  language,
  onAnswered,
}) => {
  const [value, setValue] = useState('');
  const [checked, setChecked] = useState(false);
  const correct = normalizeArabic(value) === normalizeArabic(activity.dictationText);
  const words = activity.dictationText.split(' ').filter(Boolean);

  const check = () => {
    if (!value.trim() || checked) return;
    setChecked(true);
    onAnswered(correct);
  };

  return (
    <div className="space-y-3">
      <div className="p-3 rounded-xl bg-muted/60 border border-border space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Target · {words.length} words
        </p>
        <BilingualLines
          language={language}
          text={{
            en: 'Write the sentence from memory — diacritics are optional, letters are not.',
            ta: 'வாக்கியத்தை நினைவிலிருந்து எழுதுங்கள் — உயிரொலிக் குறிகள் கட்டாயமில்லை, எழுத்துகள் கட்டாயம்.',
          }}
          className="text-[11px] text-muted-foreground"
        />
      </div>

      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={checked}
        dir="rtl"
        rows={3}
        placeholder="اكتب الجملة هنا…"
        className="w-full p-3 rounded-xl border border-border bg-card font-arabic text-2xl leading-loose text-foreground focus:outline-none focus:border-primary resize-none"
      />

      {!checked ? (
        <button
          type="button"
          disabled={!value.trim()}
          onClick={check}
          className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold disabled:opacity-40 transition-colors"
        >
          Check dictation
        </button>
      ) : (
        <FeedbackBlock
          correct={correct}
          explanationEn={activity.explanationEn}
          explanationTa={activity.explanationTa}
          language={language}
          extra={
            <p className="text-[11px] text-muted-foreground">
              Expected:{' '}
              <span className="font-arabic text-lg text-foreground" dir="rtl">
                {activity.dictationText}
              </span>
            </p>
          }
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Activity dispatcher
// ---------------------------------------------------------------------------

function renderActivityBody(
  activity: ArabicLabActivity,
  language: FeedbackLanguage,
  onAnswered: (correct: boolean) => void
): React.ReactNode {
  switch (activity.type) {
    case 'irab_parse':
    case 'register_compare':
    case 'tashkeel_placement':
    case 'letter_join':
    case 'sarf_match':
      return (
        <ChoiceCard
          key={activity.id}
          activity={activity}
          language={language}
          onAnswered={onAnswered}
        />
      );
    case 'spoken_build':
      return (
        <BuildCard key={activity.id} activity={activity} language={language} onAnswered={onAnswered} />
      );
    case 'stroke_trace':
      return (
        <StrokeCard key={activity.id} activity={activity} language={language} onAnswered={onAnswered} />
      );
    case 'dialogue_listen':
      return (
        <DialogueCard key={activity.id} activity={activity} language={language} onAnswered={onAnswered} />
      );
    case 'dictation':
      return (
        <DictationCard
          key={activity.id}
          activity={activity}
          language={language}
          onAnswered={onAnswered}
        />
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

interface ArabicLabRunnerProps {
  lesson: ArabicLabLesson;
  levelTitle: string;
  language: FeedbackLanguage;
  onExit: () => void;
  onCompleted: (score: number) => void;
}

export const ArabicLabRunner: React.FC<ArabicLabRunnerProps> = ({
  lesson,
  levelTitle,
  language,
  onExit,
  onCompleted,
}) => {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [finished, setFinished] = useState(false);
  const reportedRef = useRef(false);

  const activity = lesson.activities[index];
  const answered = activity ? answers[activity.id] !== undefined : false;
  const total = lesson.activities.length;
  const correctCount = Object.values(answers).filter(Boolean).length;
  const answeredCount = Object.keys(answers).length;
  const score = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
  const projectedXp = Math.round((lesson.xpReward * score) / 100);

  useEffect(() => {
    if (!finished || reportedRef.current) return;
    reportedRef.current = true;
    onCompleted(score);
  }, [finished, onCompleted, score]);

  const handleAnswered = (result: boolean) => {
    if (!activity) return;
    setAnswers((current) => ({ ...current, [activity.id]: result }));
    if (result) {
      const entryIds = activity.entryIds;
      if (entryIds.length > 0) void recordMasteredEntries(entryIds);
    }
  };

  const advance = () => {
    if (index + 1 >= total) {
      setFinished(true);
      return;
    }
    setIndex((current) => current + 1);
  };

  const restart = () => {
    reportedRef.current = false;
    setAnswers({});
    setIndex(0);
    setFinished(false);
  };

  if (finished) {
    return (
      <div className="max-w-xl mx-auto p-6 rounded-3xl bg-card border border-border shadow-xs space-y-5 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary-subtle text-primary-strong flex items-center justify-center mx-auto">
          <Trophy className="w-7 h-7" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-lg font-bold text-foreground">Lesson complete</h3>
          <p className="text-xs text-muted-foreground">
            {lesson.title} · {levelTitle}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-muted">
            <p className="text-xl font-extrabold text-foreground">{score}%</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Accuracy</p>
          </div>
          <div className="p-3 rounded-xl bg-primary-subtle">
            <p className="text-xl font-extrabold text-primary-strong">+{projectedXp}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary-strong">XP earned</p>
          </div>
          <div className="p-3 rounded-xl bg-muted">
            <p className="text-xl font-extrabold text-foreground">
              {correctCount}/{answeredCount}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Correct</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={restart}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-muted border border-border text-xs font-bold hover:bg-surface-hover"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Retry lesson</span>
          </button>
          <button
            type="button"
            onClick={onExit}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary-hover"
          >
            <span>Back to levels</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  if (!activity) return null;

  const track = TRACK_META[lesson.track];

  return (
    <div className="space-y-4">
      {/* Lesson header */}
      <div className="p-4 rounded-2xl bg-card border border-border shadow-xs space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${track.className}`}>
                {track.label}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {levelTitle} · {lesson.id}
              </span>
            </div>
            <h3 className="text-base font-bold text-foreground">{lesson.title}</h3>
            <p className="font-arabic text-lg text-muted-foreground leading-loose" dir="rtl">
              {lesson.titleArabic}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-primary-subtle text-primary-strong">
              {score}% accuracy
            </span>
            <button
              type="button"
              onClick={onExit}
              className="p-2 rounded-xl border border-border text-muted-foreground hover:bg-muted"
              aria-label="Exit lesson"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span>
              Activity {index + 1} of {total}
            </span>
            <span>{lesson.xpReward} XP lesson</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${Math.round(((index + (answered ? 1 : 0)) / total) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Split panel */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-card border border-border shadow-xs space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Lesson objective
            </p>
            <BilingualLines
              language={language}
              text={{ en: lesson.objectiveEn, ta: lesson.objectiveTa }}
              className="text-xs text-foreground/90 leading-relaxed"
            />
          </div>
          <RegisterBridgePanel
            entryIds={activity.entryIds}
            language={language}
            rulePair={lesson.rulePair}
            limit={lesson.rulePair ? 1 : 2}
          />
        </div>

        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-card border border-border shadow-xs space-y-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-foreground">{activity.title}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {activity.type.replace(/_/g, ' ')} · +{activity.xpReward} XP
                </span>
              </div>
              <BilingualLines
                language={language}
                text={{ en: activity.instructionEn, ta: activity.instructionTa }}
                className="text-[11px] text-muted-foreground leading-relaxed"
              />
            </div>

            {renderActivityBody(activity, language, handleAnswered)}
          </div>

          <button
            type="button"
            disabled={!answered}
            onClick={advance}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-foreground text-card text-xs font-bold disabled:opacity-40 transition-all hover:opacity-90"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{index + 1 >= total ? 'Finish lesson' : 'Next activity'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export const ArabicLabActivityIcon: React.FC<{ type: ArabicLabActivity['type'] }> = ({ type }) =>
  type === 'stroke_trace' ? (
    <PenLine className="w-3.5 h-3.5" />
  ) : (
    <Sparkles className="w-3.5 h-3.5" />
  );
