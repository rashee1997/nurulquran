'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, BookOpen, RotateCcw } from 'lucide-react';

interface TafsirLessonErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Lesson-scoped error boundary.
 *
 * The provider throws rather than substituting text when the verified verse cannot be
 * resolved, so this panel deliberately shows no scripture at all: rendering a lesson around a
 * missing or substituted ayah would misrepresent the Quran. The learner gets a retry and a way
 * back to the lesson index instead of a dead end.
 */
export default function TafsirLessonError({ error, reset }: TafsirLessonErrorProps) {
  useEffect(() => {
    console.error('Tafseer lesson failed to load:', error);
  }, [error]);

  return (
    <div className="max-w-xl mx-auto my-16 p-8 rounded-3xl bg-card border border-border text-center space-y-4 shadow-lg">
      <AlertTriangle className="w-9 h-9 mx-auto text-warning" aria-hidden="true" />

      <div className="space-y-1.5">
        <h1 className="text-xl font-bold text-foreground">This lesson could not be loaded</h1>
        <p className="text-sm text-muted-foreground">
          The verified verse text did not arrive. No text is displayed, because a partial or
          substituted ayah would misrepresent the Quran.
        </p>
      </div>

      {error.digest && (
        <p className="text-[11px] font-mono text-muted-foreground">Reference: {error.digest}</p>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        <button
          type="button"
          onClick={reset}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-md active:scale-95 transition-all"
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
          <span>Retry</span>
        </button>

        <Link
          href="/lessons/tafsir"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-surface border border-border hover:bg-surface-hover text-foreground text-xs font-bold transition-colors"
        >
          <BookOpen className="w-4 h-4" aria-hidden="true" />
          <span>Choose another lesson</span>
        </Link>
      </div>
    </div>
  );
}
