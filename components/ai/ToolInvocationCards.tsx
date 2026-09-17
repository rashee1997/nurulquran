'use client';

import React, { useState } from 'react';
import { Volume2, BookOpen, CheckCircle2, FileText, HelpCircle } from 'lucide-react';

export interface ToolInvocationProps {
  toolName: string;
  args: Record<string, unknown>;
  result?: Record<string, unknown>;
  state: 'partial-call' | 'call' | 'result';
}

export const VerseCard: React.FC<{ result: Record<string, unknown> }> = ({ result }) => {
  const [isPlaying, setIsPlaying] = useState(false);

  const playAudio = () => {
    if (result.audioUrl) {
      const audio = new Audio(result.audioUrl as string);
      setIsPlaying(true);
      audio.play().finally(() => setIsPlaying(false));
    }
  };

  return (
    <div className="my-2.5 p-4 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 shadow-xs space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-600 text-white">
          Verified Quran Verse • {String(result.surahName)} {String(result.surah)}:{String(result.ayah)}
        </span>
        {Boolean(result.audioUrl) && (
          <button
            onClick={playAudio}
            className="flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 bg-emerald-100/60 dark:bg-emerald-900/50 px-2 py-1 rounded-lg transition-colors"
          >
            <Volume2 className={`w-3.5 h-3.5 ${isPlaying ? 'animate-pulse' : ''}`} />
            <span>Recite</span>
          </button>
        )}
      </div>

      <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-emerald-100 dark:border-emerald-900/40 text-right dir-rtl" dir="rtl">
        <p className="font-arabic text-2xl text-slate-900 dark:text-slate-100 select-text leading-loose">
          {String(result.textUthmani)}
        </p>
      </div>

      <div className="space-y-1 text-xs text-left">
        {Boolean(result.translationEn) && (
          <p className="text-slate-700 dark:text-slate-300">
            <span className="font-bold text-slate-400 mr-1.5 uppercase">EN:</span>
            {String(result.translationEn)}
          </p>
        )}
        {Boolean(result.translationTa) && (
          <p className="text-emerald-800 dark:text-emerald-200 font-tamil">
            <span className="font-bold text-emerald-600 mr-1.5">தமிழ்:</span>
            {String(result.translationTa)}
          </p>
        )}
      </div>
    </div>
  );
};

export const WordAnalysisCard: React.FC<{ result: Record<string, unknown> }> = ({ result }) => {
  return (
    <div className="my-2.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 shadow-xs space-y-2">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-1.5">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
          <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
          Morphological Analysis
        </span>
        <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
          Root: {String(result.root)}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <span className="font-arabic text-2xl text-slate-900 dark:text-slate-100">
          {String(result.arabic)}
        </span>
        <span className="text-xs text-slate-500 font-medium">
          {String(result.transliteration)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-200 dark:border-slate-700">
        <div>
          <span className="text-[10px] text-slate-400 uppercase font-semibold block">English</span>
          <span className="font-medium text-slate-800 dark:text-slate-200">{String(result.translationEn)}</span>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 uppercase font-semibold block font-tamil">தமிழ்</span>
          <span className="font-medium text-emerald-700 dark:text-emerald-300 font-tamil">{String(result.translationTa)}</span>
        </div>
      </div>
    </div>
  );
};

export const ToolInvocationBadge: React.FC<ToolInvocationProps> = ({ toolName, state, result }) => {
  if (state !== 'result' || !result) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-mono my-1 border border-slate-200 dark:border-slate-700 animate-pulse">
        <FileText className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
        <span>Executing {toolName}...</span>
      </div>
    );
  }

  if (toolName === 'getVerse') {
    return <VerseCard result={result} />;
  }

  if (toolName === 'getWordDetails') {
    return <WordAnalysisCard result={result} />;
  }

  return (
    <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 my-1 font-mono">
      <span className="font-semibold text-emerald-600">✓ {toolName}: </span>
      <span>Completed verified retrieval</span>
    </div>
  );
};
