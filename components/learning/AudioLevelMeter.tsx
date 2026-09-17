'use client';

import React, { useEffect, useRef, type MutableRefObject } from 'react';

/**
 * Live recording level meter.
 *
 * Reads the RMS level straight from a ref on an animation frame and writes bar
 * heights to the DOM. The previous implementation kept the level in React state and
 * re-rendered the whole coach tree on every audio frame (~21 times per second).
 */

const DEFAULT_FACTORS = [0.4, 0.9, 1.3, 0.7, 1.5, 0.8, 0.5, 1.2] as const;
const MIN_BAR_HEIGHT = 3;

export interface AudioLevelMeterProps {
  levelRef: MutableRefObject<number>;
  /** When false the meter holds a resting height and stops the animation frame. */
  active: boolean;
  factors?: readonly number[];
  maxHeight?: number;
  className?: string;
  barClassName?: string;
}

export const AudioLevelMeter: React.FC<AudioLevelMeterProps> = ({
  levelRef,
  active,
  factors = DEFAULT_FACTORS,
  maxHeight = 18,
  className = 'flex items-center gap-1 h-5',
  barClassName = 'w-1 bg-destructive rounded-full transition-all duration-75',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const bars = Array.from(container.children) as HTMLElement[];

    const applyHeights = (level: number): void => {
      bars.forEach((bar, index) => {
        const factor = factors[index] ?? 1;
        const height = Math.max(MIN_BAR_HEIGHT, Math.min(maxHeight, (level * factor) / 4));
        bar.style.height = `${height}px`;
      });
    };

    applyHeights(active ? levelRef.current : 0);

    if (!active) return;

    let frame = 0;
    const tick = (): void => {
      applyHeights(levelRef.current);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(frame);
  }, [active, factors, levelRef, maxHeight]);

  return (
    <div ref={containerRef} className={className} aria-hidden="true">
      {factors.map((_, index) => (
        <div key={index} className={barClassName} style={{ height: `${MIN_BAR_HEIGHT}px` }} />
      ))}
    </div>
  );
};
