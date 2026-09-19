/**
 * Client-side Web Audio Sound Synthesizer & Recitation Player
 * Generates zero-latency acoustic chimes and harmonics without loading external sound files.
 */

import { previewAudio } from '../audio/preview-audio';
import { resolveAudioContextConstructor } from '../audio/audio-context';

class GameSoundEngine {
  private ctx: AudioContext | null = null;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;

  private initCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    let AudioCtxClass: typeof AudioContext;
    try {
      AudioCtxClass = resolveAudioContextConstructor();
    } catch {
      return null;
    }

    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioCtxClass();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  /**
   * Suspends the audio context once nothing is playing.
   *
   * Every game effect used to leave its context running (and the engine kept one for
   * the whole session), which holds the audio hardware open and keeps the tab marked
   * as "playing audio" long after the last chime.
   */
  private scheduleSuspend(delayMs = 1200): void {
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.suspendTimer = setTimeout(() => {
      if (this.ctx && this.ctx.state === 'running') {
        void this.ctx.suspend().catch(() => undefined);
      }
    }, delayMs);
  }

  playWordTap(): void {
    const ctx = this.initCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.08); // E5
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
    this.scheduleSuspend();
  }

  playCorrectMatch(combo = 1): void {
    const ctx = this.initCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const baseFreq = 587.33 * Math.min(1.5, 1 + (combo - 1) * 0.08); // D5 scaled with combo
    const notes = [baseFreq, baseFreq * 1.25, baseFreq * 1.5];

    notes.forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startAt = now + index * 0.06;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.14, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + 0.26);
    });
    this.scheduleSuspend();
  }

  playWrongWord(): void {
    const ctx = this.initCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(164.81, now); // E3
    osc.frequency.linearRampToValueAtTime(130.81, now + 0.18); // C3
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
    this.scheduleSuspend();
  }

  playLevelComplete(): void {
    const ctx = this.initCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Harmonic progression: C5 -> E5 -> G5 -> C6
    const chord = [523.25, 659.25, 783.99, 1046.5];
    chord.forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startAt = now + index * 0.09;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.18, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + 0.46);
    });
    this.scheduleSuspend();
  }

  /** Plays a verified ayah recitation through the shared single-playback controller. */
  playRecitation(audioUrl?: string): void {
    if (!audioUrl || typeof window === 'undefined') return;
    void previewAudio.play('game-recitation', audioUrl).catch(() => undefined);
  }

  stopRecitation(): void {
    previewAudio.stop();
  }

  /** Releases the audio context entirely (used when a game surface unmounts). */
  dispose(): void {
    if (this.suspendTimer) {
      clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
    }
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx && ctx.state !== 'closed') {
      void ctx.close().catch(() => undefined);
    }
    previewAudio.stop();
  }
}

export const gameAudio = new GameSoundEngine();
