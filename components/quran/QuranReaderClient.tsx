'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { QuranReader } from '@/components/quran/QuranReader';
import { TafsirDialog } from '@/components/tafsir/TafsirDialog';
import { useAiTutor } from '@/components/ai/tutor-bridge';
import { db } from '@/lib/db';
import type { Chapter, Verse } from '@/lib/quran/types';

/**
 * Client wrapper for the reader route.
 *
 * Two responsibilities the Server Component above cannot hold:
 *
 *  1. **The app-wide tutor bridge.** The "Ask study assistant" action needs the context that
 *     lives in the client provider tree, so this wrapper consumes it and hands the reader the
 *     `onOpenAiTutor` callback it declares. (That prop was previously never passed, which is
 *     why the per-ayah button silently did nothing.)
 *  2. **The Tafseer dialog and its URL contract.** Commentary opens *over* the reader, so the
 *     reader is never unmounted and its scroll position survives. The dialog's state is
 *     mirrored into `?dialog=tafsir&surah=X&ayah=Y` so the browser Back button closes it, a
 *     deep link opens it, and a shared link lands on the exact verse.
 */

const DIALOG_PARAM = 'dialog';
const DIALOG_VALUE = 'tafsir';
const SURAH_PARAM = 'surah';
const AYAH_PARAM = 'ayah';

/**
 * Reads the dialog's ayah out of the current URL.
 *
 * The surah parameter is cross-checked against the chapter actually rendered rather than
 * trusted: a stale link that names another sūrah must not open this chapter's commentary
 * under a header claiming a verse that is not on screen.
 */
function readDialogAyah(surah: number, versesCount: number): number | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get(DIALOG_PARAM) !== DIALOG_VALUE) return null;

  const namedSurah = Number(params.get(SURAH_PARAM));
  if (!Number.isInteger(namedSurah) || namedSurah !== surah) return null;

  const ayah = Number(params.get(AYAH_PARAM));
  if (!Number.isInteger(ayah) || ayah < 1 || ayah > versesCount) return null;

  return ayah;
}

/**
 * Writes the dialog coordinates into the URL.
 *
 * `push` is used when the dialog opens, so Back closes it — the behaviour a full-route link
 * used to give for free. Stepping between ayahs uses `replace` on purpose: pushing every step
 * would make Back replay the learner's traversal one verse at a time instead of dismissing the
 * dialog, which is not what "go back" means here.
 */
function writeDialogUrl(mode: 'push' | 'replace', surah: number, ayah: number): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set(DIALOG_PARAM, DIALOG_VALUE);
  url.searchParams.set(SURAH_PARAM, String(surah));
  url.searchParams.set(AYAH_PARAM, String(ayah));
  const next = `${url.pathname}${url.search}${url.hash}`;
  const state = { tafsirDialog: true };
  if (mode === 'push') window.history.pushState(state, '', next);
  else window.history.replaceState(state, '', next);
}

/** Removes the dialog's parameters without leaving a history entry behind. */
function clearDialogUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete(DIALOG_PARAM);
  url.searchParams.delete(SURAH_PARAM);
  url.searchParams.delete(AYAH_PARAM);
  const query = url.searchParams.toString();
  window.history.replaceState(null, '', `${url.pathname}${query ? `?${query}` : ''}${url.hash}`);
}

export const QuranReaderClient: React.FC<{ chapter: Chapter; verses: Verse[] }> = ({
  chapter,
  verses,
}) => {
  const { open } = useAiTutor();
  const [tafsirAyah, setTafsirAyah] = useState<number | null>(null);

  /** The learner's saved storyteller voice, so the dialog sounds like the rest of the app. */
  const savedVoiceId = useLiveQuery(
    async () => (await db.userProfile.get('default_user'))?.aiVoiceId ?? null,
    []
  );

  const handleOpenAiTutor = useCallback(
    (prompt?: string, verse?: Verse): void => {
      open(
        prompt,
        verse
          ? {
              surah: verse.surah,
              ayah: verse.ayah,
              surahName: chapter.nameSimple,
            }
          : { surah: chapter.id, ayah: 1, surahName: chapter.nameSimple }
      );
    },
    [open, chapter.id, chapter.nameSimple]
  );

  /*
   * The URL is the source of truth for whether the dialog is open, so a deep link, a Back
   * press and a click all converge on the same state. `popstate` is the only event the browser
   * gives for Back/Forward, and reading it here (rather than with `useSearchParams`) keeps this
   * client component free of a Suspense boundary requirement.
   */
  useEffect(() => {
    const sync = (): void => setTafsirAyah(readDialogAyah(chapter.id, chapter.versesCount));
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [chapter.id, chapter.versesCount]);

  const openTafsir = useCallback(
    (verse: Verse): void => {
      writeDialogUrl('push', chapter.id, verse.ayah);
      setTafsirAyah(verse.ayah);
    },
    [chapter.id]
  );

  const navigateTafsir = useCallback(
    (nextAyah: number): void => {
      if (nextAyah < 1 || nextAyah > chapter.versesCount) return;
      writeDialogUrl('replace', chapter.id, nextAyah);
      setTafsirAyah(nextAyah);
    },
    [chapter.id, chapter.versesCount]
  );

  const closeTafsir = useCallback((): void => {
    /*
     * If the dialog's own history entry is the current one, Back is the correct dismissal: it
     * unwinds exactly the entry this dialog pushed and leaves the reader's history untouched.
     * A deep link opened no such entry, so there the parameters are stripped in place instead —
     * otherwise Back would dump the learner out of the reader entirely.
     */
    if (typeof window !== 'undefined' && window.history.state?.tafsirDialog) {
      window.history.back();
      return;
    }
    clearDialogUrl();
    setTafsirAyah(null);
  }, []);

  return (
    <>
      <QuranReader
        chapter={chapter}
        verses={verses}
        onOpenAiTutor={handleOpenAiTutor}
        onOpenTafsir={openTafsir}
        activeTafsirAyah={tafsirAyah}
      />

      <TafsirDialog
        open={tafsirAyah !== null}
        chapter={chapter}
        verses={verses}
        ayah={tafsirAyah}
        onNavigate={navigateTafsir}
        onClose={closeTafsir}
        voiceId={savedVoiceId ?? undefined}
      />
    </>
  );
};
