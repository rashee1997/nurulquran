'use client';

import React, { useEffect, useRef, type MutableRefObject } from 'react';

interface VoiceActivityWaveformProps {
  /** Live level 0–100, written by the audio hook. Read, never rendered through. */
  levelRef: MutableRefObject<number>;
  /** Whether audio is flowing at all; a still waveform reads as "microphone is off". */
  isActive: boolean;
  /** True when the child has silenced their microphone but the coach is still speaking. */
  isMuted?: boolean;
  className?: string;
}

const BAR_COUNT = 28;
/** How much of the previous frame's height is kept. Higher is smoother, slower to react. */
const SMOOTHING = 0.72;
const BAR_COLOURS = { loud: '#10b981', muted: '#64748b', idle: '#94a3b8' } as const;

/**
 * Voice activity meter.
 *
 * Drawn on a canvas from a `requestAnimationFrame` loop that reads a ref, so the meter
 * animates at display rate without a single React render — the same approach the Tajweed
 * coach uses. Rendering bars as DOM nodes would push ~60 reconciliations a second through
 * the tree that also hosts the reader and the transcript.
 *
 * Heights are smoothed and each bar is offset through the level history, which produces a
 * travelling wave rather than a bar chart that snaps.
 */
export const VoiceActivityWaveform: React.FC<VoiceActivityWaveformProps> = ({
  levelRef,
  isActive,
  isMuted = false,
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));
  const smoothedRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    let frame = 0;
    let disposed = false;

    /**
     * `roundRect` is absent in older Safari. Feature-detected once rather than per frame:
     * calling a missing method inside the loop would throw on every animation frame and take
     * the whole meter down with it.
     */
    const canRoundRect = typeof context.roundRect === 'function';

    const resize = (): void => {
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const draw = (): void => {
      if (disposed) return;

      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const centre = height / 2;

      const raw = isActive ? levelRef.current : 0;
      smoothedRef.current = smoothedRef.current * SMOOTHING + raw * (1 - SMOOTHING);

      const history = historyRef.current;
      history.push(smoothedRef.current);
      if (history.length > BAR_COUNT) history.shift();

      const colour = !isActive ? BAR_COLOURS.idle : isMuted ? BAR_COLOURS.muted : BAR_COLOURS.loud;

      context.clearRect(0, 0, width, height);

      const slot = width / BAR_COUNT;
      const barWidth = Math.max(2, slot * 0.42);

      for (let index = 0; index < BAR_COUNT; index += 1) {
        // Older samples sit further from the centre, so the wave travels outward.
        const sample = history[index] ?? 0;
        const distanceFalloff = 1 - Math.abs(index - BAR_COUNT / 2) / (BAR_COUNT / 1.6);
        const amplitude = Math.max(0.04, (sample / 100) * distanceFalloff);
        const barHeight = Math.max(3, amplitude * height * 0.9);

        const x = index * slot + (slot - barWidth) / 2;
        const top = centre - barHeight / 2;

        context.fillStyle = colour;
        context.globalAlpha = isActive ? 0.95 : 0.45;

        if (canRoundRect) {
          context.beginPath();
          context.roundRect(x, top, barWidth, barHeight, barWidth / 2);
          context.fill();
        } else {
          context.fillRect(x, top, barWidth, barHeight);
        }
      }

      context.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [isActive, isMuted, levelRef]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      role="presentation"
    />
  );
};
