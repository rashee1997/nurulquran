import type { Verse } from '@/lib/quran/types';

export type HifzModeKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J';

export const HIFZ_MODE_KEYS: readonly HifzModeKey[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

export function isHifzModeKey(value: string | null | undefined): value is HifzModeKey {
  return value !== null && value !== undefined && (HIFZ_MODE_KEYS as readonly string[]).includes(value);
}

export interface HifzModeMeta {
  id: HifzModeKey;
  name: string;
  icon: string;
  desc: string;
}

export const HIFZ_MODES: readonly HifzModeMeta[] = [
  { id: 'A', name: 'Listen & Repeat', icon: '🎧', desc: 'Loop the ayah with audio' },
  { id: 'B', name: 'Complete Verse', icon: '✍️', desc: 'Fill the prompt gap' },
  { id: 'C', name: 'Word Reordering', icon: '🧩', desc: 'Assemble words in order' },
  { id: 'D', name: 'First Word Prompt', icon: '💡', desc: 'Recall from the first word' },
  { id: 'E', name: 'Audio to Ayah', icon: '🔊', desc: 'Identify the verse from audio' },
  { id: 'F', name: 'Meaning to Ayah', icon: '🌐', desc: 'Match English and Tamil meanings' },
  { id: 'G', name: 'Missing Segment', icon: '🔍', desc: 'Fill in missing words' },
  { id: 'H', name: 'Recite Hidden', icon: '🎙️', desc: 'Recite from memory; mistakes are detected' },
  { id: 'I', name: 'Timed Speed Recall', icon: '⚡', desc: 'Recall within a time limit' },
  { id: 'J', name: 'Guided Session', icon: '📖', desc: 'Work through the verse with the assistant' },
];

/** Shared drill state, owned by the page and passed to every mode component. */
export interface ModeStageProps {
  verse: Verse;
  /** Every verse in the current set, for building distractors. */
  verses: readonly Verse[];
  choiceOptions: readonly string[];
  selectedChoice: string | null;
  isAnswerChecked: boolean;
  isCorrect: boolean;
  isRevealed: boolean;
  assembledIndices: readonly number[];
  timerSeconds: number;
  isTimerRunning: boolean;
  setSelectedChoice: (value: string | null) => void;
  setIsAnswerChecked: (value: boolean) => void;
  setIsCorrect: (value: boolean) => void;
  setIsRevealed: (value: boolean) => void;
  setAssembledIndices: (updater: (previous: number[]) => number[]) => void;
  setTimerSeconds: (value: number) => void;
  setTimerActive: (value: boolean) => void;
  playAudio: (url?: string, text?: string, verseKey?: string) => Promise<void>;
  awardXP: (amount: number) => Promise<void>;
  /** Grades the current verse on the 0–5 scale and advances. */
  handleSelfGrade: (quality: number) => Promise<void>;
  handleCheckMultipleChoice: (chosen: string) => void;
  openTutor: (prompt: string) => void;
}

export function verseKeyOf(verse: Verse): string {
  return `${verse.surah}:${verse.ayah}`;
}
