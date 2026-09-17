'use client';

import React from 'react';
import { TajweedSegment } from '@/lib/quran/types';
import { TAJWEED_META } from '@/lib/quran/tajweed';

interface TajweedSpanProps {
  segment: TajweedSegment;
  enabled?: boolean;
}

export const TajweedSpan: React.FC<TajweedSpanProps> = ({ segment, enabled = true }) => {
  if (!enabled || !segment.rule) {
    return <span>{segment.text}</span>;
  }

  const meta = TAJWEED_META[segment.rule];
  const colorClass = meta?.colorClass || 'text-emerald-600';

  return (
    <span
      className={`${colorClass} transition-colors cursor-help inline-block px-0.5`}
      title={`${meta?.name || segment.ruleName}: ${meta?.description || ''}`}
    >
      {segment.text}
    </span>
  );
};
