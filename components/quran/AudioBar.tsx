'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Repeat,
  FastForward,
  SkipBack,
  SkipForward,
  AlertCircle,
} from 'lucide-react';
import { db } from '@/lib/db';
import type { QuranWord } from '@/lib/quran/types';
import {
  activeWordAt,
  alignSegmentsToWords,
  estimateSegments,
  loadMeasuredTimings,
  type WordSegment,
} from '@/lib/quran/word-timings';
import { DEFAULT_RECITER, RECITERS, reciterAudioUrl, reciterName } from '@/lib/quran/reciters';
import { getChapterMetadata } from '@/lib/quran/surahs';
import { showToast } from '@/lib/ui/toast';

/**
 * Re-exported from `lib/quran/reciters` so the reader, the settings screen and the offline
 * downloader all build audio URLs from one table (see that module for why the bitrate and the
 * Quran.com recitation id live beside the reciter).
 */
export { RECITERS, type ReciterOption } from '@/lib/quran/reciters';

const REPEAT_MODES = [1, 3, 5, 10, 999] as const;
const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5] as const;

interface AudioBarProps {
  surahNumber: number;
  totalVerses: number;
  currentAyahNumber: number;
  /** 1-based position of the ayah in the Mushaf; required to build reciter URLs. */
  globalAyahNumber: number;
  /** URL provided by the verse record, used if a reciter URL cannot be built. */
  fallbackAudioUrl?: string;
  /**
   * Playback the reader wants applied. `token` is bumped on every explicit request so
   * repeating the same intent (“play this ayah” twice) still re-triggers it. The bar
   * stays the single owner of the media element; the reader only states intent.
   */
  playIntent?: PlaybackIntent;
  /** Reports the real playing state so ayah rows can show the correct control. */
  onPlayingChange?: (playing: boolean) => void;
  onNextAyah?: () => void;
  onPrevAyah?: () => void;
  /** Words of the current ayah, for word-synced highlighting. */
  words?: readonly QuranWord[];
  /** Reports the 1-based index of the word being recited (null between words / when idle). */
  onActiveWordChange?: (wordIndex: number | null) => void;
  /** Fired once each time an ayah plays through to its end (not on repeats). */
  onAyahCompleted?: () => void;
}

export interface PlaybackIntent {
  token: number;
  playing: boolean;
}

/**
 * Turns a failed `play()` into a message that says what actually happened: a browser
 * autoplay/permission block is a user-gesture problem (tapping play again fixes it), while any
 * other rejection means the clip itself did not load — which is when pointing at another reciter
 * or the network makes sense.
 */
function describePlayFailure(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return 'The browser blocked playback until you interact with the page — tap play to start it.';
    }
    if (error.name === 'NotSupportedError') {
      return 'This recitation could not be decoded. Try another reciter.';
    }
  }
  return 'Playback was blocked or the recitation could not be loaded. Check your connection or try another reciter.';
}

/**
 * Sticky recitation player.
 *
 * One component owns the media element: there is a single `play()` authority, the
 * element is released on unmount (a detached `HTMLAudioElement` keeps playing, which
 * previously left recitation running with no controls after navigation), and the
 * reciter selector actually changes the audio source.
 */
export const AudioBar: React.FC<AudioBarProps> = ({
  surahNumber,
  totalVerses,
  currentAyahNumber,
  globalAyahNumber,
  fallbackAudioUrl,
  playIntent,
  onPlayingChange,
  onNextAyah,
  onPrevAyah,
  words,
  onActiveWordChange,
  onAyahCompleted,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  /** Measured word timings for this ayah, when a timing source exists for this reciter. */
  const [measuredSegments, setMeasuredSegments] = useState<{ ayah: number; segments: WordSegment[] } | null>(null);
  const [segmentSource, setSegmentSource] = useState<'measured' | 'estimated' | null>(null);
  const lastWordRef = useRef<number | null>(null);
  /** Which source produced the current highlight, so the badge updates only when it changes. */
  const segmentSourceRef = useRef<'measured' | 'estimated' | null>(null);
  const [progressState, setProgressState] = useState<{ ayah: number; percent: number }>({
    ayah: currentAyahNumber,
    percent: 0,
  });
  const [durationState, setDurationState] = useState<{ ayah: number; seconds: number | null }>({
    ayah: currentAyahNumber,
    seconds: null,
  });
  const [repeatMode, setRepeatMode] = useState<number>(1);
  const [loopState, setLoopState] = useState<{ ayah: number; count: number }>({
    ayah: currentAyahNumber,
    count: 1,
  });
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [selectedReciter, setSelectedReciter] = useState<string>(DEFAULT_RECITER);
  const [audioError, setAudioError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** True while the learner wants audio playing, so advancing keeps playing. */
  const wantsPlaybackRef = useRef(false);
  /** Token of the last playback intent that was applied to the media element. */
  const appliedIntentRef = useRef<number>(-1);

  const audioUrl = selectedReciter
    ? reciterAudioUrl(selectedReciter, globalAyahNumber)
    : fallbackAudioUrl;

  /**
   * Progress, duration and the repeat counter are tagged with the ayah they describe,
   * so values from the previous ayah can never be rendered. This replaces an effect
   * that reset three pieces of state on every navigation (one extra render per ayah)
   * and briefly showed the previous ayah's progress bar on the new one.
   */
  const progress = progressState.ayah === currentAyahNumber ? progressState.percent : 0;
  const duration = durationState.ayah === currentAyahNumber ? durationState.seconds : null;
  const currentLoopCount = loopState.ayah === currentAyahNumber ? loopState.count : 1;

  // Load the saved reciter preference once.
  useEffect(() => {
    let active = true;
    db.userProfile
      .get('default_user')
      .then((profile) => {
        if (active && profile?.reciterId) {
          setSelectedReciter(profile.reciterId);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  /**
   * Measured word timings for the current ayah, when a source exists for this reciter.
   *
   * Keyed on the ayah as well as the reciter: the segments for the previous ayah must not be
   * applied to the new one while this lookup is in flight.
   */
  useEffect(() => {
    let active = true;
    // Clears the previous ayah's timings while the new lookup is in flight, so a stale
    // segment list can never be matched against the new ayah's words.
    setMeasuredSegments(null);
    loadMeasuredTimings(selectedReciter, surahNumber)
      .then((source) => {
        if (!active || !source) return;
        const segments = source[`${surahNumber}:${currentAyahNumber}`];
        if (segments) setMeasuredSegments({ ayah: currentAyahNumber, segments });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [selectedReciter, surahNumber, currentAyahNumber]);

  // Lock-screen and hardware-key controls.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    const chapter = getChapterMetadata(surahNumber);
    try {
      session.metadata = new MediaMetadata({
        title: `${chapter.nameSimple} ${surahNumber}:${currentAyahNumber}`,
        artist: reciterName(selectedReciter),
        album: 'NurulQuran',
      });
      session.setActionHandler('play', () => {
        wantsPlaybackRef.current = true;
        audioRef.current?.play().catch(() => undefined);
      });
      session.setActionHandler('pause', () => {
        wantsPlaybackRef.current = false;
        audioRef.current?.pause();
      });
      session.setActionHandler('previoustrack', onPrevAyah ? () => onPrevAyah() : null);
      session.setActionHandler('nexttrack', onNextAyah ? () => onNextAyah() : null);
    } catch {
      // Older browsers expose mediaSession without every action; ignore.
    }
    return () => {
      try {
        session.setActionHandler('play', null);
        session.setActionHandler('pause', null);
        session.setActionHandler('previoustrack', null);
        session.setActionHandler('nexttrack', null);
      } catch {
        // ignore
      }
    };
  }, [selectedReciter, surahNumber, currentAyahNumber, onPrevAyah, onNextAyah]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch {
      // ignore
    }
  }, [isPlaying]);

  // Single place that loads a source and resumes playback when the learner had
  // already been listening (so advancing ayahs does not stop the recitation).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    setAudioError(null);
    audio.playbackRate = playbackRate;

    if (!audioUrl) {
      wantsPlaybackRef.current = false;
      return;
    }

    // `audio.src` is absolute while `audioUrl` is not, so compare on the attribute.
    if (audio.getAttribute('src') !== audioUrl) {
      audio.src = audioUrl;
      audio.load();
    }

    if (wantsPlaybackRef.current) {
      audio.play().catch(() => {
        // Autoplay can be blocked until a user gesture; the button starts it.
        wantsPlaybackRef.current = false;
        setIsPlaying(false);
      });
    }
  }, [audioUrl, playbackRate]);

  // Explicit request from the reader (ayah play button, Listen from Start).
  useEffect(() => {
    if (!playIntent || playIntent.token === appliedIntentRef.current) return;
    appliedIntentRef.current = playIntent.token;

    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    if (!playIntent.playing) {
      wantsPlaybackRef.current = false;
      audio.pause();
      return;
    }

    wantsPlaybackRef.current = true;
    audio.play().catch((error: unknown) => {
      wantsPlaybackRef.current = false;
      setIsPlaying(false);
      setAudioError(describePlayFailure(error));
    });
  }, [audioUrl, playIntent]);

  // Keep the reader informed about the real playback state (not a guess).
  useEffect(() => {
    onPlayingChange?.(isPlaying);
  }, [isPlaying, onPlayingChange]);

  // Release the media element when the reader is unmounted or the ayah list changes.
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      wantsPlaybackRef.current = false;
      if (!audio) return;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, []);

  const togglePlay = useCallback((): void => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    if (wantsPlaybackRef.current) {
      wantsPlaybackRef.current = false;
      audio.pause();
      setIsPlaying(false);
      return;
    }

    wantsPlaybackRef.current = true;
    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch((error: unknown) => {
        wantsPlaybackRef.current = false;
        setIsPlaying(false);
        setAudioError(describePlayFailure(error));
      });
  }, [audioUrl]);

  /**
   * Reports the word being recited at the media element's current position.
   *
   * `audio.currentTime` is the authoritative clock: it is media time, so it stays correct at
   * any playback rate and after a seek. Reading it every animation frame keeps the highlight
   * on the word the Qari is actually reciting — measured timings when the alignment that
   * ships with this recording is available, and the letter-count estimate otherwise.
   */
  const reportActiveWord = useCallback((): void => {
    const audio = audioRef.current;
    const wordList = words ?? [];
    if (!audio || !onActiveWordChange || wordList.length === 0) return;

    const totalSeconds = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
    if (totalSeconds === null) return;

    // Measured timings are used only when they address exactly the words on screen; a list whose
    // indexing does not fit this ayah would highlight the wrong word, which is worse than an
    // estimate. (`alignSegmentsToWords` decides that, and fills in words an alignment omits rather
    // than discarding the ayah's timings — see it for why.)
    const measured =
      measuredSegments?.ayah === currentAyahNumber
        ? alignSegmentsToWords(measuredSegments.segments, wordList.length)
        : null;

    const nextSource = measured ? 'measured' : 'estimated';
    if (segmentSourceRef.current !== nextSource) {
      segmentSourceRef.current = nextSource;
      setSegmentSource(nextSource);
    }

    const segments = measured ?? estimateSegments(wordList, totalSeconds * 1000);
    const active = activeWordAt(segments, audio.currentTime * 1000);
    if (active !== lastWordRef.current) {
      lastWordRef.current = active;
      onActiveWordChange(active);
    }
  }, [currentAyahNumber, measuredSegments, onActiveWordChange, words]);

  /**
   * Word highlight follows the audio clock frame by frame while the ayah plays.
   *
   * `timeupdate` fires roughly four times a second, so a word boundary could be reported up to
   * a quarter of a second late — the highlight visibly trailing the recitation. The loop is
   * bounded by the playing state, so it costs nothing while paused, and `timeupdate` still
   * calls the same function as a fallback for browsers that throttle frames in a hidden tab.
   */
  useEffect(() => {
    if (!isPlaying || typeof requestAnimationFrame === 'undefined') return;
    let frame = requestAnimationFrame(function tick() {
      reportActiveWord();
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, reportActiveWord]);

  const handleTimeUpdate = useCallback((): void => {
    const audio = audioRef.current;
    if (!audio) return;
    const current = audio.currentTime;
    const total = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
    setDurationState({ ayah: currentAyahNumber, seconds: total });
    // Without a known duration the scrubber stays at zero rather than reporting a
    // meaningless percentage derived from a fallback value.
    setProgressState({
      ayah: currentAyahNumber,
      percent: total ? Math.min(100, (current / total) * 100) : 0,
    });
    reportActiveWord();
  }, [currentAyahNumber, reportActiveWord]);

  /**
   * The highlight is dropped when playback stops and when the recitation moves to another ayah.
   *
   * The reader applies the reported index to the ayah being recited, so an index left over from
   * the previous ayah would highlight the wrong word until the next boundary — which is why the
   * reset is unconditional on both of those transitions rather than only on pause.
   */
  useEffect(() => {
    lastWordRef.current = null;
    onActiveWordChange?.(null);
  }, [isPlaying, currentAyahNumber, onActiveWordChange]);

  const handleEnded = useCallback((): void => {
    const audio = audioRef.current;
    if (!audio) return;

    if (currentLoopCount === 1) onAyahCompleted?.();

    const isInfinite = repeatMode === 999;
    if (isInfinite || currentLoopCount < repeatMode) {
      setLoopState({ ayah: currentAyahNumber, count: currentLoopCount + 1 });
      audio.currentTime = 0;
      audio.play().catch(() => undefined);
      return;
    }

    if (onNextAyah && currentAyahNumber < totalVerses) {
      // The next ayah gets a fresh repeat tier automatically.
      setLoopState({ ayah: currentAyahNumber + 1, count: 1 });
      onNextAyah();
      return;
    }

    wantsPlaybackRef.current = false;
    setIsPlaying(false);
    setProgressState({ ayah: currentAyahNumber, percent: 0 });
    setLoopState({ ayah: currentAyahNumber, count: 1 });
  }, [currentAyahNumber, currentLoopCount, onAyahCompleted, onNextAyah, repeatMode, totalVerses]);

  const cycleRepeatMode = useCallback((): void => {
    setRepeatMode((previous) => {
      const index = REPEAT_MODES.indexOf(previous as (typeof REPEAT_MODES)[number]);
      return REPEAT_MODES[(index + 1) % REPEAT_MODES.length] ?? 1;
    });
    setLoopState({ ayah: currentAyahNumber, count: 1 });
  }, [currentAyahNumber]);

  const cycleSpeed = useCallback((): void => {
    setPlaybackRate((previous) => {
      const index = PLAYBACK_RATES.indexOf(previous as (typeof PLAYBACK_RATES)[number]);
      const next = PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length] ?? 1;
      if (audioRef.current) {
        audioRef.current.playbackRate = next;
      }
      return next;
    });
  }, []);

  const seek = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const nextTime = (Number(event.target.value) / 100) * duration;
    audio.currentTime = nextTime;
    setProgressState({ ayah: currentAyahNumber, percent: Number(event.target.value) });
  }, [currentAyahNumber, duration]);

  /**
   * Switching Qari applies immediately and is stored, then says so.
   *
   * The write was silent, and a failed one was indistinguishable from a successful one: the select
   * showed the new reciter while the profile still held the old one, so the next visit silently
   * reverted it.
   */
  const handleReciterChange = useCallback(async (reciterId: string): Promise<void> => {
    setSelectedReciter(reciterId);
    try {
      await db.userProfile.update('default_user', { reciterId });
      showToast(`Reciter saved — ${reciterName(reciterId)}`);
    } catch (error) {
      console.warn('Could not persist the reciter preference:', error);
      showToast('The reciter could not be saved on this device.', 'error');
    }
  }, []);

  const repeatLabel =
    repeatMode === 1 ? 'Play once' : repeatMode === 999 ? 'Loop continuously' : `Repeat ${repeatMode} times`;

  return (
    <div
      id="audio-bar"
      className="fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-md border-t border-border p-3 shadow-lg"
    >
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={() => {
          setAudioError('This recitation could not be loaded. Try another reciter.');
          wantsPlaybackRef.current = false;
          setIsPlaying(false);
        }}
      />

      <div className="max-w-4xl mx-auto flex flex-col gap-2">
        {audioError && (
          <div className="flex items-center gap-2 text-[11px] text-danger-strong bg-danger-subtle border border-danger/30 rounded-lg px-2.5 py-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{audioError}</span>
          </div>
        )}

        <label htmlFor="audio-scrubber" className="sr-only">
          Recitation position
        </label>
        <input
          id="audio-scrubber"
          type="range"
          min={0}
          max={100}
          step={0.1}
          value={progress}
          onChange={seek}
          disabled={!audioUrl || duration === null}
          aria-valuetext={
            duration ? `${Math.round(progress)}% of ayah ${currentAyahNumber}` : 'Duration unavailable'
          }
          className="w-full h-1.5 accent-primary cursor-pointer disabled:opacity-50"
        />

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-subtle flex items-center justify-center text-primary-strong">
              <Volume2 className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-foreground">
                Ayah {surahNumber}:{currentAyahNumber}
                {isPlaying && segmentSource === 'estimated' && (
                  <span
                    className="ml-1.5 text-[9px] font-semibold text-muted-foreground"
                    title="Measured word timings are unavailable for this ayah, so the highlight is estimated from its length."
                  >
                    ~word sync
                  </span>
                )}
              </span>
              <label htmlFor="reciter-select" className="sr-only">
                Reciter
              </label>
              <select
                id="reciter-select"
                value={selectedReciter}
                onChange={(event) => void handleReciterChange(event.target.value)}
                className="text-[11px] text-muted-foreground bg-transparent border-0 outline-hidden cursor-pointer hover:text-primary"
              >
                {RECITERS.map((reciter) => (
                  <option key={reciter.id} value={reciter.id} className="bg-card text-foreground">
                    {reciter.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (audioRef.current) audioRef.current.currentTime = 0;
                setProgressState({ ayah: currentAyahNumber, percent: 0 });
              }}
              disabled={!audioUrl}
              className="p-2 rounded-full hover:bg-surface-hover text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              aria-label="Restart this ayah"
              title="Restart this ayah"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
            </button>

            {onPrevAyah && (
              <button
                type="button"
                onClick={onPrevAyah}
                disabled={currentAyahNumber <= 1}
                className="p-2 rounded-full hover:bg-surface-hover text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                aria-label="Previous ayah"
                title="Previous ayah"
              >
                <SkipBack className="w-4 h-4" aria-hidden="true" />
              </button>
            )}

            <button
              id="audio-play-toggle-btn"
              type="button"
              onClick={togglePlay}
              disabled={!audioUrl}
              className="w-10 h-10 rounded-full bg-primary hover:bg-primary-hover disabled:opacity-40 text-primary-foreground flex items-center justify-center shadow-md transition-all active:scale-95"
              aria-label={isPlaying ? 'Pause recitation' : 'Play recitation'}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Play className="w-5 h-5 ml-0.5" aria-hidden="true" />
              )}
            </button>

            {onNextAyah && (
              <button
                type="button"
                onClick={onNextAyah}
                disabled={currentAyahNumber >= totalVerses}
                className="p-2 rounded-full hover:bg-surface-hover text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                aria-label="Next ayah"
                title="Next ayah"
              >
                <SkipForward className="w-4 h-4" aria-hidden="true" />
              </button>
            )}

            <button
              type="button"
              onClick={cycleRepeatMode}
              aria-label={`${repeatLabel}. Currently ${currentLoopCount} of ${
                repeatMode === 999 ? 'continuous' : repeatMode
              }.`}
              className={`px-2 py-1.5 rounded-xl transition-colors flex items-center gap-1 text-xs font-bold ${
                repeatMode > 1
                  ? 'bg-secondary text-secondary-foreground shadow-xs'
                  : 'hover:bg-surface-hover text-muted-foreground hover:text-foreground'
              }`}
              title={`Hifz loop: ${repeatLabel}`}
            >
              <Repeat className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{repeatMode === 999 ? '∞' : `${repeatMode}x`}</span>
              {repeatMode > 1 && (
                <span className="text-[10px] opacity-80">
                  ({currentLoopCount})
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={cycleSpeed}
              aria-label={`Playback speed ${playbackRate} times. Change speed.`}
              className="px-2 py-1 rounded-md text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-surface-hover flex items-center gap-0.5"
              title="Playback speed"
            >
              <FastForward className="w-3 h-3" aria-hidden="true" />
              <span>{playbackRate}x</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
