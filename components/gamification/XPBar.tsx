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
    <div id="xp-bar-container" className="flex items-center gap-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-emerald-100 dark:border-emerald-900/40 shadow-xs">
      <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold text-xs tracking-tight">
        <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
          <Sparkles className="w-3 h-3" />
        </div>
        <span>Lvl {level}</span>
      </div>

      <div className="flex flex-col w-24 sm:w-32">
        <div className="flex justify-between items-center text-[10px] text-slate-500 dark:text-slate-400 font-medium mb-0.5">
          <span className="truncate max-w-[80px]">{title}</span>
          <span>{percentage}%</span>
        </div>
        <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
          <div
            className="h-full bg-linear-to-r from-emerald-500 to-amber-400 transition-all duration-500 ease-out rounded-full"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
};
