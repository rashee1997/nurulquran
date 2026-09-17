'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '@/lib/db';
import { buildLessonSegment, type LessonVerse } from '@/lib/tafsir/lesson';
import { prefetchUpcomingAyahs } from '@/lib/tafsir/tafsirCache';
import { TafsirUnavailableError } from '@/lib/tafsir/tafsirClient';
import type { TafsirLessonError, TafsirLessonSegment, TafsirLoadState } from '@/lib/tafsir/types';

export interface UseTafsirLessonResult {
  segment: TafsirLessonSegment | null;
  /** Edition slugs that could not be reached, for a labelled notice rather than an empty box. */
  failedEditions: string[];
  state: TafsirLoadState;
  error: TafsirLessonError | null;
  /** Forces a network re-read, bypassing the cache. */
  reload: () => void;
}

/**
 * Loads one ayah's lesson: bilingual exegesis (cache-first), the optional occasion of
 * revelation, and the next two verses' worth of neighbour prefetch.
 *
 * Two behaviours worth stating:
 *
 *  - **The loader never blanks a lesson it already has.** Navigating to a neighbouring ayah
 *    of the same sūrah resolves from the in-memory chapter copy, so `segment` is replaced
 *    in a single commit instead of flickering through an empty state — which is what would
 *    otherwise produce a layout shift on every "next ayah" tap.
 *
 *  - **Progress is recorded for the ayah actually displayed**, only after the segment
 *    resolves. Recording on mount would mark verses the learner never reached when a load
 *    fails.
 */
export function useTafsirLesson(verse: LessonVerse): UseTafsirLessonResult {
  const [segment, setSegment] = useState<TafsirLessonSegment | null>(null);
  const [failedEditions, setFailedEditions] = useState<string[]>([]);
  const [state, setState] = useState<TafsirLoadState>('idle');
  const [error, setError] = useState<TafsirLessonError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  /**
   * Identifies the latest request.
   *
   * Ayah navigation can outrun a slow CDN response, and without this the older response
   * would land last and render the previous verse's commentary under the new Arabic text.
   */
  const requestIdRef = useRef(0);

  const { surah, ayah } = verse;

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    let cancelled = false;

    async function load(): Promise<void> {
      // Only show the loading state when there is nothing to display yet; a neighbour of an
      // already-cached chapter resolves without a visible transition.
      setState((previous) => (previous === 'idle' ? 'loading' : previous));
      setError(null);

      try {
        const { segment: built, failedEditions: failed } = await buildLessonSegment(verse);
        if (cancelled || requestId !== requestIdRef.current) return;

        setSegment(built);
        setFailedEditions(failed);
        setState(failed.length > 0 ? 'partial' : 'ready');

        // Fire-and-forget: prefetch must never block or fail the render.
        void prefetchUpcomingAyahs(surah, ayah, verse.versesCount);

        void db.tafsirProgress
          .get(`${surah}:${ayah}`)
          .then(async (existing) => {
            if (existing) return;
            await db.tafsirProgress.put({
              verseKey: `${surah}:${ayah}`,
              surah,
              ayah,
              state: 'visited',
              reflectionCount: 0,
              updatedAt: new Date().toISOString(),
            });
          })
          .catch((progressError: unknown) => {
            console.warn('Tafsir lesson progress could not be recorded:', progressError);
          });
      } catch (loadError: unknown) {
        if (cancelled || requestId !== requestIdRef.current) return;

        const retryable = loadError instanceof TafsirUnavailableError;
        console.error(`Tafsir lesson load failed for ${surah}:${ayah}:`, loadError);
        setError({
          message: retryable
            ? 'The commentary service could not be reached. The Arabic verse and translations below are still verified; only the exegesis is missing.'
            : 'This lesson could not be assembled. Please retry.',
          retryable,
        });
        setState('error');
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
    // `verse` is rebuilt on the server for every route change; keying on the reference
    // would re-run this effect on every render, so the identity of the verse is the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surah, ayah, reloadToken]);

  const reload = useCallback((): void => {
    setState('loading');
    setReloadToken((token) => token + 1);
  }, []);

  return { segment, failedEditions, state, error, reload };
}
