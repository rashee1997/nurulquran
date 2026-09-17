'use client';

import React from 'react';
import { Flame } from 'lucide-react';

interface StreakBadgeProps {
  streak: number;
  onClick?: () => void;
}

export const StreakBadge: React.FC<StreakBadgeProps> = ({ streak, onClick }) => {
  return (
    <button
      id="streak-badge-btn"
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors shadow-xs"
      title={`${streak} Day Learning Streak! Keep going every day to preserve it.`}
    >
      <Flame className="w-4 h-4 text-amber-500 fill-amber-500 animate-pulse" />
      <span>{streak} {streak === 1 ? 'day' : 'days'}</span>
    </button>
  );
};
