'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { db, type UserProfile } from '@/lib/db';
import { showToast } from '@/lib/ui/toast';

/**
 * Reader display preferences, persisted to the learner's profile.
 *
 * These used to live only in `QuranReader`'s component state, labelled "Saved for this
 * session", while `UserProfile` carried four fields for exactly the same settings that
 * nothing read or wrote. A learner who enlarged the Arabic text to read the diacritics
 * lost it on the next navigation and had to set it again for every verse — the highest
 * frequency annoyance in the app for anyone who needs accessibility scaling.
 *
 * The profile is now the single source of truth. Defaults come from `DEFAULT_ARABIC_FONT_SIZE`
 * rather than the reader's old hardcoded 30, so there is no visible jump on first load.
 *
 * Writes stay automatic — the panel previews the change live, so a save button there would be a
 * step with nothing to decide — but every write now reports its result as a toast. The panel used
 * to claim "Saved on this device" while the write silently failed whenever the profile row was
 * missing, which is the one case where confirmation actually matters.
 */

export const MIN_ARABIC_FONT_SIZE = 22;
export const MAX_ARABIC_FONT_SIZE = 46;
export const DEFAULT_ARABIC_FONT_SIZE = 28;

/** How long to wait after the last slider movement before writing to the profile. */
const FONT_SIZE_WRITE_DELAY_MS = 400;

type TranslationPreference = UserProfile['preferredTranslationLang'];

function languagesFrom(preference: TranslationPreference | undefined): {
  en: boolean;
  ta: boolean;
} {
  // `both` (and an unset value) enables both; the reader always shows at least one
  // translation, so there is no "neither" state to represent.
  return { en: preference !== 'ta', ta: preference !== 'en' };
}

function preferenceFrom(en: boolean, ta: boolean): TranslationPreference {
  if (en && ta) return 'both';
  if (en) return 'en';
  if (ta) return 'ta';
  return 'both';
}

export interface ReaderPreferences {
  /** False until the stored values have been read, so the reader does not flash defaults. */
  ready: boolean;
  fontSize: number;
  setFontSize: (size: number) => void;
  showEnglish: boolean;
  showTamil: boolean;
  setShowEnglish: (enabled: boolean) => void;
  setShowTamil: (enabled: boolean) => void;
  showTajweedColors: boolean;
  setShowTajweedColors: (enabled: boolean) => void;
}

export function useReaderPreferences(): ReaderPreferences {
  const [ready, setReady] = useState(false);
  const [fontSize, setFontSizeState] = useState(DEFAULT_ARABIC_FONT_SIZE);
  const [showEnglish, setShowEnglishState] = useState(true);
  const [showTamil, setShowTamilState] = useState(true);
  const [showTajweedColors, setShowTajweedColorsState] = useState(true);

  const fontWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFontSizeRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const profile = await db.userProfile.get('default_user');
        if (!active || !profile) return;

        if (typeof profile.arabicFontSize === 'number') {
          setFontSizeState(
            Math.min(MAX_ARABIC_FONT_SIZE, Math.max(MIN_ARABIC_FONT_SIZE, profile.arabicFontSize))
          );
        }
        if (typeof profile.tajweedColorsEnabled === 'boolean') {
          setShowTajweedColorsState(profile.tajweedColorsEnabled);
        }
        const languages = languagesFrom(profile.preferredTranslationLang);
        setShowEnglishState(languages.en);
        setShowTamilState(languages.ta);
      } catch (error: unknown) {
        // Preferences are a convenience: a storage failure must not stop the reader from
        // rendering scripture, so the defaults stand.
        console.warn('Reader preferences could not be read:', error);
      } finally {
        if (active) setReady(true);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  /**
   * Applies a patch to the stored profile.
   *
   * Read-then-update rather than `update` alone: if the profile row has not been seeded yet
   * the update would match no rows and the preference would vanish with no error. It is not
   * created here either, because a partially populated profile written by the reader would be
   * worse than a preference that has not been saved yet.
   */
  const persist = useCallback(async (patch: Partial<UserProfile>): Promise<void> => {
    try {
      const existing = await db.userProfile.get('default_user');
      if (!existing) {
        showToast('Preferences could not be saved — your profile is missing on this device.', 'error');
        return;
      }
      await db.userProfile.update('default_user', patch);
      showToast('Reader preferences saved on this device.');
    } catch (error: unknown) {
      console.warn('Reader preference could not be saved:', error);
      showToast('Reader preferences could not be saved.', 'error');
    }
  }, []);

  const setFontSize = useCallback(
    (size: number): void => {
      const bounded = Math.min(MAX_ARABIC_FONT_SIZE, Math.max(MIN_ARABIC_FONT_SIZE, size));
      setFontSizeState(bounded);
      pendingFontSizeRef.current = bounded;

      // The slider fires on every pixel of movement; coalesce the writes.
      if (fontWriteTimerRef.current) clearTimeout(fontWriteTimerRef.current);
      fontWriteTimerRef.current = setTimeout(() => {
        fontWriteTimerRef.current = null;
        const pending = pendingFontSizeRef.current;
        pendingFontSizeRef.current = null;
        if (pending !== null) void persist({ arabicFontSize: pending });
      }, FONT_SIZE_WRITE_DELAY_MS);
    },
    [persist]
  );

  // Flush a coalesced write when the reader unmounts, so dragging the slider and immediately
  // navigating away still keeps the new size.
  useEffect(
    () => () => {
      if (fontWriteTimerRef.current) {
        clearTimeout(fontWriteTimerRef.current);
        fontWriteTimerRef.current = null;
      }
      const pending = pendingFontSizeRef.current;
      pendingFontSizeRef.current = null;
      if (pending !== null) void persist({ arabicFontSize: pending });
    },
    [persist]
  );

  const setShowEnglish = useCallback(
    (enabled: boolean): void => {
      // The reader must keep at least one translation visible; switching only one on is
      // allowed, switching both off is not, and the UI prevents reaching that state.
      const nextEnglish = enabled;
      const nextTamil = enabled ? showTamil : true;
      setShowEnglishState(nextEnglish);
      setShowTamilState(nextTamil);
      void persist({ preferredTranslationLang: preferenceFrom(nextEnglish, nextTamil) });
    },
    [persist, showTamil]
  );

  const setShowTamil = useCallback(
    (enabled: boolean): void => {
      const nextTamil = enabled;
      const nextEnglish = enabled ? showEnglish : true;
      setShowTamilState(nextTamil);
      setShowEnglishState(nextEnglish);
      void persist({ preferredTranslationLang: preferenceFrom(nextEnglish, nextTamil) });
    },
    [persist, showEnglish]
  );

  const setShowTajweedColors = useCallback(
    (enabled: boolean): void => {
      setShowTajweedColorsState(enabled);
      void persist({ tajweedColorsEnabled: enabled });
    },
    [persist]
  );

  return {
    ready,
    fontSize,
    setFontSize,
    showEnglish,
    showTamil,
    setShowEnglish,
    setShowTamil,
    showTajweedColors,
    setShowTajweedColors,
  };
}
