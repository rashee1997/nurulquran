'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { SURAHS } from '@/lib/quran/surahs';
import { Search, BookOpen } from 'lucide-react';

export default function QuranIndexPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'makkah' | 'madinah'>('all');

  const filteredSurahs = SURAHS.filter((s) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !query ||
      s.id.toString() === query ||
      s.nameSimple.toLowerCase().includes(query) ||
      s.nameEnglish.toLowerCase().includes(query) ||
      s.nameArabic.includes(query);

    const matchesFilter = filterType === 'all' || s.revelationPlace === filterType;

    return matchesSearch && matchesFilter;
  });

  return (
    <div id="surah-index-page" className="space-y-8 animate-in fade-in duration-300">
      {/* Header banner */}
      <div className="bg-card rounded-3xl p-6 sm:p-8 text-foreground border border-border space-y-3 shadow-xs">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-subtle text-primary text-xs font-semibold">
          <BookOpen className="w-3.5 h-3.5" />
          <span>The Holy Quran • 114 Chapters</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
          Surah Index & Interactive Reader
        </h1>
        <p className="text-muted-foreground text-xs sm:text-sm max-w-2xl">
          Explore the full Uthmani text with Saheeh International English and Tamil translations, plus audio recitation.
        </p>

        {/* Search & Filter Bar */}
        <div className="pt-3 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Surah name, number (e.g. 1, Al-Fatihah, الفاتحة)..."
              className="w-full bg-surface border border-border text-foreground placeholder:text-muted-foreground text-xs pl-10 pr-4 py-3 rounded-2xl outline-hidden focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-surface p-1.5 rounded-2xl border border-border text-xs shrink-0">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-xl font-semibold transition-colors ${
                filterType === 'all'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
              }`}
            >
              All (114)
            </button>
            <button
              onClick={() => setFilterType('makkah')}
              className={`px-3 py-1.5 rounded-xl font-semibold transition-colors ${
                filterType === 'makkah'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
              }`}
            >
              Makki
            </button>
            <button
              onClick={() => setFilterType('madinah')}
              className={`px-3 py-1.5 rounded-xl font-semibold transition-colors ${
                filterType === 'madinah'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
              }`}
            >
              Madani
            </button>
          </div>
        </div>
      </div>

      {/* Surahs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSurahs.map((surah) => (
          <Link
            key={surah.id}
            href={`/quran/${surah.id}`}
            className="p-5 rounded-2xl bg-card border border-border hover:border-primary transition-all hover:shadow-md flex items-center justify-between group"
          >
            <div className="flex items-center gap-3.5">
              <span className="w-10 h-10 rounded-xl bg-surface text-foreground flex items-center justify-center font-bold text-xs group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                {surah.id}
              </span>
              <div>
                <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                  {surah.nameSimple}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {surah.nameEnglish} • {surah.versesCount} Ayahs
                </p>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {surah.revelationPlace === 'makkah' ? 'Makki' : 'Madani'}
                </span>
              </div>
            </div>

            <div className="text-right">
              <span lang="ar" dir="rtl" className="font-arabic text-2xl text-primary select-none">
                {surah.nameArabic}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {filteredSurahs.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No Surahs found matching &ldquo;{searchQuery}&rdquo;</p>
        </div>
      )}
    </div>
  );
}
