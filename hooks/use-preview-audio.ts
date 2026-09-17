'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { previewAudio } from '@/lib/audio/preview-audio';

export interface PreviewAudioApi {
  /** Key of the preview currently playing, or null. */
  playingKey: string | null;
  /** True when the preview identified by `key` is the one playing. */
  isPlaying: (key: string) => boolean;
  /**
   * Plays a recorded recitation URL, superseding any current preview.
   * Resolves `false` when the clip could not be played, so callers can fall back.
   */
  playUrl: (key: string, url: string) => Promise<boolean>;
  /**
   * Speaks text through the platform synthesizer.
   * Resolves `false` when no usable voice exists, so callers can fall back.
   */
  speak: (key: string, text: string, lang?: string) => Promise<boolean>;
  /** Stops the active preview immediately. */
  stop: () => void;
}

const getServerKey = (): string | null => null;

/**
 * Binds a component to the shared preview player.
 *
 * Playback is a single global resource, so the playing state is read from the
 * controller instead of being mirrored in component state. Unmounting releases
 * the player, which is what stops recitation from outliving its page.
 */
export function usePreviewAudio(): PreviewAudioApi {
  const playingKey = useSyncExternalStore(
    previewAudio.subscribe,
    previewAudio.getPlayingKey,
    getServerKey
  );

  useEffect(() => () => previewAudio.stop(), []);

  const isPlaying = useCallback((key: string) => playingKey === key, [playingKey]);
  const playUrl = useCallback((key: string, url: string) => previewAudio.play(key, url), []);
  const speak = useCallback(
    (key: string, text: string, lang?: string) => previewAudio.speak(key, text, lang),
    []
  );
  const stop = useCallback(() => previewAudio.stop(), []);

  return { playingKey, isPlaying, playUrl, speak, stop };
}
