'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { previewAudio, type PreviewPlaybackOptions } from '@/lib/audio/preview-audio';

export interface PreviewAudioApi {
  /** Key of the preview currently playing, or null. */
  playingKey: string | null;
  /** True when the preview identified by `key` is the one playing. */
  isPlaying: (key: string) => boolean;
  /**
   * Plays a recorded recitation URL, superseding any current preview.
   * Pass several interchangeable URLs to try them in order — a word's clip is mirrored on
   * more than one host, so failing over is what keeps a single 404 from ending in silence.
   * Resolves `false` when no URL could be played, so callers can fall back.
   * `options.rate` slows the recording while keeping its pitch, for pronunciation practice.
   */
  playUrl: (
    key: string,
    url: string | readonly string[],
    options?: PreviewPlaybackOptions
  ) => Promise<boolean>;
  /**
   * Plays a sequence of clips back to back, one URL-candidate group per item — used to
   * recite a run of words. Resolves `false` when nothing could be played at all.
   */
  playSequence: (
    key: string,
    groups: readonly (string | readonly string[])[],
    options?: PreviewPlaybackOptions
  ) => Promise<boolean>;
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
  const playUrl = useCallback(
    (key: string, url: string | readonly string[], options?: PreviewPlaybackOptions) =>
      previewAudio.play(key, url, options),
    []
  );
  const playSequence = useCallback(
    (key: string, groups: readonly (string | readonly string[])[], options?: PreviewPlaybackOptions) =>
      previewAudio.playSequence(key, groups, options),
    []
  );
  const speak = useCallback(
    (key: string, text: string, lang?: string) => previewAudio.speak(key, text, lang),
    []
  );
  const stop = useCallback(() => previewAudio.stop(), []);

  return { playingKey, isPlaying, playUrl, playSequence, speak, stop };
}
