/**
 * Single containment seam for legacy `webkitAudioContext`.
 *
 * Safari's prefixed constructor is absent from every DOM lib, so one documented
 * `as unknown as` cast lives here and nowhere else: the seven call sites that used to
 * repeat this pattern (capture-engine, pcm-audio ×2, alphabet-audio, audio-synth,
 * use-gemini-live-tafsir, use-live-tajweed) now call `resolveAudioContextConstructor()`.
 * The runtime check `window.AudioContext ||` keeps the cast unreachable on every modern
 * browser, including current Safari which serves the standard constructor.
 */
export function resolveAudioContextConstructor(): typeof AudioContext {
  if (typeof window === 'undefined') {
    throw new Error('AudioContext is only available in a browser runtime.');
  }
  const standard = window.AudioContext;
  if (standard) return standard;
  const legacy = (
    window as unknown as { webkitAudioContext?: typeof AudioContext }
  ).webkitAudioContext;
  if (legacy) return legacy;
  throw new Error('This browser does not expose an AudioContext implementation.');
}
