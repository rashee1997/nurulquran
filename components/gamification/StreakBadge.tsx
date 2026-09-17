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
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary-subtle border border-secondary/30 text-secondary-strong text-xs font-semibold hover:bg-secondary-subtle/80 transition-colors shadow-xs"
      title={`${streak} Day Learning Streak! Keep going every day to preserve it.`}
    >
      <Flame className="w-4 h-4 text-secondary fill-secondary animate-pulse" />
      <span>{streak} {streak === 1 ? 'day' : 'days'}</span>
    </button>
  );
};
