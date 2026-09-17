'use client';

import React from 'react';
import { TajweedSegment } from '@/lib/quran/types';
import { TAJWEED_META } from '@/lib/quran/tajweed';

interface TajweedSpanProps {
  segment: TajweedSegment;
  enabled?: boolean;
}

/**
 * Colours a single Tajweed segment.
 *
 * Rendering stays strictly *inline*: no `inline-block`, no padding, no margins.
 * Arabic letters join contextually across span boundaries, so any box-model change
 * here breaks letter shaping mid-word and clips diacritics.
 */
export const TajweedSpan: React.FC<TajweedSpanProps> = ({ segment, enabled = true }) => {
  if (!enabled || !segment.rule) {
    return <span>{segment.text}</span>;
  }

  const meta = TAJWEED_META[segment.rule];
  const colorClass = meta?.colorClass ?? 'text-primary';

  return (
    <span
      className={`${colorClass} transition-colors duration-150`}
      title={`${meta?.name ?? segment.ruleName ?? segment.rule}: ${meta?.description ?? ''}`}
    >
      {segment.text}
    </span>
  );
};
