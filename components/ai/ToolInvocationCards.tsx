'use client';

import React from 'react';
import { Volume2, BookOpen, FileText } from 'lucide-react';
import { usePreviewAudio } from '@/hooks/use-preview-audio';

export interface ToolInvocationProps {
  toolName: string;
  args: Record<string, unknown>;
  result?: Record<string, unknown>;
  state: 'partial-call' | 'call' | 'result';
}

export const VerseCard: React.FC<{ result: Record<string, unknown> }> = ({ result }) => {
  const { playingKey, playUrl } = usePreviewAudio();
  const playbackKey = `verse-card:${String(result.surah)}:${String(result.ayah)}`;
  // The shared player is the source of truth, so the button state cannot drift and
  // the clip is released when the card unmounts.
  const isPlaying = playingKey === playbackKey;

  const playAudio = (): void => {
    const audioUrl = typeof result.audioUrl === 'string' ? result.audioUrl : undefined;
    if (!audioUrl) return;
    void playUrl(playbackKey, audioUrl);
  };

  return (
    <div className="my-2.5 p-4 rounded-2xl bg-primary-subtle border border-primary/20 shadow-xs space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-primary text-primary-foreground">
          Verified Quran Verse • {String(result.surahName)} {String(result.surah)}:{String(result.ayah)}
        </span>
        {Boolean(result.audioUrl) && (
          <button
            onClick={playAudio}
            className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-strong bg-primary/10 hover:bg-primary/20 px-2 py-1 rounded-lg transition-colors"
          >
            <Volume2 className={`w-3.5 h-3.5 ${isPlaying ? 'animate-pulse' : ''}`} />
            <span>Recite</span>
          </button>
        )}
      </div>

      <div className="p-3 bg-card rounded-xl border border-primary/20 text-right dir-rtl" dir="rtl">
        <p className="font-arabic text-2xl text-foreground select-text leading-loose">
          {String(result.textUthmani)}
        </p>
      </div>

      <div className="space-y-1 text-xs text-left">
        {Boolean(result.translationEn) && (
          <p className="text-foreground">
            <span className="font-bold text-muted-foreground mr-1.5 uppercase">EN:</span>
            {String(result.translationEn)}
          </p>
        )}
        {Boolean(result.translationTa) && (
          <p className="text-primary-strong font-tamil">
            <span className="font-bold text-primary mr-1.5">தமிழ்:</span>
            {String(result.translationTa)}
          </p>
        )}
      </div>
    </div>
  );
};

export const WordAnalysisCard: React.FC<{ result: Record<string, unknown> }> = ({ result }) => {
  return (
    <div className="my-2.5 p-3.5 rounded-2xl bg-surface border border-border shadow-xs space-y-2">
      <div className="flex items-center justify-between border-b border-border pb-1.5">
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <BookOpen className="w-3.5 h-3.5 text-primary" />
          Morphological Analysis
        </span>
        <span className="text-xs font-mono font-bold text-primary">
          Root: {String(result.root)}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <span className="font-arabic text-2xl text-foreground">
          {String(result.arabic)}
        </span>
        <span className="text-xs text-muted-foreground font-medium">
          {String(result.transliteration)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border">
        <div>
          <span className="text-[10px] text-muted-foreground uppercase font-semibold block">English</span>
          <span className="font-medium text-foreground">{String(result.translationEn)}</span>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground uppercase font-semibold block font-tamil">தமிழ்</span>
          <span className="font-medium text-primary-strong font-tamil">{String(result.translationTa)}</span>
        </div>
      </div>
    </div>
  );
};

export const ToolInvocationBadge: React.FC<ToolInvocationProps> = ({ toolName, state, result }) => {
  if (state !== 'result' || !result) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface text-muted-foreground text-xs font-mono my-1 border border-border animate-pulse">
        <FileText className="w-3.5 h-3.5 text-primary animate-spin" />
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
    <div className="p-2.5 rounded-xl bg-surface border border-border text-xs text-muted-foreground my-1 font-mono">
      <span className="font-semibold text-primary">✓ {toolName}: </span>
      <span>Completed verified retrieval</span>
    </div>
  );
};
