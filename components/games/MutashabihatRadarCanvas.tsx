'use client';

import React, { useRef, useEffect, useState } from 'react';
import { MUTASHABIHAT_DATASET, MutashabihEntry } from '@/lib/quran/mutashabihat';
import { CanvasEngine, CanvasParticle, RippleWave } from '@/lib/games/canvas-engine';
import { gameAudio } from '@/lib/games/audio-synth';
import { persistGameCompletion } from '@/lib/games/game-service';
import { GameHUD } from './GameHUD';
import { Radar, Compass, Sparkles, CheckCircle2, ArrowRight, Lightbulb, RefreshCw } from 'lucide-react';

export const MutashabihatRadarCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [combo, setCombo] = useState<number>(1);
  const [maxCombo, setMaxCombo] = useState<number>(1);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [mistakesCount, setMistakesCount] = useState<number>(0);
  const [answeredState, setAnsweredState] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [selectedTarget, setSelectedTarget] = useState<0 | 1 | null>(null);
  const [isFinished, setIsFinished] = useState<boolean>(false);

  // We rotate which target is the question:
  // e.g., "Which verse contains the distinctive token: [token]?"
  const [questionTargetIndex, setQuestionTargetIndex] = useState<0 | 1>(0);

  const currentEntry: MutashabihEntry = MUTASHABIHAT_DATASET[currentIndex] || MUTASHABIHAT_DATASET[0];

  const particlesRef = useRef<CanvasParticle[]>([]);
  const ripplesRef = useRef<RippleWave[]>([]);
  const radarAngleRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  // Timer loop
  useEffect(() => {
    if (isFinished) return;
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isFinished]);

  // Canvas radar animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let isRunning = true;

    const render = () => {
      if (!isRunning) return;
      const width = container.clientWidth || 800;
      const height = 400;
      const setup = CanvasEngine.setupHiDPI(canvas, width, height);
      if (!setup) return;
      const { ctx } = setup;

      const centerX = width / 2;
      const centerY = height / 2;
      const maxRadarRadius = Math.min(width, height) * 0.42;

      ctx.clearRect(0, 0, width, height);

      // Radar background circles
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.15)';
      ctx.lineWidth = 1;
      const rings = [0.25, 0.5, 0.75, 1.0];
      rings.forEach((r) => {
        ctx.beginPath();
        ctx.arc(centerX, centerY, maxRadarRadius * r, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Axis crosshairs
      ctx.beginPath();
      ctx.moveTo(centerX - maxRadarRadius, centerY);
      ctx.lineTo(centerX + maxRadarRadius, centerY);
      ctx.moveTo(centerX, centerY - maxRadarRadius);
      ctx.lineTo(centerX, centerY + maxRadarRadius);
      ctx.stroke();

      // Rotating Radar Sweep Beam
      radarAngleRef.current = (radarAngleRef.current + 0.025) % (Math.PI * 2);
      const angle = radarAngleRef.current;

      const sweepGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxRadarRadius);
      sweepGrad.addColorStop(0, 'rgba(14, 165, 233, 0.4)');
      sweepGrad.addColorStop(1, 'rgba(14, 165, 233, 0.0)');

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, maxRadarRadius, angle - 0.4, angle);
      ctx.closePath();
      ctx.fillStyle = sweepGrad;
      ctx.fill();
      ctx.restore();

      // Radar Sweep Line
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(centerX + Math.cos(angle) * maxRadarRadius, centerY + Math.sin(angle) * maxRadarRadius);
      ctx.stroke();

      // Islamic Geometric 8-Point Compass in Center
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(-angle * 0.5);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.3)';
      ctx.lineWidth = 1;
      for (let s = 0; s < 2; s++) {
        ctx.rotate(Math.PI / 4);
        ctx.strokeRect(-20, -20, 40, 40);
      }
      ctx.restore();

      // Target Satellite Blips: Left Target (Pair 0) and Right Target (Pair 1)
      const targetDist = maxRadarRadius * 0.68;
      const targets = [
        { x: centerX - targetDist, y: centerY, label: 'A' },
        { x: centerX + targetDist, y: centerY, label: 'B' },
      ];

      targets.forEach((t, i) => {
        const isSelected = selectedTarget === i;
        ctx.save();
        ctx.beginPath();
        ctx.arc(t.x, t.y, 22, 0, Math.PI * 2);
        if (isSelected) {
          ctx.fillStyle = answeredState === 'correct' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)';
          ctx.strokeStyle = answeredState === 'correct' ? '#10B981' : '#EF4444';
        } else {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
          ctx.strokeStyle = 'rgba(14, 165, 233, 0.5)';
        }
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();

        // Pulsing radar ring
        ctx.beginPath();
        ctx.arc(t.x, t.y, 28 + Math.sin(Date.now() * 0.005 + i) * 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.25)';
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t.label, t.x, t.y);
        ctx.restore();
      });

      // Update ripples & particles
      CanvasEngine.updateAndDrawRipples(ctx, ripplesRef.current);
      CanvasEngine.updateAndDrawParticles(ctx, particlesRef.current);

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      isRunning = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [selectedTarget, answeredState]);

  const handleSelectAnswer = (chosenIndex: 0 | 1) => {
    if (answeredState !== 'idle') return;

    setSelectedTarget(chosenIndex);
    const isCorrect = chosenIndex === questionTargetIndex;

    if (isCorrect) {
      setAnsweredState('correct');
      const newCombo = combo + 1;
      setCombo(newCombo);
      if (newCombo > maxCombo) setMaxCombo(newCombo);
      setScore((prev) => prev + 25 * newCombo);

      if (soundEnabled) {
        gameAudio.playCorrectMatch(combo);
      }

      if (containerRef.current) {
        const w = containerRef.current.clientWidth || 800;
        const targetX = chosenIndex === 0 ? w / 2 - 120 : w / 2 + 120;
        CanvasEngine.createBurst(particlesRef.current, targetX, 200, 25, '#10B981');
        ripplesRef.current.push({
          x: targetX,
          y: 200,
          radius: 15,
          maxRadius: 80,
          alpha: 1,
          color: '#10B981',
        });
      }
    } else {
      setAnsweredState('wrong');
      setCombo(1);
      setMistakesCount((prev) => prev + 1);

      if (soundEnabled) {
        gameAudio.playWrongWord();
      }

      if (containerRef.current) {
        const w = containerRef.current.clientWidth || 800;
        const targetX = chosenIndex === 0 ? w / 2 - 120 : w / 2 + 120;
        ripplesRef.current.push({
          x: targetX,
          y: 200,
          radius: 10,
          maxRadius: 50,
          alpha: 0.9,
          color: '#EF4444',
        });
      }
    }
  };

  const handleNextQuestion = async () => {
    if (currentIndex + 1 < MUTASHABIHAT_DATASET.length) {
      setCurrentIndex((prev) => prev + 1);
      setAnsweredState('idle');
      setSelectedTarget(null);
      setQuestionTargetIndex(Math.random() > 0.5 ? 1 : 0);
    } else {
      setIsFinished(true);
      const totalQuestions = MUTASHABIHAT_DATASET.length;
      const accuracy = Math.max(10, Math.round(((totalQuestions - mistakesCount) / totalQuestions) * 100));
      const xpEarned = Math.round((score / 4) + 40);

      await persistGameCompletion({
        sessionId: `radar-${Date.now()}`,
        gameId: 'mutashabihat-radar',
        gameTitle: 'Mutashabihat Radar',
        surahNumber: currentEntry.pair[0].surah,
        surahName: currentEntry.pair[0].surahName,
        accuracy,
        score,
        timeSeconds: elapsedSeconds,
        comboMax: maxCombo,
        xpEarned,
        timestamp: Date.now(),
      });
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setScore(0);
    setCombo(1);
    setMaxCombo(1);
    setElapsedSeconds(0);
    setMistakesCount(0);
    setAnsweredState('idle');
    setSelectedTarget(null);
    setQuestionTargetIndex(Math.random() > 0.5 ? 1 : 0);
    setIsFinished(false);
  };

  const targetVerse = currentEntry.pair[questionTargetIndex];
  const queryToken = targetVerse.uniqueTokens[0] || '—';

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Top HUD */}
      <GameHUD
        gameTitle="Mutashabihat Radar"
        surahNumber={currentEntry.pair[0].surah}
        surahName={currentEntry.pair[0].surahName}
        ayahNumber={currentEntry.pair[0].ayah}
        score={score}
        combo={combo}
        elapsedSeconds={elapsedSeconds}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        onRestart={handleRestart}
        progressText={`Pair ${currentIndex + 1} of ${MUTASHABIHAT_DATASET.length}`}
      />

      {/* Target Token Question Banner */}
      <div className="p-4 rounded-2xl bg-card border border-border shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
            <Radar className="w-5 h-5 animate-spin" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {currentEntry.category} &bull; Discernment Challenge
            </span>
            <h2 className="text-sm sm:text-base font-bold text-foreground">
              Which Ayah contains the unique token:
            </h2>
          </div>
        </div>

        {/* Distinctive Arabic Token Target */}
        <div className="px-5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-arabic text-2xl font-black shadow-xs">
          {queryToken}
        </div>
      </div>

      {/* 2D Canvas Radar Sweep Visual */}
      <div
        ref={containerRef}
        className="relative w-full h-[260px] sm:h-[300px] rounded-2xl overflow-hidden border border-border bg-slate-950 shadow-inner select-none"
      >
        <canvas ref={canvasRef} className="w-full h-full block" />
        <div className="absolute top-3 left-4 text-[10px] text-sky-400/80 font-mono tracking-widest uppercase">
          FREQ: 432Hz &bull; SCANNING MUTASHABIHAT NODES
        </div>
      </div>

      {/* Two Twin Ayah Option Cards (A & B) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {currentEntry.pair.map((verse, idx) => {
          const isSelected = selectedTarget === idx;
          const isCorrectAnswer = idx === questionTargetIndex;
          let borderClass = 'border-border hover:border-primary/40';
          let bgClass = 'bg-card';

          if (answeredState !== 'idle') {
            if (isCorrectAnswer) {
              borderClass = 'border-emerald-500 bg-emerald-500/10';
              bgClass = 'bg-emerald-500/5';
            } else if (isSelected && !isCorrectAnswer) {
              borderClass = 'border-rose-500 bg-rose-500/10';
              bgClass = 'bg-rose-500/5';
            }
          }

          return (
            <button
              key={idx}
              disabled={answeredState !== 'idle'}
              onClick={() => handleSelectAnswer(idx as 0 | 1)}
              type="button"
              className={`p-5 rounded-2xl border text-left flex flex-col gap-3 transition-all ${borderClass} ${bgClass} cursor-pointer shadow-xs`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="w-7 h-7 rounded-lg bg-muted text-foreground flex items-center justify-center text-xs font-bold">
                  {idx === 0 ? 'A' : 'B'}
                </span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
                  {verse.surahName} ({verse.surah}:{verse.ayah})
                </span>
              </div>

              {/* Full Arabic Text */}
              <p className="font-arabic text-lg sm:text-xl font-bold text-foreground text-right leading-loose dir-rtl">
                {verse.textUthmani}
              </p>

              {/* Translation */}
              <p className="text-xs text-muted-foreground line-clamp-2">
                &ldquo;{verse.translationEn}&rdquo;
              </p>
            </button>
          );
        })}
      </div>

      {/* Mnemonic card shown after answering */}
      {answeredState !== 'idle' && (
        <div className="p-5 rounded-2xl bg-card border border-border shadow-md flex flex-col sm:flex-row items-start justify-between gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
              <Lightbulb className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <span>Mnemonic:</span>
                <span className="text-xs text-muted-foreground font-normal">
                  {currentEntry.topicTitleEn}
                </span>
              </h4>
              <p className="text-xs text-muted-foreground mt-1">
                {currentEntry.mnemonicEn}
              </p>
              <p className="text-xs text-muted-foreground mt-1 font-tamil">
                {currentEntry.mnemonicTa}
              </p>
            </div>
          </div>

          <button
            onClick={handleNextQuestion}
            type="button"
            className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs flex items-center gap-2 shadow-md shadow-primary/20 hover:opacity-90 transition-opacity shrink-0 ml-auto"
          >
            <span>Next Pair</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Game Finished Modal */}
      {isFinished && (
        <div className="p-8 rounded-2xl bg-card border border-border text-center flex flex-col items-center gap-4 animate-in zoom-in-95 duration-300 shadow-md">
          <div className="w-16 h-16 rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shadow-md">
            <Radar className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">
            Round complete
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            You told apart verses that read alike. This reduces hesitation during Salah.
          </p>
          <div className="flex items-center gap-6 py-2">
            <div>
              <span className="text-2xl font-black text-primary">{score}</span>
              <span className="block text-[11px] text-muted-foreground font-semibold uppercase">Total Score</span>
            </div>
            <div className="w-px h-8 bg-border" />
            <div>
              <span className="text-2xl font-black text-amber-500">{maxCombo}x</span>
              <span className="block text-[11px] text-muted-foreground font-semibold uppercase">Max Combo</span>
            </div>
            <div className="w-px h-8 bg-border" />
            <div>
              <span className="text-2xl font-black text-emerald-500">
                {Math.max(10, Math.round(((MUTASHABIHAT_DATASET.length - mistakesCount) / MUTASHABIHAT_DATASET.length) * 100))}%
              </span>
              <span className="block text-[11px] text-muted-foreground font-semibold uppercase">Accuracy</span>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleRestart}
              type="button"
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center gap-2 shadow-md shadow-primary/20 hover:opacity-90 transition-opacity"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Play Again</span>
            </button>
            <a
              href="/dashboard"
              className="px-5 py-2.5 rounded-xl bg-card border border-border hover:bg-muted text-foreground font-semibold text-sm transition-colors"
            >
              View Streaks
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
