'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { SURAHS } from '@/lib/quran/surahs';
import { Search, BookOpen, Volume2, ArrowRight } from 'lucide-react';

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
      <div className="bg-linear-to-r from-emerald-950 via-emerald-900 to-teal-950 rounded-3xl p-6 sm:p-8 text-white space-y-3 shadow-lg">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-800/60 text-emerald-200 text-xs font-semibold">
          <BookOpen className="w-3.5 h-3.5" />
          <span>The Holy Quran • 114 Chapters</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          Surah Index & Interactive Reader
        </h1>
        <p className="text-emerald-200/90 text-xs sm:text-sm max-w-2xl">
          Explore complete Uthmani text, verified Saheeh International English translation, and John Trust Foundation Tamil translation with audio recitation.
        </p>

        {/* Search & Filter Bar */}
        <div className="pt-3 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-emerald-300 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Surah name, number (e.g. 1, Al-Fatihah, الفاتحة)..."
              className="w-full bg-white/10 dark:bg-slate-900/60 border border-white/20 text-white placeholder:text-emerald-200/60 text-xs pl-10 pr-4 py-3 rounded-2xl outline-hidden focus:ring-2 focus:ring-amber-300 backdrop-blur-md"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-white/10 p-1.5 rounded-2xl border border-white/20 text-xs shrink-0">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-xl font-semibold transition-colors ${
                filterType === 'all'
                  ? 'bg-amber-400 text-emerald-950'
                  : 'text-white hover:bg-white/10'
              }`}
            >
              All (114)
            </button>
            <button
              onClick={() => setFilterType('makkah')}
              className={`px-3 py-1.5 rounded-xl font-semibold transition-colors ${
                filterType === 'makkah'
                  ? 'bg-amber-400 text-emerald-950'
                  : 'text-white hover:bg-white/10'
              }`}
            >
              Makki
            </button>
            <button
              onClick={() => setFilterType('madinah')}
              className={`px-3 py-1.5 rounded-xl font-semibold transition-colors ${
                filterType === 'madinah'
                  ? 'bg-amber-400 text-emerald-950'
                  : 'text-white hover:bg-white/10'
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
            className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-600 transition-all hover:shadow-md flex items-center justify-between group"
          >
            <div className="flex items-center gap-3.5">
              <span className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 flex items-center justify-center font-bold text-xs group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                {surah.id}
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 transition-colors">
                  {surah.nameSimple}
                </h3>
                <p className="text-xs text-slate-400">
                  {surah.nameEnglish} • {surah.versesCount} Ayahs
                </p>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  {surah.revelationPlace === 'makkah' ? 'Makki' : 'Madani'}
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="font-arabic text-2xl text-emerald-800 dark:text-emerald-300 select-none">
                {surah.nameArabic}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {filteredSurahs.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No Surahs found matching &ldquo;{searchQuery}&rdquo;</p>
        </div>
      )}
    </div>
  );
}
