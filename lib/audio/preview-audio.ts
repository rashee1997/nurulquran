/**
 * Single-playback arbitration for one-off recitation and pronunciation previews.
 *
 * Previously every call site did `new Audio(url)` and never released the element,
 * so navigating away left recitation playing with no controls, and repeated taps
 * stacked overlapping playback. This controller keeps at most one preview alive,
 * always releases the element, and exposes its state so UIs can show play/pause
 * accurately instead of tracking a parallel boolean.
 */

type Listener = () => void;

export type PreviewPlaybackKind = 'audio' | 'speech';

class PreviewAudioController {
  private audio: HTMLAudioElement | null = null;
  private utterance: SpeechSynthesisUtterance | null = null;
  private listeners = new Set<Listener>();
  private currentKey: string | null = null;
  private currentKind: PreviewPlaybackKind | null = null;

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
    this.releaseAudio();
    this.releaseSpeech();
    if (this.currentKey !== null || this.currentKind !== null) {
      this.currentKey = null;
      this.currentKind = null;
      this.emit();
    }
  };

  /**
   * Plays a single audio URL. Any previous preview is stopped first.
   * Resolves `true` when the clip played to completion, `false` when the source
   * failed to load or playback was blocked — callers use that to fall back to the
   * pronunciation synthesizer instead of leaving the learner in silence.
   */
  play = (key: string, url: string): Promise<boolean> => {
    if (typeof window === 'undefined') return Promise.resolve(false);

    this.stop();

    const audio = new Audio(url);
    audio.preload = 'auto';
    this.audio = audio;
    this.currentKey = key;
    this.currentKind = 'audio';
    this.emit();

    return new Promise<boolean>((resolve) => {
      const finish = (played: boolean): void => {
        if (this.audio === audio) {
          this.releaseAudio();
          this.currentKey = null;
          this.currentKind = null;
          this.emit();
        }
        resolve(played);
      };

      audio.onended = () => finish(true);
      audio.onerror = () => finish(false);
      audio.play().catch(() => finish(false));
    });
  };

  /** True while a preview is currently audible. */
  isActive = (): boolean => this.currentKey !== null;

  /**
   * Speaks text via the platform synthesizer, used when no recorded audio exists.
   * Resolves when speech ends or errors.
   */
  speak = (key: string, text: string, lang = 'ar-SA'): Promise<boolean> => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return Promise.resolve(false);
    }

    this.stop();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.85;
    this.utterance = utterance;
    this.currentKey = key;
    this.currentKind = 'speech';
    this.emit();

    return new Promise<boolean>((resolve) => {
      const finish = (spoke: boolean): void => {
        if (this.utterance === utterance) {
          this.utterance = null;
          this.currentKey = null;
          this.currentKind = null;
          this.emit();
        }
        resolve(spoke);
      };

      utterance.onend = () => finish(true);
      // A synthesizer with no installed voice for the language fires `error`
      // immediately; reporting that lets callers fall back to a tone.
      utterance.onerror = () => finish(false);
      window.speechSynthesis.speak(utterance);
    });
  };
}

export const previewAudio = new PreviewAudioController();
