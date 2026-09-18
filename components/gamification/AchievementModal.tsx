'use client';

import React from 'react';
import { Award, BookOpen, Flame, Heart, Sparkles, CheckCircle2 } from 'lucide-react';
import { Achievement } from '@/lib/learning/xp-engine';
import { Modal } from '@/components/system/Modal';

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
  const getIcon = (iconName: string): React.ReactNode => {
    switch (iconName) {
      case 'Sparkles': return <Sparkles className="w-5 h-5 text-secondary" />;
      case 'BookOpen': return <BookOpen className="w-5 h-5 text-primary" />;
      case 'Heart': return <Heart className="w-5 h-5 text-danger" />;
      case 'Flame': return <Flame className="w-5 h-5 text-secondary" />;
      case 'Award': return <Award className="w-5 h-5 text-primary" />;
      default: return <Award className="w-5 h-5 text-primary" />;
    }
  };

  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      label="Achievements & Badges"
      title={`Achievements & Badges`}
    >
      <div className="px-6 py-4 bg-surface border-b border-border text-xs text-muted-foreground">
        {unlockedCount} of {achievements.length} unlocked • {totalXp} XP earned
      </div>
      <div className="p-6 space-y-3">
        {achievements.map((ach) => (
          <div
            key={ach.id}
            className={`p-3.5 rounded-xl border transition-colors flex items-start gap-3.5 ${
              ach.unlocked
                ? 'bg-primary-subtle/50 border-primary/40'
                : 'bg-surface border-border opacity-75'
            }`}
          >
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                ach.unlocked ? 'bg-card shadow-xs' : 'bg-surface-muted opacity-60'
              }`}
            >
              {getIcon(ach.icon)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  {ach.name}
                  {ach.unlocked && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                </h3>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-secondary-subtle text-secondary-strong shrink-0">
                  +{ach.xpReward} XP
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{ach.description}</p>

              <div className="mt-2 flex items-center gap-2">
                <div
                  className="flex-1 bg-surface-muted h-1 rounded-full overflow-hidden"
                  role="progressbar"
                  aria-valuenow={Math.round(ach.progress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${ach.name} progress`}
                >
                  <div
                    className={`h-full rounded-full transition-[width] duration-300 ${
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
    </Modal>
  );
};
