'use client';

import React, { useState, useMemo } from 'react';
import { Verse, Chapter } from '@/lib/quran/types';
import { 
  Eye, 
  EyeOff, 
  ChevronLeft, 
  ChevronRight, 
  Volume2, 
  RotateCcw, 
  Layers, 
  Sparkles,
  Bookmark
} from 'lucide-react';
import { TajweedSpan } from './TajweedSpan';
import { db } from '@/lib/db';
import { initializeVerseProgress } from '@/lib/learning/srs-engine';

interface MushafPageViewProps {
  chapter: Chapter;
  verses: Verse[];
  fontSize?: number;
  showTajweedColors?: boolean;
  onSelectVerse?: (verse: Verse) => void;
  onOpenAiTutor?: (prompt: string) => void;
}

export const MushafPageView: React.FC<MushafPageViewProps> = ({
  chapter,
  verses,
  fontSize = 24,
  showTajweedColors = true,
  onSelectVerse,
  onOpenAiTutor,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [maskMode, setMaskMode] = useState<'none' | 'all' | 'alternate' | 'random'>('none');
  const [unmaskedLines, setUnmaskedLines] = useState<Record<number, boolean>>({});
  const [activeLineAudio, setActiveLineAudio] = useState<number | null>(null);

  // Divide chapter verses into simulated 15-line pages.
  // Standard 15-line page holds roughly 8 to 15 verses depending on length.
  // We compute realistic line-wrapped segments of 15 lines per page.
  const pages = useMemo(() => {
    const linesPerPage = 15;
    // Flatten verses into words and assemble lines approximately 6-10 words per line
    const allWordsWithVerse: { text: string; verse: Verse; isAyahEnd: boolean }[] = [];

    verses.forEach((v) => {
      const words = v.textUthmani.trim().split(/\s+/);
      words.forEach((w, idx) => {
        allWordsWithVerse.push({
          text: w,
          verse: v,
          isAyahEnd: idx === words.length - 1,
        });
      });
    });

    const wordsPerLine = 7;
    const allLines: { id: number; tokens: { text: string; verse: Verse; isAyahEnd: boolean }[] }[] = [];
    for (let i = 0; i < allWordsWithVerse.length; i += wordsPerLine) {
      allLines.push({
        id: allLines.length + 1,
        tokens: allWordsWithVerse.slice(i, i + wordsPerLine),
      });
    }

    // Chunk into pages of 15 lines
    const generatedPages: { pageNumber: number; lines: typeof allLines }[] = [];
    for (let p = 0; p < allLines.length; p += linesPerPage) {
      generatedPages.push({
        pageNumber: generatedPages.length + 1,
        lines: allLines.slice(p, p + linesPerPage),
      });
    }

    return generatedPages.length > 0 ? generatedPages : [{ pageNumber: 1, lines: [] }];
  }, [verses]);

  const activePageData = pages[currentPage - 1] || pages[0];

  const toggleLineMask = (lineIdx: number) => {
    setUnmaskedLines((prev) => ({
      ...prev,
      [lineIdx]: !prev[lineIdx],
    }));
  };

  const isLineMasked = (lineIdx: number) => {
    if (unmaskedLines[lineIdx]) return false; // explicitly revealed
    if (maskMode === 'none') return false;
    if (maskMode === 'all') return true;
    if (maskMode === 'alternate') return lineIdx % 2 === 1;
    if (maskMode === 'random') return (lineIdx * 7) % 3 === 0;
    return false;
  };

  const playLineAudio = (lineTokens: { text: string; verse: Verse }[], lineIdx: number) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setActiveLineAudio(lineIdx);
      const textToRecite = lineTokens.map((t) => t.text).join(' ');
      const u = new SpeechSynthesisUtterance(textToRecite);
      u.lang = 'ar-SA';
      u.rate = 0.85;
      u.onend = () => setActiveLineAudio(null);
      u.onerror = () => setActiveLineAudio(null);
      window.speechSynthesis.speak(u);
    }
  };

  return (
    <div id="mushaf-15-line-view" className="space-y-6 max-w-4xl mx-auto">
      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-card border border-border shadow-xs">
        {/* Page selector */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setCurrentPage((p) => Math.max(1, p - 1));
              setUnmaskedLines({});
            }}
            disabled={currentPage <= 1}
            className="p-2 rounded-xl bg-surface border border-border text-foreground hover:bg-surface-hover disabled:opacity-40 disabled:pointer-events-none transition-colors"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="text-xs font-bold text-foreground px-3 py-1 rounded-lg bg-surface-muted">
            Page {currentPage} of {pages.length}
          </span>

          <button
            onClick={() => {
              setCurrentPage((p) => Math.min(pages.length, p + 1));
              setUnmaskedLines({});
            }}
            disabled={currentPage >= pages.length}
            className="p-2 rounded-xl bg-surface border border-border text-foreground hover:bg-surface-hover disabled:opacity-40 disabled:pointer-events-none transition-colors"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Masking Drills Toolbar */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground font-semibold flex items-center gap-1 mr-1">
            <Layers className="w-3.5 h-3.5" />
            <span>Memory Masking:</span>
          </span>

          <button
            onClick={() => {
              setMaskMode('none');
              setUnmaskedLines({});
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
              maskMode === 'none'
                ? 'bg-primary text-primary-foreground'
                : 'bg-surface hover:bg-surface-hover text-muted-foreground border border-border'
            }`}
          >
            Show All
          </button>

          <button
            onClick={() => {
              setMaskMode('alternate');
              setUnmaskedLines({});
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
              maskMode === 'alternate'
                ? 'bg-secondary text-secondary-foreground'
                : 'bg-surface hover:bg-surface-hover text-muted-foreground border border-border'
            }`}
          >
            Alternate Lines
          </button>

          <button
            onClick={() => {
              setMaskMode('all');
              setUnmaskedLines({});
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
              maskMode === 'all'
                ? 'bg-danger text-danger-foreground'
                : 'bg-surface hover:bg-surface-hover text-muted-foreground border border-border'
            }`}
          >
            Mask Entire Page
          </button>
        </div>
      </div>

      {/* 15-Line Mushaf Page Canvas */}
      <div className="relative p-6 sm:p-10 rounded-3xl bg-[#fbf9f4] dark:bg-[#1c1d19] border-2 border-[#e6decb] dark:border-[#383a32] shadow-2xl space-y-2 select-text font-arabic">
        {/* Ornamental Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-[#e0d6c0] dark:border-[#33352c] text-xs font-sans text-muted-foreground">
          <span className="font-bold text-foreground">
            Surah {chapter.nameSimple} ({chapter.id})
          </span>
          <span className="font-arabic text-sm text-primary font-bold">
            الجزء {Math.ceil(chapter.id / 4)}
          </span>
          <span className="font-bold text-foreground">
            Page {currentPage}
          </span>
        </div>

        {/* 15 Lines Grid */}
        <div className="space-y-1.5 pt-2">
          {activePageData.lines.map((line, lIdx) => {
            const masked = isLineMasked(lIdx);
            return (
              <div
                key={line.id}
                className={`group relative flex items-center justify-between py-1.5 px-3 rounded-xl transition-all duration-200 ${
                  masked
                    ? 'bg-black/5 dark:bg-white/5 border border-dashed border-border cursor-pointer hover:bg-primary-subtle/40'
                    : 'hover:bg-primary-subtle/20'
                }`}
                onClick={() => masked && toggleLineMask(lIdx)}
              >
                {/* Line number pill */}
                <span className="text-[10px] font-sans font-bold text-muted-foreground/60 w-5 select-none">
                  {lIdx + 1}
                </span>

                {/* Line Content */}
                <div className="flex-1 text-center dir-rtl" dir="rtl">
                  {masked ? (
                    <div className="flex items-center justify-center gap-2 py-1 text-xs text-muted-foreground font-sans select-none">
                      <EyeOff className="w-3.5 h-3.5 text-secondary" />
                      <span>Tap to reveal line {lIdx + 1}</span>
                    </div>
                  ) : (
                    <div
                      className="leading-loose flex flex-wrap items-center justify-center gap-x-2"
                      style={{ fontSize: `${fontSize}px` }}
                    >
                      {line.tokens.map((token, tIdx) => (
                        <span
                          key={tIdx}
                          className="hover:text-primary transition-colors cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectVerse) onSelectVerse(token.verse);
                          }}
                        >
                          {token.text}
                          {token.isAyahEnd && (
                            <span className="text-primary text-xs font-sans mx-1.5 select-none inline-block align-middle font-bold px-1.5 py-0.5 rounded-full bg-primary-subtle">
                              ۝{token.verse.ayah}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Line Audio Play Button */}
                <div className="w-6 flex items-center justify-end">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      playLineAudio(line.tokens, lIdx);
                    }}
                    className={`p-1 rounded-lg transition-colors opacity-0 group-hover:opacity-100 ${
                      activeLineAudio === lIdx
                        ? 'opacity-100 bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    title="Listen to Line"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Ornamental Bottom Footer */}
        <div className="pt-4 border-t-2 border-[#e0d6c0] dark:border-[#33352c] flex items-center justify-between text-xs font-sans text-muted-foreground">
          <span className="text-[11px]">
            15-Line Madinah Mushaf Spatial Emulation
          </span>
          <span className="font-bold text-foreground">
            {chapter.nameArabic}
          </span>
        </div>
      </div>
    </div>
  );
};
