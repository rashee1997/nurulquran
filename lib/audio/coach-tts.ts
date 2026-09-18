'use client';

/**
 * Local coaching audio.
 *
 * Scripture-accuracy constraint, enforced here: Arabic recitation feedback is NEVER synthesized.
 * Mispronounced-word corrections play the authentic recorded clip from the QuranCDN word-by-word
 * CDN (`audio.qurancdn.com/wbw/SSS_AAA_WWW.mp3`, verified `access-control-allow-origin: *`),
 * cached by the existing service worker audio cache. Only Tamil/English *coaching speech*
 * (never Quranic text) goes through `SpeechSynthesis`, which needs zero downloaded megabytes.
 */

/** Zero-padded helpers for the QuranCDN word-clip naming scheme (001_001_001.mp3). */
function pad3(value: number): string {
  return value.toString().padStart(3, '0');
}

export function wordClipUrl(verseKey: string, wordIndex: number): string {
  const [surah, ayah] = verseKey.split(':').map((part) => Number.parseInt(part, 10));
  return `https://audio.qurancdn.com/wbw/${pad3(surah)}_${pad3(ayah)}_${pad3(wordIndex + 1)}.mp3`;
}

export function ayahAudioUrl(verseKey: string, reciter = 'Alafasy_128kbps'): string {
  const [surah, ayah] = verseKey.split(':').map((part) => Number.parseInt(part, 10));
  return `https://everyayah.com/data/${reciter}/${pad3(surah)}${pad3(ayah)}.mp3`;
}

/** Plays an authentic recitation clip; resolves when playback finishes (or fails cleanly). */
export async function playReferenceClip(url: string): Promise<void> {
  try {
    const audio = new Audio(url);
    audio.crossOrigin = 'anonymous';
    await audio.play();
    return new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
    });
  } catch {
    // Offline without a cached clip: fail silently — the UI already shows the word state.
  }
}

/**
 * Speaks a coaching cue in Tamil or English.
 *
 * Voices are chosen defensively: Tamil TTS voices are rare on desktop, so the call resolves
 * even when no matching voice exists (the learner still sees the cue text in the UI).
 */
export function speakCoachCue(lang: 'ta' | 'en', text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || text.length === 0) return;
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'ta' ? 'ta-IN' : 'en-US';
    utterance.rate = 0.95;
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find((voice) => voice.lang.startsWith(lang === 'ta' ? 'ta' : 'en'));
    if (match) utterance.voice = match;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech synthesis is best-effort; never let it break the session.
  }
}
