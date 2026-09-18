/**
 * Single-playback arbitration for one-off recitation and pronunciation previews.
 *
 * Previously every call site did `new Audio(url)` and never released the element,
 * so navigating away left recitation playing with no controls, and repeated taps
 * stacked overlapping playback. This controller keeps at most one preview alive,
 * always releases the element, and exposes its state so UIs can show play/pause
 * accurately instead of tracking a parallel boolean.
 *
 * Three defects of the original implementation are fixed here, all of which produced
 * silent failure — the learner tapped a control and heard nothing with no explanation:
 *
 *  1. **Only one URL was ever tried.** A word's clip lives on more than one host, so a
 *     single 404 or host hiccup ended the attempt. `play` now walks the candidate list.
 *  2. **A request that never settled hung forever.** `onerror` covers a refused clip, but
 *     not a host that accepts the connection and never answers, and not a synthesizer
 *     that silently does nothing. Both paths are now bounded and resolve `false`.
 *  3. **The synthesizer was never given a voice.** Setting only `utterance.lang` means a
 *     platform with no Arabic voice reads Uthmani script with an English voice, or fires
 *     `error`. A voice is now selected explicitly, and when the platform has voices but
 *     none for the requested language the call reports failure instead of speaking
 *     something that is not the Quran.
 */

type Listener = () => void;

export type PreviewPlaybackKind = 'audio' | 'speech';

/**
 * Optional playback shaping.
 *
 * `rate` slows a recording down while keeping its pitch, which is how a learner hears the makhraj
 * of a letter or the length of a Madd: the recitation is the same performance at, say, 0.75 speed.
 * The rate is bounded because a clip slower than half speed is not a recitation any more, and the
 * end-guard timeout below is scaled by it so a slow clip is never cut off mid-word.
 */
export interface PreviewPlaybackOptions {
  rate?: number;
}

const MIN_RATE = 0.5;
const MAX_RATE = 1.5;

function clampRate(rate: number | undefined): number {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return 1;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
}

/** How long a clip may sit un-started before it is treated as unreachable. */
const START_GUARD_MS = 8_000;
/** Grace period after a clip's own duration, in case `ended` never fires. */
const END_GRACE_MS = 3_000;
/** Fallback end guard when duration is unknown. */
const UNKNOWN_DURATION_MS = 20_000;
/** Longest a `SpeechSynthesisUtterance` may run before it is treated as finished. */
const MAX_SPEECH_MS = 20_000;
/** How long to wait for the platform to publish its voice list (Chrome populates it late). */
const VOICE_WAIT_MS = 1_200;

class PreviewAudioController {
  private audio: HTMLAudioElement | null = null;
  private utterance: SpeechSynthesisUtterance | null = null;
  private listeners = new Set<Listener>();
  private currentKey: string | null = null;
  private currentKind: PreviewPlaybackKind | null = null;
  /**
   * Identifies the current playback attempt.
   *
   * Every await in a multi-URL or sequential play has to be able to tell whether it is
   * still the owner of the speaker; without this a superseded attempt would resume and
   * talk over the one that replaced it.
   */
  private token = 0;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Stable snapshot used by `useSyncExternalStore`. */
  getPlayingKey = (): string | null => this.currentKey;

  getKind = (): PreviewPlaybackKind | null => this.currentKind;

  isPlaying = (key: string): boolean => this.currentKey === key;

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /** Releases the current media element without touching the speaker. */
  private releaseAudio(): void {
    const audio = this.audio;
    this.audio = null;
    if (!audio) return;
    audio.onended = null;
    audio.onerror = null;
    audio.onplaying = null;
    audio.onloadedmetadata = null;
    try {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    } catch {
      // Detached or already-disposed element.
    }
  }

  private releaseSpeech(): void {
    this.utterance = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  /** True when the platform exposes a speech synthesizer. */
  static speechAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  /** Stops whatever is playing and clears the playing key. */
  stop = (): void => {
    this.token += 1;
    this.releaseAudio();
    this.releaseSpeech();
    if (this.currentKey !== null || this.currentKind !== null) {
      this.currentKey = null;
      this.currentKind = null;
      this.emit();
    }
  };

  /**
   * Plays the first candidate that works, trying the rest in order.
   *
   * Resolves `true` when a clip played to completion, `false` when every candidate failed
   * — callers use that to fall back or to tell the learner, rather than leaving silence.
   */
  play = (
    key: string,
    source: string | readonly string[],
    options: PreviewPlaybackOptions = {}
  ): Promise<boolean> => this.playSequence(key, [source], options);

  /**
   * Plays candidate groups one after another — used to recite a sequence of words.
   *
   * Each group is one item's set of interchangeable URLs. An item with no playable
   * candidate is skipped rather than aborting the whole run, but the run reports failure
   * when nothing could be played at all, so a caller never claims success over silence.
   */
  playSequence = (
    key: string,
    groups: readonly (string | readonly string[])[],
    options: PreviewPlaybackOptions = {}
  ): Promise<boolean> => {
    if (typeof window === 'undefined') return Promise.resolve(false);

    const normalised = groups
      .map((group) => (Array.isArray(group) ? group : [group as string]))
      .map((group) => group.filter((url) => typeof url === 'string' && url.length > 0))
      .filter((group) => group.length > 0);

    if (normalised.length === 0) return Promise.resolve(false);

    this.stop();
    const token = this.token;
    this.currentKey = key;
    this.currentKind = 'audio';
    this.emit();

    return this.runSequence(token, normalised, clampRate(options.rate)).then((playedAny) => {
      if (this.token === token) {
        this.releaseAudio();
        this.currentKey = null;
        this.currentKind = null;
        this.emit();
      }
      return playedAny;
    });
  };

  private async runSequence(token: number, groups: readonly string[][], rate: number): Promise<boolean> {
    let playedAny = false;

    for (const [index, group] of groups.entries()) {
      if (this.token !== token) return playedAny;

      let playedThis = false;
      for (const url of group) {
        if (this.token !== token) return playedAny;
        if (await this.playUrlOnce(token, url, rate)) {
          playedThis = true;
          break;
        }
      }

      if (!playedThis) {
        console.warn(
          `Preview audio missing for item ${index + 1} of ${groups.length}; continuing with the rest.`
        );
      } else {
        playedAny = true;
      }
    }

    return playedAny;
  }

  /** Plays one URL to completion. Resolves `false` if it never starts or errors. */
  private playUrlOnce(token: number, url: string, rate = 1): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (this.token !== token) {
        resolve(false);
        return;
      }

      const audio = new Audio(url);
      audio.preload = 'auto';
      if (rate !== 1) {
        audio.playbackRate = rate;
        // Keep the reciter's pitch: this is the same voice, heard more slowly.
        audio.preservesPitch = true;
      }
      this.audio = audio;

      let settled = false;
      let startGuard: ReturnType<typeof setTimeout> | null = null;
      let endGuard: ReturnType<typeof setTimeout> | null = null;

      const settle = (played: boolean): void => {
        if (settled) return;
        settled = true;
        if (startGuard) clearTimeout(startGuard);
        if (endGuard) clearTimeout(endGuard);
        startGuard = null;
        endGuard = null;
        // Release this element promptly, but never one a newer attempt has taken over.
        if (this.audio === audio) this.releaseAudio();
        // A superseded attempt must never report success.
        resolve(played && this.token === token);
      };

      // Covers a host that accepts the connection and never answers, and an element that
      // never gets far enough to fire `playing`.
      startGuard = setTimeout(() => settle(false), START_GUARD_MS);

      audio.onerror = () => settle(false);
      audio.onplaying = () => {
        if (startGuard) {
          clearTimeout(startGuard);
          startGuard = null;
        }
        // `ended` is the real end signal; this only covers an element that stops
        // reporting it, which would otherwise leave the UI stuck on "Playing…".
        if (!endGuard) {
          const seconds = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
          // Wall-clock time, not media time: a clip at 0.75 speed takes a third longer to finish,
          // and cutting it off early would truncate the very syllable being practised.
          const budget = seconds > 0 ? (seconds * 1000) / rate + END_GRACE_MS : UNKNOWN_DURATION_MS;
          endGuard = setTimeout(() => settle(false), budget);
        }
      };
      audio.onended = () => settle(true);

      audio.play().catch(() => settle(false));
    });
  }

  /** True while a preview is currently audible. */
  isActive = (): boolean => this.currentKey !== null;

  /**
   * Speaks text via the platform synthesizer, used when no recorded audio exists.
   * Resolves `false` when the platform cannot speak the requested language, so callers can
   * report that instead of leaving the learner with silence.
   */
  speak = async (key: string, text: string, lang = 'ar-SA'): Promise<boolean> => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return false;
    }

    const synth = window.speechSynthesis;
    this.stop();
    const token = this.token;

    const voices = await this.waitForVoices(synth);
    if (this.token !== token) return false;

    const voice = this.pickVoice(voices, lang);
    // The platform knows about voices but has none for this language. Reading Uthmani
    // script with, say, an English voice produces sounds that are not the Quran, so this
    // reports failure and lets the caller explain rather than playing something wrong.
    if (voices.length > 0 && !voice) return false;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.85;
    if (voice) utterance.voice = voice;

    this.utterance = utterance;
    this.currentKey = key;
    this.currentKind = 'speech';
    this.emit();

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const guardMs = Math.min(MAX_SPEECH_MS, Math.max(6_000, text.length * 90));
      const guard = setTimeout(() => finish(false), guardMs);

      function finish(spoke: boolean): void {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        resolve(spoke);
      }

      utterance.onend = () => finish(true);
      // A synthesizer with no usable voice for the language fires `error` immediately;
      // reporting that lets callers fall back or explain.
      utterance.onerror = () => finish(false);

      const cleanup = (): void => {
        if (this.utterance === utterance) {
          this.utterance = null;
          this.currentKey = null;
          this.currentKind = null;
          this.emit();
        }
      };

      utterance.addEventListener('end', cleanup);
      utterance.addEventListener('error', cleanup);

      try {
        synth.speak(utterance);
      } catch {
        cleanup();
        finish(false);
      }
    });
  };

  /**
   * Waits briefly for the platform to publish its voices.
   *
   * Chrome returns an empty list until well after first paint and then fires
   * `voiceschanged`, so reading the list once at call time found no Arabic voice even on
   * machines that had one.
   */
  private waitForVoices(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
    const immediate = synth.getVoices();
    if (immediate.length > 0) return Promise.resolve(immediate);

    return new Promise<SpeechSynthesisVoice[]>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        synth.removeEventListener('voiceschanged', finish);
        resolve(synth.getVoices());
      };
      const timer = setTimeout(finish, VOICE_WAIT_MS);
      synth.addEventListener('voiceschanged', finish);
    });
  }

  /** Prefers an exact locale match, then any voice for the same base language. */
  private pickVoice(voices: readonly SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | null {
    const wanted = lang.toLowerCase();
    const base = wanted.split('-')[0];

    return (
      voices.find((voice) => voice.lang.toLowerCase() === wanted) ??
      voices.find((voice) => voice.lang.toLowerCase().startsWith(base)) ??
      null
    );
  }
}

export const previewAudio = new PreviewAudioController();
