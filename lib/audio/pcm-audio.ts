/**
 * Real-Time Web Audio PCM Pipeline for Gemini Live Tajweed Coaching
 * Handles 16kHz Linear PCM mono recording, downsampling, base64 framing,
 * and gapless 24kHz PCM scheduled playback.
 */

// Audio sample rate constraints
export const RECORDING_SAMPLE_RATE = 16000; // Gemini Live expects 16kHz Mono PCM
export const PLAYBACK_SAMPLE_RATE = 24000;  // Gemini Live returns 24kHz Mono PCM

/**
 * Converts standard Web Audio Float32 samples (-1.0 to +1.0) into 16-bit signed PCM integers (-32768 to +32767).
 */
export function convertFloat32ToInt16PCM(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16Array;
}

/**
 * Resamples an audio buffer from an arbitrary input sample rate (e.g., 44.1kHz or 48kHz)
 * down to the target sample rate (e.g., 16kHz) using linear interpolation.
 */
export function downsampleBuffer(
  buffer: Float32Array,
  inputSampleRate: number,
  targetSampleRate: number = RECORDING_SAMPLE_RATE
): Float32Array {
  if (inputSampleRate === targetSampleRate) {
    return buffer;
  }
  if (inputSampleRate < targetSampleRate) {
    return buffer; // Up-sampling not required for voice recording
  }

  const sampleRatio = inputSampleRate / targetSampleRate;
  const newLength = Math.round(buffer.length / sampleRatio);
  const result = new Float32Array(newLength);

  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

/**
 * Encodes an ArrayBuffer or Uint8Array into a Base64 string for WebSocket or API transmission.
 */
export function arrayBufferToBase64(buffer: ArrayBufferLike | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 0x8000; // 32KB chunks to prevent stack overflow

  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

/**
 * Decodes a Base64 string into an ArrayBuffer.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const cleanBase64 = base64.replace(/^data:audio\/[a-z0-9]+;base64,/, '');
  const binaryString = atob(cleanBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Computes root-mean-square (RMS) volume and normalizes to 0-100 scale.
 */
export function computeRmsVolume(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sum / samples.length);
  // Logarithmic conversion to human perceived loudness (0 to 100)
  return Math.min(100, Math.round(Math.max(0, 20 * Math.log10(rms + 1e-6) + 60) * (100 / 60)));
}

/**
 * Gapless AudioContext Stream Player for Gemini Live 24kHz / 16kHz PCM audio responses.
 * Queues chunks seamlessly on the audio timeline, preventing stuttering and clicks.
 */
export class PCMAudioStreamPlayer {
  private audioCtx: AudioContext | null = null;
  private nextStartTime: number = 0;
  private isPlaying: boolean = false;
  private activeSourceNodes: AudioBufferSourceNode[] = [];
  private sampleRate: number;
  private gainNode: GainNode | null = null;

  constructor(sampleRate: number = PLAYBACK_SAMPLE_RATE) {
    this.sampleRate = sampleRate;
  }

  private ensureContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioContextClass({ sampleRate: this.sampleRate });
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.connect(this.audioCtx.destination);
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * Schedules a raw PCM 16-bit signed integer buffer for gapless playback.
   */
  public queuePCM16Chunk(pcmData: Int16Array | ArrayBuffer): void {
    const ctx = this.ensureContext();
    const int16Array = pcmData instanceof Int16Array ? pcmData : new Int16Array(pcmData);

    if (int16Array.length === 0) return;

    // Convert Int16 back to Float32 for Web Audio AudioBuffer
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }

    const audioBuffer = ctx.createBuffer(1, float32Array.length, this.sampleRate);
    audioBuffer.copyToChannel(float32Array, 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;

    if (this.gainNode) {
      source.connect(this.gainNode);
    } else {
      source.connect(ctx.destination);
    }

    const currentTime = ctx.currentTime;
    // Schedule gaplessly: if timeline fell behind, jump to now + 20ms cushion
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime + 0.02;
    }

    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
    this.isPlaying = true;
    this.activeSourceNodes.push(source);

    source.onended = () => {
      const idx = this.activeSourceNodes.indexOf(source);
      if (idx !== -1) {
        this.activeSourceNodes.splice(idx, 1);
      }
      if (this.activeSourceNodes.length === 0) {
        this.isPlaying = false;
      }
    };
  }

  /**
   * Stops all active audio immediately (e.g. when user interrupts or starts speaking).
   */
  public stopAll(): void {
    for (const source of this.activeSourceNodes) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Ignored if already stopped
      }
    }
    this.activeSourceNodes = [];
    this.isPlaying = false;
    if (this.audioCtx) {
      this.nextStartTime = this.audioCtx.currentTime;
    }
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public close(): void {
    this.stopAll();
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}

/**
 * Pre-defined Voice Profiles for Gemini Live AI Tajweed Teacher
 */
export interface AITeacherVoice {
  id: string;
  name: string;
  gender: 'female' | 'male';
  toneEn: string;
  toneTa: string;
  geminiVoiceName: string;
  baseFreq: number; // For client audio preview harmonic synthesis
  vowelMod: number;
}

export const AI_TEACHER_VOICES: AITeacherVoice[] = [
  {
    id: 'Kore',
    name: 'Kore',
    gender: 'female',
    toneEn: 'Warm, articulate, balanced female tone',
    toneTa: 'கனிவான, தெளிவான, சமநிலையான குரல்',
    geminiVoiceName: 'Kore',
    baseFreq: 220, // A3
    vowelMod: 1.2,
  },
  {
    id: 'Zephyr',
    name: 'Zephyr',
    gender: 'female',
    toneEn: 'Gentle, calm, resonant contemplative tone',
    toneTa: 'மென்மையான, அமைதியான, ஆழ்ந்த குரல்',
    geminiVoiceName: 'Zephyr',
    baseFreq: 196, // G3
    vowelMod: 1.0,
  },
  {
    id: 'Puck',
    name: 'Puck',
    gender: 'male',
    toneEn: 'Energetic, friendly, engaging tone',
    toneTa: 'உற்சாகமான, நட்பான, சுறுசுறுப்பான குரல்',
    geminiVoiceName: 'Puck',
    baseFreq: 146.83, // D3
    vowelMod: 1.3,
  },
  {
    id: 'Fenrir',
    name: 'Fenrir',
    gender: 'male',
    toneEn: 'Authoritative, classical, traditional Qari tone',
    toneTa: 'கம்பீரமான, பாரம்பரிய காரி போன்ற குரல்',
    geminiVoiceName: 'Fenrir',
    baseFreq: 123.47, // B2
    vowelMod: 0.9,
  },
  {
    id: 'Charon',
    name: 'Charon',
    gender: 'male',
    toneEn: 'Deep, steady, measured baritone tone',
    toneTa: 'ஆழமான, நிதானமான, கம்பீரமான குரல்',
    geminiVoiceName: 'Charon',
    baseFreq: 110, // A2
    vowelMod: 0.8,
  },
];

/**
 * Plays an authentic spoken speech preview using the real Gemini Live TTS API (`gemini-3.1-flash-tts-preview`).
 * Plays via the high-fidelity 24kHz PCMAudioStreamPlayer.
 * Seamlessly falls back to the harmonic overtone preview if offline or server API key is absent.
 */
let activePreviewPlayer: PCMAudioStreamPlayer | null = null;

export async function playVoiceHarmonicPreview(voiceId: string, customPhrase?: string): Promise<void> {
  if (typeof window === 'undefined') return;

  // Stop any currently active preview playback
  if (activePreviewPlayer) {
    activePreviewPlayer.stopAll();
    activePreviewPlayer.close();
    activePreviewPlayer = null;
  }

  try {
    const res = await fetch('/api/tajweed/voice-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voiceId, customText: customPhrase }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.audioBase64) {
        const pcmArrayBuffer = base64ToArrayBuffer(data.audioBase64);
        const player = new PCMAudioStreamPlayer(data.sampleRate || 24000);
        activePreviewPlayer = player;
        player.queuePCM16Chunk(pcmArrayBuffer);
        return;
      }
    }
  } catch (err) {
    console.warn('Gemini TTS preview API call failed, using acoustic fallback:', err);
  }

  // Fallback to harmonic cadence preview if network/API unavailable
  const voice = AI_TEACHER_VOICES.find((v) => v.id === voiceId) || AI_TEACHER_VOICES[0];
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioContextClass();

  const now = ctx.currentTime;
  const notes = [
    { freq: voice.baseFreq, dur: 0.28 },
    { freq: voice.baseFreq * 1.25, dur: 0.32 },
    { freq: voice.baseFreq * 1.5, dur: 0.4 },
    { freq: voice.baseFreq * 1.33, dur: 0.45 },
  ];

  let noteTime = now + 0.05;

  for (const n of notes) {
    const osc = ctx.createOscillator();
    const subOsc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    // Warm formant filter
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(voice.gender === 'female' ? 2400 : 1600, noteTime);

    osc.type = voice.gender === 'female' ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(n.freq, noteTime);

    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(n.freq * 2, noteTime);

    // ADSR Envelope
    gain.gain.setValueAtTime(0.001, noteTime);
    gain.gain.exponentialRampToValueAtTime(0.25, noteTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, noteTime + n.dur);

    osc.connect(filter);
    subOsc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(noteTime);
    subOsc.start(noteTime);
    osc.stop(noteTime + n.dur);
    subOsc.stop(noteTime + n.dur);

    noteTime += n.dur * 0.85;
  }

  setTimeout(() => {
    ctx.close().catch(() => {});
  }, (noteTime - now + 0.5) * 1000);
}

