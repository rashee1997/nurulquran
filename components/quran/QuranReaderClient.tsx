'use client';

import React, { useCallback } from 'react';
import { QuranReader } from '@/components/quran/QuranReader';
import { useAiTutor } from '@/components/ai/tutor-bridge';
import type { Chapter, Verse } from '@/lib/quran/types';

/**
 * Client wrapper for the reader route.
 *
 * The surah page is a server component (it fetches verified verses), but the
 * "Ask study assistant" action needs the app-wide tutor bridge that lives in the
 * client provider tree. This wrapper consumes the bridge and hands the reader an
 * `onOpenAiTutor` callback — the exact prop `QuranReader` and `AyahItem` already
 * declare, which is what was missing before (the per-ayah button silently did
 * nothing because the prop never arrived).
 */
export const QuranReaderClient: React.FC<{ chapter: Chapter; verses: Verse[] }> = ({
  chapter,
  verses,
}) => {
  const { open } = useAiTutor();

  const handleOpenAiTutor = useCallback(
    (prompt?: string): void => {
      open(prompt);
    },
    [open]
  );

  return <QuranReader chapter={chapter} verses={verses} onOpenAiTutor={handleOpenAiTutor} />;
};
