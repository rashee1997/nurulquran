'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, CheckCircle2, MapPin } from 'lucide-react';
import { db } from '@/lib/db';

interface TafsirNavigatorProps {
  surah: number;
  ayah: number;
  versesCount: number;
  surahNameSimple: string;
}

/**
 * Sequential lesson traversal.
 *
 * Progress is read straight from IndexedDB with `useLiveQuery`, so the visited count and the
 * tick marks update the moment a lesson records itself — no prop threading and no refetch.
 *
 * Navigation goes through `router.push` rather than a `Link` for the arrow-key path so that
 * keyboard traversal and the buttons share one code path.
 */
export const TafsirNavigator: React.FC<TafsirNavigatorProps> = ({
  surah,
  ayah,
  versesCount,
  surahNameSimple,
}) => {
  const router = useRouter();

  const visited = useLiveQuery(
    async () => {
      const rows = await db.tafsirProgress.where('surah').equals(surah).toArray();
      return new Set(rows.filter((row) => row.state !== 'visited').map((row) => row.ayah));
    },
    [surah]
  );

  const visitedCount = visited?.size ?? 0;
  const progressPercent = versesCount > 0 ? Math.round((visitedCount / versesCount) * 100) : 0;

  const hasPrevious = ayah > 1;
  const hasNext = ayah < versesCount;

  const go = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowRight' && hasNext) {
      router.push(`/lessons/tafsir/${surah}/${ayah + 1}`);
    } else if (event.key === 'ArrowLeft' && hasPrevious) {
      router.push(`/lessons/tafsir/${surah}/${ayah - 1}`);
    }
  };

  return (
    // Arrow keys work whenever one of the controls inside the navigator has focus, which is
    // what keyboard traversal needs.
    <nav
      aria-label="Lesson navigation"
      onKeyDown={go}
      className="rounded-2xl border border-border bg-card p-4 space-y-3"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />
          <p className="text-xs font-semibold text-foreground truncate">
            {surahNameSimple} · ayah {ayah} of {versesCount}
          </p>
        </div>
        <span className="text-[11px] font-semibold text-muted-foreground shrink-0">
          {visitedCount} reflected
        </span>
      </div>

      <div
        className="h-1.5 rounded-full bg-surface-muted overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPercent}
        aria-label="Lesson progress in this surah"
      >
        <div
          className="h-full bg-primary transition-[width] duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={!hasPrevious}
          onClick={() => router.push(`/lessons/tafsir/${surah}/${ayah - 1}`)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface border border-border hover:bg-surface-hover text-foreground text-xs font-bold transition-colors disabled:opacity-35 disabled:pointer-events-none"
        >
          <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Previous ayah</span>
        </button>

        <Link
          href="/lessons/tafsir"
          className="hidden sm:inline text-[11px] font-semibold text-muted-foreground hover:text-primary transition-colors"
        >
          All lessons
        </Link>

        {hasNext ? (
          <button
            type="button"
            onClick={() => router.push(`/lessons/tafsir/${surah}/${ayah + 1}`)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold transition-opacity hover:opacity-90"
          >
            <span>Next ayah</span>
            <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        ) : surah < 114 ? (
          <Link
            href={`/lessons/tafsir/${surah + 1}/1`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-secondary text-secondary-foreground text-xs font-bold transition-opacity hover:opacity-90"
          >
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Next surah</span>
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-success-strong">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Last ayah</span>
          </span>
        )}
      </div>
    </nav>
  );
};
