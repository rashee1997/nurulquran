'use client';

import React from 'react';
import { Volume2 } from 'lucide-react';
import type { ModeStageProps } from './types';
import { verseKeyOf } from './types';

interface ChoiceListProps {
  options: readonly string[];
  correct: string;
  selectedChoice: string | null;
  isAnswerChecked: boolean;
  isCorrect: boolean;
  onChoose: (option: string) => void;
}

/** Arabic multiple-choice list shared by modes B, E and F. */
const ChoiceList: React.FC<ChoiceListProps> = ({ options, correct, selectedChoice, isAnswerChecked, isCorrect, onChoose }) => (
  <div className="space-y-2.5">
    {options.map((option, index) => (
      <button
        key={index}
        type="button"
        disabled={isAnswerChecked}
        onClick={() => onChoose(option)}
        className={`w-full p-4 rounded-xl border text-right font-arabic text-xl dir-rtl transition-all ${
          isAnswerChecked && option === correct
            ? 'bg-success-subtle text-success-strong border-success/40'
            : selectedChoice === option && !isCorrect
              ? 'bg-danger-subtle text-danger-strong border-danger/40'
              : 'bg-surface border border-border hover:border-primary text-foreground'
        }`}
        dir="rtl"
        lang="ar"
      >
        {option}
      </button>
    ))}
  </div>
);

const Header: React.FC<{ tag: string; title: string; description: string }> = ({ tag, title, description }) => (
  <div className="text-center space-y-1">
    <span className="text-xs font-bold text-primary uppercase tracking-wider">{tag}</span>
    <h3 className="text-lg font-bold text-foreground">{title}</h3>
    <p className="text-xs text-muted-foreground">{description}</p>
  </div>
);

/** Mode B: the first half is shown; pick the continuation. */
export const CompleteVerseMode: React.FC<ModeStageProps> = (props) => {
  const { verse } = props;
  const half = Math.max(2, Math.floor(verse.words.length / 2));
  return (
    <div className="space-y-6">
      <Header tag="Mode B • Continuation" title="Complete the Verse" description="Read the starting words and choose the correct continuation." />
      <div className="py-6 px-4 bg-surface rounded-2xl border border-border text-center dir-rtl" dir="rtl" lang="ar">
        <p className="font-arabic text-3xl text-primary-strong">
          {verse.words.slice(0, half).map((w) => w.arabic).join(' ')} ... ؟
        </p>
      </div>
      <ChoiceList
        options={props.choiceOptions}
        correct={verse.textUthmani}
        selectedChoice={props.selectedChoice}
        isAnswerChecked={props.isAnswerChecked}
        isCorrect={props.isCorrect}
        onChoose={props.handleCheckMultipleChoice}
      />
    </div>
  );
};

/** Mode E: hear the recitation, pick the ayah. */
export const AudioToAyahMode: React.FC<ModeStageProps> = (props) => {
  const { verse } = props;
  return (
    <div className="space-y-6">
      <Header tag="Mode E • Auditory Recognition" title="Audio to Ayah Match" description="Play the clip and choose which ayah was recited." />
      <div className="text-center py-4">
        <button
          type="button"
          onClick={() => void props.playAudio(verse.audioUrl, verse.textUthmani, verseKeyOf(verse))}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-md active:scale-95 transition-all"
        >
          <Volume2 className="w-5 h-5" />
          <span>Play Mystery Recitation</span>
        </button>
      </div>
      <ChoiceList
        options={props.choiceOptions}
        correct={verse.textUthmani}
        selectedChoice={props.selectedChoice}
        isAnswerChecked={props.isAnswerChecked}
        isCorrect={props.isCorrect}
        onChoose={props.handleCheckMultipleChoice}
      />
    </div>
  );
};

/** Mode F: read the meanings, pick the Arabic. */
export const MeaningToAyahMode: React.FC<ModeStageProps> = (props) => {
  const { verse } = props;
  return (
    <div className="space-y-6">
      <Header tag="Mode F • Meaning match" title="Meaning to Ayah Match" description="Read the English & Tamil translations, then match with the Arabic text." />
      <div className="p-6 bg-surface rounded-2xl border border-border space-y-2 text-center">
        <p className="text-sm font-medium text-foreground">&ldquo;{verse.translationEn}&rdquo;</p>
        {verse.translationTa && (
          <p className="text-xs text-primary-strong font-tamil" lang="ta">
            &ldquo;{verse.translationTa}&rdquo;
          </p>
        )}
      </div>
      <ChoiceList
        options={props.choiceOptions}
        correct={verse.textUthmani}
        selectedChoice={props.selectedChoice}
        isAnswerChecked={props.isAnswerChecked}
        isCorrect={props.isCorrect}
        onChoose={props.handleCheckMultipleChoice}
      />
    </div>
  );
};
