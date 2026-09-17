'use client';

import React from 'react';
import { Award, BookOpen, Flame, Heart, Sparkles, X, CheckCircle2 } from 'lucide-react';
import { Achievement } from '@/lib/learning/xp-engine';

interface AchievementModalProps {
  isOpen: boolean;
  onClose: () => void;
  achievements: Achievement[];
  totalXp: number;
}

export const AchievementModal: React.FC<AchievementModalProps> = ({
  isOpen,
  onClose,
  achievements,
  totalXp,
}) => {
  if (!isOpen) return null;

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Sparkles': return <Sparkles className="w-5 h-5 text-amber-500" />;
      case 'BookOpen': return <BookOpen className="w-5 h-5 text-emerald-500" />;
      case 'Heart': return <Heart className="w-5 h-5 text-rose-500" />;
      case 'Flame': return <Flame className="w-5 h-5 text-orange-500" />;
      case 'Award': return <Award className="w-5 h-5 text-purple-500" />;
      default: return <Award className="w-5 h-5 text-emerald-500" />;
    }
  };

  const unlockedCount = achievements.filter(a => a.unlocked).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div 
        id="achievement-modal" 
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
              <Award className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Achievements & Badges</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {unlockedCount} of {achievements.length} unlocked • {totalXp} XP earned
              </p>
            </div>
          </div>
          <button
            id="close-achievement-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="p-6 overflow-y-auto space-y-3">
          {achievements.map((ach) => (
            <div
              key={ach.id}
              className={`p-3.5 rounded-xl border transition-all flex items-start gap-3.5 ${
                ach.unlocked
                  ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/50'
                  : 'bg-slate-50/50 dark:bg-slate-800/20 border-slate-200 dark:border-slate-800 opacity-75'
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                ach.unlocked ? 'bg-white dark:bg-slate-800 shadow-xs' : 'bg-slate-200 dark:bg-slate-700 opacity-60'
              }`}>
                {getIcon(ach.icon)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    {ach.name}
                    {ach.unlocked && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                  </h4>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 shrink-0">
                    +{ach.xpReward} XP
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{ach.description}</p>

                {/* Progress bar */}
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 bg-slate-200 dark:bg-slate-700 h-1 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        ach.unlocked ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${ach.progress}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">{Math.round(ach.progress)}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
