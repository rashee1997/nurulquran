'use client';

import React, { useState } from 'react';
import { 
  MutashabihEntry, 
  computeTokenDiff 
} from '@/lib/quran/mutashabihat';
import { 
  X, 
  Volume2, 
  Bookmark, 
  Check, 
  Sparkles, 
  ArrowRightLeft, 
  Info,
  ExternalLink 
} from 'lucide-react';
import Link from 'next/link';
import { db } from '@/lib/db';
import { initializeVerseProgress } from '@/lib/learning/srs-engine';

interface MutashabihatModalProps {
  entry: MutashabihEntry;
  onClose: () => void;
  onSelectVerse?: (surah: number, ayah: number) => void;
}

export const MutashabihatModal: React.FC<MutashabihatModalProps> = ({
  entry,
  onClose,
  onSelectVerse,
}) => {
  const [activeAudioIndex, setActiveAudioIndex] = useState<number | null>(null);
  const [savedStatus, setSavedStatus] = useState<Record<string, boolean>>({});

  const verse1 = entry.pair[0];
  const verse2 = entry.pair[1];

  const diff = computeTokenDiff(verse1.textUthmani, verse2.textUthmani);

  const playVerseAudio = (text: string, idx: number) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setActiveAudioIndex(idx);
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ar-SA';
      u.rate = 0.85;
      u.onend = () => setActiveAudioIndex(null);
      u.onerror = () => setActiveAudioIndex(null);
      window.speechSynthesis.speak(u);
    }
  };

  const handleSaveToHifz = async (surah: number, ayah: number, key: string) => {
    try {
      const vKey = `${surah}:${ayah}`;
      const existing = await db.verseProgress.get(vKey);
      if (!existing) {
        const init = initializeVerseProgress(surah, ayah);
        init.state = 'weak'; // Mark as weak/needs focus due to Mutashabihat challenge
        await db.verseProgress.put(init);
      }
      setSavedStatus((prev) => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setSavedStatus((prev) => ({ ...prev, [key]: false }));
      }, 2500);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div
      id="mutashabihat-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto"
      onClick={onClose}
    >
      <div
        id="mutashabihat-modal-content"
        className="bg-card border border-border rounded-3xl p-5 sm:p-7 w-full max-w-3xl shadow-2xl space-y-6 my-auto max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary-subtle text-secondary-strong font-bold text-xs">
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>Mutashabihat Comparison</span>
              </span>
              <span className="text-xs text-muted-foreground font-medium">
                {entry.category}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-foreground">
              {entry.topicTitleEn}
            </h2>
            <p className="text-xs text-secondary-strong font-tamil font-semibold">
              {entry.topicTitleTa}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors shrink-0"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Memory Rule / Dawabit Callout */}
        <div className="p-4 rounded-2xl bg-secondary-subtle/60 border border-secondary/30 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-secondary-strong">
            <Sparkles className="w-4 h-4 text-secondary" />
            <span>Mnemonic Rule &amp; Distinction Guide (ضوابط المتشابهات)</span>
          </div>
          <p className="text-xs text-foreground leading-relaxed">
            {entry.mnemonicEn}
          </p>
          <p className="text-xs text-secondary-strong font-tamil leading-relaxed">
            {entry.mnemonicTa}
          </p>
        </div>

        {/* Side-by-Side Verse Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Verse A */}
          <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-border space-y-3 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-primary-subtle text-primary-strong">
                  {verse1.surahName} • {verse1.surah}:{verse1.ayah}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => playVerseAudio(verse1.textUthmani, 0)}
                    className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                      activeAudioIndex === 0
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
                    }`}
                    title="Listen to Verse"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleSaveToHifz(verse1.surah, verse1.ayah, 'v1')}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-surface-hover transition-colors"
                    title="Add to Hifz Focus Queue"
                  >
                    {savedStatus['v1'] ? <Check className="w-4 h-4 text-primary" /> : <Bookmark className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Arabic with Diff Highlighting */}
              <div className="text-right py-2 leading-loose dir-rtl" dir="rtl">
                <div
                  className="font-arabic text-xl sm:text-2xl flex flex-wrap gap-1.5 justify-start flex-row-reverse"
                  lang="ar"
                  dir="rtl"
                >
                  {diff.tokensA.map((tok, i) => (
                    <span
                      key={i}
                      className={`px-1 py-0.5 rounded transition-colors ${
                        tok.type === 'modified'
                          ? 'bg-secondary-subtle text-secondary-strong font-bold underline decoration-secondary decoration-2'
                          : 'text-foreground'
                      }`}
                    >
                      {tok.text}
                    </span>
                  ))}
                  <span className="text-primary text-sm font-sans mx-1 inline-block">
                    ۝{verse1.ayah}
                  </span>
                </div>
              </div>

              {/* Translation */}
              <div className="pt-2 border-t border-border space-y-1 text-xs">
                <p className="text-foreground leading-relaxed">
                  <span className="font-bold text-muted-foreground mr-1 uppercase">EN:</span>
                  {verse1.translationEn}
                </p>
                {verse1.translationTa && (
                  <p className="text-primary-strong font-tamil leading-relaxed">
                    <span className="font-bold text-primary mr-1">தமிழ்:</span>
                    {verse1.translationTa}
                  </p>
                )}
              </div>
            </div>

            <div className="pt-3">
              <Link
                href={`/quran/${verse1.surah}`}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-surface-muted hover:bg-surface-hover text-foreground text-xs font-semibold transition-colors border border-border"
              >
                <span>Read in Surah {verse1.surahName}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Verse B */}
          <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-border space-y-3 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-secondary-subtle text-secondary-strong">
                  {verse2.surahName} • {verse2.surah}:{verse2.ayah}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => playVerseAudio(verse2.textUthmani, 1)}
                    className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                      activeAudioIndex === 1
                        ? 'bg-secondary text-secondary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
                    }`}
                    title="Listen to Verse"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleSaveToHifz(verse2.surah, verse2.ayah, 'v2')}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-secondary hover:bg-surface-hover transition-colors"
                    title="Add to Hifz Focus Queue"
                  >
                    {savedStatus['v2'] ? <Check className="w-4 h-4 text-secondary" /> : <Bookmark className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Arabic with Diff Highlighting */}
              <div className="text-right py-2 leading-loose dir-rtl" dir="rtl">
                <div
                  className="font-arabic text-xl sm:text-2xl flex flex-wrap gap-1.5 justify-start flex-row-reverse"
                  lang="ar"
                  dir="rtl"
                >
                  {diff.tokensB.map((tok, i) => (
                    <span
                      key={i}
                      className={`px-1 py-0.5 rounded transition-colors ${
                        tok.type === 'added'
                          ? 'bg-primary-subtle text-primary-strong font-bold underline decoration-primary decoration-2'
                          : 'text-foreground'
                      }`}
                    >
                      {tok.text}
                    </span>
                  ))}
                  <span className="text-secondary text-sm font-sans mx-1 inline-block">
                    ۝{verse2.ayah}
                  </span>
                </div>
              </div>

              {/* Translation */}
              <div className="pt-2 border-t border-border space-y-1 text-xs">
                <p className="text-foreground leading-relaxed">
                  <span className="font-bold text-muted-foreground mr-1 uppercase">EN:</span>
                  {verse2.translationEn}
                </p>
                {verse2.translationTa && (
                  <p className="text-primary-strong font-tamil leading-relaxed">
                    <span className="font-bold text-primary mr-1">தமிழ்:</span>
                    {verse2.translationTa}
                  </p>
                )}
              </div>
            </div>

            <div className="pt-3">
              <Link
                href={`/quran/${verse2.surah}`}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-surface-muted hover:bg-surface-hover text-foreground text-xs font-semibold transition-colors border border-border"
              >
                <span>Read in Surah {verse2.surahName}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Footer info note */}
        <div className="pt-2 flex items-center justify-between text-xs text-muted-foreground border-t border-border">
          <span className="flex items-center gap-1">
            <Info className="w-3.5 h-3.5" />
            Highlighted words underline the critical variation between both passages.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-xs transition-colors shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
