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
      case 'Sparkles': return <Sparkles className="w-5 h-5 text-secondary" />;
      case 'BookOpen': return <BookOpen className="w-5 h-5 text-primary" />;
      case 'Heart': return <Heart className="w-5 h-5 text-danger" />;
      case 'Flame': return <Flame className="w-5 h-5 text-secondary" />;
      case 'Award': return <Award className="w-5 h-5 text-primary" />;
      default: return <Award className="w-5 h-5 text-primary" />;
    }
  };

  const unlockedCount = achievements.filter(a => a.unlocked).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div 
        id="achievement-modal" 
        className="bg-card border border-border rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary-subtle flex items-center justify-center">
              <Award className="w-5 h-5 text-secondary-strong" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Achievements & Badges</h2>
              <p className="text-xs text-muted-foreground">
                {unlockedCount} of {achievements.length} unlocked • {totalXp} XP earned
              </p>
            </div>
          </div>
          <button
            id="close-achievement-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
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
                  ? 'bg-primary-subtle/50 border-primary/40'
                  : 'bg-surface border-border opacity-75'
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                ach.unlocked ? 'bg-card shadow-xs' : 'bg-surface-muted opacity-60'
              }`}>
                {getIcon(ach.icon)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    {ach.name}
                    {ach.unlocked && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                  </h4>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-secondary-subtle text-secondary-strong shrink-0">
                    +{ach.xpReward} XP
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{ach.description}</p>

                {/* Progress bar */}
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 bg-surface-muted h-1 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        ach.unlocked ? 'bg-primary' : 'bg-secondary'
                      }`}
                      style={{ width: `${ach.progress}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground font-medium">{Math.round(ach.progress)}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
