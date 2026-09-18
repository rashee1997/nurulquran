'use client';

/**
 * Where the app plays a lesson's Arabic from — one place that decides between a recording and a
 * synthesizer, and says out loud when neither is available.
 *
 * This exists because the lessons had exactly one audio path and it ended in AI: a single button
 * that fell through to the platform speech engine (no Arabic voice on most desktops) and then to
 * server Gemini TTS (metered, and 429 after the first call). Not one call site could tell the
 * learner which of those they were hearing, or that they were hearing nothing at all.
 *
 * Here the recording always wins, the synthesizer is a labelled last resort, and a total failure is
 * reported as a toast instead of silence.
 */

import { useCallback } from 'react';
import { usePreviewAudio } from './use-preview-audio';
import {
  containsArabicScript,
  pronunciationItems,
  resolvePronunciation,
  type Pronunciation,
  type PronunciationItem,
} from '@/lib/learning/pronunciation';
import type { RecitationSpan } from '@/lib/quran/word-audio';
import { showToast } from '@/lib/ui/toast';

/** What the learner actually heard. */
export type PronunciationSource = 'recording' | 'letters' | 'synthesized' | 'none';

export interface PronunciationApi {
  /** Key of the preview currently playing, or null. */
  playingKey: string | null;
  /** Resolves Arabic to its recorded source without playing anything. */
  resolve: (text: string, anchor?: RecitationSpan) => Promise<Pronunciation>;
  /** Plays one resolved item — one word, or one letter. */
  playItem: (
    key: string,
    item: PronunciationItem,
    options?: { rate?: number }
  ) => Promise<boolean>;
  /**
   * Plays whatever `text` is, from the best source available, and reports which one it was.
   * `quiet` suppresses the "nothing to play" toast, for callers that already explain it inline.
   */
  playText: (
    key: string,
    text: string,
    options?: { anchor?: RecitationSpan; rate?: number; quiet?: boolean }
  ) => Promise<PronunciationSource>;
  /** Stops the active preview. */
  stop: () => void;
}

export function usePronunciation(): PronunciationApi {
  const { playingKey, playUrl, playSequence, speak, stop } = usePreviewAudio();

  const resolve = useCallback(
    (text: string, anchor?: RecitationSpan) => resolvePronunciation(text, { anchor }),
    []
  );

  const playItem = useCallback(
    (key: string, item: PronunciationItem, options?: { rate?: number }) =>
      playUrl(key, item.sources, { rate: options?.rate }),
    [playUrl]
  );

  const playText = useCallback(
    async (
      key: string,
      text: string,
      options?: { anchor?: RecitationSpan; rate?: number; quiet?: boolean }
    ): Promise<PronunciationSource> => {
      const trimmed = text.trim();
      if (trimmed.length === 0) return 'none';

      const resolution = await resolvePronunciation(trimmed, { anchor: options?.anchor });
      const items = pronunciationItems(resolution);
      if (items.length > 0) {
        const played = await playSequence(
          key,
          items.map((item) => item.sources),
          { rate: options?.rate }
        );
        if (played) return resolution.kind === 'letters' ? 'letters' : 'recording';
      }

      // No recording: the platform synthesizer is all that is left. An English voice reading
      // transliterated option text is reasonable; an English voice reading Uthmani script is not,
      // which is why `speak` refuses when the platform has voices but none for Arabic.
      const language = containsArabicScript(trimmed) ? 'ar-SA' : 'en-US';
      const spoke = await speak(`${key}:speech`, trimmed, language);
      if (spoke) return 'synthesized';

      if (!options?.quiet) {
        showToast(`No audio available for "${trimmed.slice(0, 40)}".`, 'error');
      }
      return 'none';
    },
    [playSequence, speak]
  );

  return { playingKey, resolve, playItem, playText, stop };
}
