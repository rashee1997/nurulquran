'use client';

/**
 * Local coaching audio.
 *
 * Scripture-accuracy constraint, enforced here: Arabic recitation feedback is NEVER synthesized.
 * Mispronounced-word corrections play the authentic recorded clip from the QuranCDN word-by-word
 * CDN (`audio.qurancdn.com/wbw/SSS_AAA_WWW.mp3`, verified `access-control-allow-origin: *`),
 * cached by the existing service worker audio cache. Only Tamil/English *coaching speech*
 * (never Quranic text) is spoken, and it goes through `previewAudio`, which prefers the learner's
 * on-device Piper voice and falls back to the platform synthesizer.
 *
 * That routing replaced a direct `speechSynthesis.speak` call. The platform synthesizer has no
 * Tamil voice on most desktops — so Tamil cues were silent on exactly the audience this app is
 * built for — and calling it directly also bypassed playback arbitration, letting a cue talk over
 * a word clip that was still playing.
 */

import { previewAudio } from './preview-audio';

/** Zero-padded helpers for the QuranCDN word-clip naming scheme (001_001_001.mp3). */
function pad3(value: number): string {
  return value.toString().padStart(3, '0');
}

export function wordClipUrl(verseKey: string, wordIndex: number): string {
  const [surah, ayah] = verseKey.split(':').map((part) => Number.parseInt(part, 10));
  return `https://audio.qurancdn.com/wbw/${pad3(surah ?? 0)}_${pad3(ayah ?? 0)}_${pad3(wordIndex + 1)}.mp3`;
}

export function ayahAudioUrl(verseKey: string, reciter = 'Alafasy_128kbps'): string {
  const [surah, ayah] = verseKey.split(':').map((part) => Number.parseInt(part, 10));
  return `https://everyayah.com/data/${reciter}/${pad3(surah ?? 0)}${pad3(ayah ?? 0)}.mp3`;
}

/** The clip currently playing, so a second tap supersedes the first instead of layering on it. */
let activeClip: HTMLAudioElement | null = null;

/** Releases a clip and detaches its handlers so the element can be collected. */
function releaseClip(audio: HTMLAudioElement | null): void {
  if (!audio) return;
  audio.onended = null;
  audio.onerror = null;
  try {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  } catch {
    // Already detached or disposed.
  }
}

/**
 * Plays an authentic recitation clip; resolves when playback finishes (or fails cleanly).
 *
 * Two corrections over the original:
 *
 *  1. **No `crossOrigin`.** The attribute was set to `'anonymous'`, which turns a plain media
 *     load into a CORS request. It is only needed to read samples through the Web Audio API,
 *     which this path never does — and these clips come from more than one host, so a host that
 *     does not answer with `Access-Control-Allow-Origin` made playback fail with a media error
 *     that the bare `catch` swallowed into silence. Plain playback has no such requirement.
 *  2. **The element is released, and only one plays at a time.** Every call used to leak its
 *     element and stack on top of whatever was already playing, so repeated taps on a word
 *     produced overlapping recitation with no way to stop it.
 */
export async function playReferenceClip(url: string): Promise<void> {
  releaseClip(activeClip);
  activeClip = null;

  let audio: HTMLAudioElement | null = null;
  try {
    audio = new Audio(url);
    activeClip = audio;
    await audio.play();

    const element = audio;
    await new Promise<void>((resolve) => {
      element.onended = () => resolve();
      element.onerror = () => resolve();
    });
  } catch {
    // Offline without a cached clip, or the browser refused playback: fail silently — the UI
    // already shows the word state.
  } finally {
    if (activeClip === audio) activeClip = null;
    releaseClip(audio);
  }
}

/**
 * Speaks a coaching cue in Tamil or English.
 *
 * Fire-and-forget by design: the learner already sees the cue text, so a device that cannot speak
 * it loses the audio without losing the correction. Failures are swallowed here rather than
 * surfaced, and the controller reports details through `localVoiceStatus` when they need
 * diagnosing.
 */
export function speakCoachCue(lang: 'ta' | 'en', text: string): void {
  if (typeof window === 'undefined' || text.length === 0) return;
  void previewAudio
    .speak(`coach-cue:${lang}`, text, lang === 'ta' ? 'ta-IN' : 'en-US')
    .catch(() => undefined);
}
