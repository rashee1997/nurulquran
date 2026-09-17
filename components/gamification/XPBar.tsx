'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';

interface XPBarProps {
  currentXp: number;
  nextLevelXp: number;
  level: number;
  title: string;
}

export const XPBar: React.FC<XPBarProps> = ({ currentXp, nextLevelXp, level, title }) => {
  const percentage = Math.min(100, Math.max(0, Math.round((currentXp / nextLevelXp) * 100)));

  return (
    <div id="xp-bar-container" className="flex items-center gap-3 bg-card/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-border shadow-xs">
      <div className="flex items-center gap-1.5 text-primary font-semibold text-xs tracking-tight">
        <div className="w-5 h-5 rounded-full bg-primary-subtle flex items-center justify-center text-primary-strong">
          <Sparkles className="w-3 h-3" />
        </div>
        <span>Lvl {level}</span>
      </div>

      <div className="flex flex-col w-24 sm:w-32">
        <div className="flex justify-between items-center text-[10px] text-muted-foreground font-medium mb-0.5">
          <span className="truncate max-w-[80px]">{title}</span>
          <span>{percentage}%</span>
        </div>
        <div className="w-full bg-surface-muted h-1.5 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
};
