'use client';

import React from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Flame, 
  Timer, 
  Volume2, 
  VolumeX, 
  RotateCcw, 
  Sparkles,
  Trophy
} from 'lucide-react';
import { VerificationSeal } from './VerificationSeal';

interface GameHUDProps {
  gameTitle: string;
  surahNumber: number;
  surahName: string;
  ayahNumber?: number;
  score: number;
  combo: number;
  elapsedSeconds: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onRestart: () => void;
  onPlayRecitation?: () => void;
  hasAudioRecitation?: boolean;
  progressText?: string;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  gameTitle,
  surahNumber,
  surahName,
  ayahNumber,
  score,
  combo,
  elapsedSeconds,
  soundEnabled,
  onToggleSound,
  onRestart,
  onPlayRecitation,
  hasAudioRecitation = false,
  progressText,
}) => {
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="w-full flex flex-col gap-2 mb-4">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card/70 backdrop-blur-md p-3 rounded-2xl border border-border">
        {/* Left: Back & Title */}
        <div className="flex items-center gap-3">
          <Link
            href="/games"
            className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Back to Mini-Games Arcade"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <div>
            <h1 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
              <span>{gameTitle}</span>
              {progressText && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  {progressText}
                </span>
              )}
            </h1>
            <div className="mt-0.5">
              <VerificationSeal
                surahNumber={surahNumber}
                surahName={surahName}
                ayahNumber={ayahNumber}
              />
            </div>
          </div>
        </div>

        {/* Right: Metrics & Controls */}
        <div className="flex items-center gap-2 sm:gap-4 ml-auto">
          {/* Combo Multiplier */}
          {combo > 1 && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-extrabold text-xs animate-bounce">
              <Flame className="w-3.5 h-3.5 fill-amber-500" />
              <span>{combo}x COMBO</span>
            </div>
          )}

          {/* Score */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card border border-border text-foreground font-bold text-xs sm:text-sm shadow-xs">
            <Trophy className="w-4 h-4 text-primary" />
            <span>{score}</span>
            <span className="text-[10px] text-muted-foreground font-normal">PTS</span>
          </div>

          {/* Timer */}
          <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-muted/60 text-muted-foreground text-xs font-mono">
            <Timer className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{formatTime(elapsedSeconds)}</span>
          </div>

          {/* Recitation Audio Button */}
          {hasAudioRecitation && onPlayRecitation && (
            <button
              onClick={onPlayRecitation}
              type="button"
              className="p-2 rounded-xl border border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              title="Play verse audio recitation"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          )}

          {/* Sound Toggle */}
          <button
            onClick={onToggleSound}
            type="button"
            className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title={soundEnabled ? 'Mute Game SFX' : 'Enable Game SFX'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Restart */}
          <button
            onClick={onRestart}
            type="button"
            className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Restart Challenge"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
