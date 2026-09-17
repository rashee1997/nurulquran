import React from 'react';
import Link from 'next/link';
import { BookOpen, Compass, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto my-16 p-8 rounded-3xl bg-card border border-border text-center space-y-4 shadow-lg">
      <Compass className="w-9 h-9 mx-auto text-secondary" aria-hidden="true" />

      <div className="space-y-1.5">
        <h1 className="text-xl font-bold text-foreground">This page does not exist</h1>
        <p className="text-sm text-muted-foreground">
          The link may be out of date. The Quran has 114 surahs and the reader is always available.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        <Link
          href="/quran"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-md active:scale-95 transition-all"
        >
          <BookOpen className="w-4 h-4" aria-hidden="true" />
          <span>Open the reader</span>
        </Link>

        <Link
          href="/"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-surface border border-border hover:bg-surface-hover text-foreground text-xs font-bold transition-colors"
        >
          <Home className="w-4 h-4" aria-hidden="true" />
          <span>Back home</span>
        </Link>
      </div>
    </div>
  );
}
