'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { CanvasEngine, CanvasParticle, RippleWave } from '@/lib/games/canvas-engine';
import { gameAudio } from '@/lib/games/audio-synth';
import { persistGameCompletion } from '@/lib/games/game-service';
import { GameHUD } from './GameHUD';
import { getRandomGameVerses, type GameVerse } from '@/lib/games/game-data';
import { RefreshCw, Sparkles, Trophy, Loader2 } from 'lucide-react';

interface MatrixCard {
  id: string;
  pairId: string;
  type: 'arabic' | 'translation';
  title: string;
  subtitle?: string;
  surahName: string;
  ayahRef: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isFlipped: boolean;
  isMatched: boolean;
  flipProgress: number; // 0 (back) to 1 (face)
  isAnimating: boolean;
  shakeFrames: number;
}

export const MemoryMatrixCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [score, setScore] = useState<number>(0);
  const [combo, setCombo] = useState<number>(1);
  const [maxCombo, setMaxCombo] = useState<number>(1);
  const [moves, setMoves] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [matchedPairsCount, setMatchedPairsCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const cardsRef = useRef<MatrixCard[]>([]);
  const flippedCardsRef = useRef<MatrixCard[]>([]);
  const particlesRef = useRef<CanvasParticle[]>([]);
  const ripplesRef = useRef<RippleWave[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  const TOTAL_PAIRS = 6;

  // Initialize Matrix Cards, drawing a fresh pool of live verses on every round.
  const initCards = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    let pool: GameVerse[] = [];
    try {
      pool = await getRandomGameVerses(TOTAL_PAIRS);
    } catch {
      // A rejected fetch used to leave `isLoading` true forever: a spinner over a blank board,
      // with no way to retry short of reloading. Surface it and let the player try again.
      setIsLoading(false);
      setLoadError('Verses could not be loaded. Check your connection and try again.');
      return;
    }

    setIsLoading(false);
    if (pool.length === 0) {
      // An empty pool produced a board with nothing on it and no explanation.
      setLoadError('No verses could be loaded for this round. Try again.');
      return;
    }
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth || 800;
    const height = 480;

    const generatedPairs: Array<{
      pairId: string;
      arabic: string;
      translation: string;
      surahName: string;
      ayahRef: string;
    }> = pool.map((v, idx) => ({
      pairId: `pair-${idx}`,
      arabic: v.textUthmani.split(' ').slice(0, 3).join(' ') + '...',
      translation: v.translationEn.split(' ').slice(0, 5).join(' ') + '...',
      surahName: v.surahName,
      ayahRef: `${v.surahNumber}:${v.ayahNumber}`,
    }));

    // Flatten to 12 card objects
    const flatList: Array<{
      pairId: string;
      type: 'arabic' | 'translation';
      title: string;
      surahName: string;
      ayahRef: string;
    }> = [];

    generatedPairs.forEach((p) => {
      flatList.push({
        pairId: p.pairId,
        type: 'arabic',
        title: p.arabic,
        surahName: p.surahName,
        ayahRef: p.ayahRef,
      });
      flatList.push({
        pairId: p.pairId,
        type: 'translation',
        title: p.translation,
        surahName: p.surahName,
        ayahRef: p.ayahRef,
      });
    });

    // Shuffle the cards
    const shuffled = [...flatList].sort(() => Math.random() - 0.5);

    // Layout 4 columns x 3 rows = 12 cards
    const cols = 4;
    const rows = 3;
    const gapX = 16;
    const gapY = 16;
    const padX = 24;
    const padY = 24;

    const cardW = (width - padX * 2 - (cols - 1) * gapX) / cols;
    const cardH = (height - padY * 2 - (rows - 1) * gapY) / rows;

    const cards: MatrixCard[] = shuffled.map((item, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = padX + col * (cardW + gapX);
      const y = padY + row * (cardH + gapY);

      return {
        id: `card-${idx}-${item.pairId}`,
        pairId: item.pairId,
        type: item.type,
        title: item.title,
        surahName: item.surahName,
        ayahRef: item.ayahRef,
        x,
        y,
        width: cardW,
        height: cardH,
        isFlipped: false,
        isMatched: false,
        flipProgress: 0,
        isAnimating: false,
        shakeFrames: 0,
      };
    });

    cardsRef.current = cards;
    flippedCardsRef.current = [];
    setMatchedPairsCount(0);
    setIsFinished(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initCards sets the loading flag before its async verse fetch resolves, not a derived-state loop
    void initCards();
  }, [initCards]);

  // Timer loop
  useEffect(() => {
    if (isFinished) return;
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isFinished]);

  // Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let isRunning = true;

    const render = () => {
      if (!isRunning) return;
      const width = container.clientWidth || 800;
      const height = 480;
      const setup = CanvasEngine.setupHiDPI(canvas, width, height);
      if (!setup) return;
      const { ctx } = setup;

      ctx.clearRect(0, 0, width, height);

      // Deep celestial canvas background
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.fillRect(0, 0, width, height);

      // Update and draw cards
      const cards = cardsRef.current;
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        if (!card) continue;

        // Animate flip progress towards target
        const targetFlip = card.isFlipped || card.isMatched ? 1 : 0;
        if (Math.abs(card.flipProgress - targetFlip) > 0.05) {
          card.flipProgress += (targetFlip - card.flipProgress) * 0.2;
        } else {
          card.flipProgress = targetFlip;
        }

        // Shake animation
        let shakeOffset = 0;
        if (card.shakeFrames > 0) {
          card.shakeFrames--;
          shakeOffset = Math.sin(card.shakeFrames * 1.6) * 5;
        }

        ctx.save();
        const centerX = card.x + card.width / 2 + shakeOffset;
        const centerY = card.y + card.height / 2;

        ctx.translate(centerX, centerY);

        // Pseudo 3D card rotation around Y axis
        const scaleX = Math.abs(Math.cos(card.flipProgress * Math.PI));
        ctx.scale(Math.max(0.08, scaleX), 1);

        const isFaceSide = card.flipProgress > 0.5;

        // Card Border & Background
        if (!isFaceSide) {
          // CARD BACK: Geometric Islamic Star Pattern
          ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
          ctx.lineWidth = 1.5;
          CanvasEngine.drawRoundedRect(
            ctx,
            -card.width / 2,
            -card.height / 2,
            card.width,
            card.height,
            12,
            true,
            true
          );

          // Center gold crest
          ctx.fillStyle = '#F59E0B';
          ctx.font = 'bold 20px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('۞', 0, 0);
        } else {
          // CARD FACE: Content revealed
          if (card.isMatched) {
            ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
            ctx.strokeStyle = '#10B981';
          } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
          }
          ctx.lineWidth = 2;

          CanvasEngine.drawRoundedRect(
            ctx,
            -card.width / 2,
            -card.height / 2,
            card.width,
            card.height,
            12,
            true,
            true
          );

          // Card Tag (Arabic vs Meaning)
          ctx.fillStyle = card.type === 'arabic' ? '#059669' : '#0284C7';
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(
            card.type === 'arabic' ? `ARABIC • ${card.ayahRef}` : `MEANING • ${card.ayahRef}`,
            0,
            -card.height / 2 + 10
          );

          // Text content
          ctx.fillStyle = '#0F172A';
          if (card.type === 'arabic') {
            ctx.font = 'bold 18px "Amiri", "Traditional Arabic", serif';
            ctx.fillText(card.title, 0, -4);
          } else {
            ctx.font = '600 11px sans-serif';
            ctx.fillText(card.title, 0, 0);
          }

          // Matched Seal
          if (card.isMatched) {
            ctx.fillStyle = '#10B981';
            ctx.font = 'bold 10px sans-serif';
            ctx.fillText('MATCHED ✓', 0, card.height / 2 - 18);
          }
        }

        ctx.restore();
      }

      // Update ripples and particles
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
  }, []);

  // Card click interaction
  const handleCanvasClick = (clientX: number, clientY: number) => {
    if (isLoading || isFinished || flippedCardsRef.current.length >= 2) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    const cards = cardsRef.current;
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      if (!card || card.isMatched || card.isFlipped) continue;

      if (
        clickX >= card.x &&
        clickX <= card.x + card.width &&
        clickY >= card.y &&
        clickY <= card.y + card.height
      ) {
        // Flip this card
        card.isFlipped = true;
        if (soundEnabled) {
          gameAudio.playWordTap();
        }

        const currentlyFlipped = [...flippedCardsRef.current, card];
        flippedCardsRef.current = currentlyFlipped;

        if (currentlyFlipped.length === 2) {
          setMoves((prev) => prev + 1);
          const [cardA, cardB] = currentlyFlipped;
          if (!cardA || !cardB) { flippedCardsRef.current = []; break; }

          if (cardA.pairId === cardB.pairId && cardA.type !== cardB.type) {
            // MATCH!
            cardA.isMatched = true;
            cardB.isMatched = true;
            flippedCardsRef.current = [];

            const newCombo = combo + 1;
            setCombo(newCombo);
            if (newCombo > maxCombo) setMaxCombo(newCombo);
            setScore((prev) => prev + 30 * newCombo);

            if (soundEnabled) {
              gameAudio.playCorrectMatch(combo);
            }

            // Spawn bursts on both cards
            CanvasEngine.createBurst(particlesRef.current, cardA.x + cardA.width / 2, cardA.y + cardA.height / 2, 18, '#10B981');
            CanvasEngine.createBurst(particlesRef.current, cardB.x + cardB.width / 2, cardB.y + cardB.height / 2, 18, '#10B981');

            const nextCount = matchedPairsCount + 1;
            setMatchedPairsCount(nextCount);

            if (nextCount >= TOTAL_PAIRS) {
              handleGameComplete();
            }
          } else {
            // MISMATCH!
            setCombo(1);
            if (soundEnabled) {
              gameAudio.playWrongWord();
            }

            cardA.shakeFrames = 15;
            cardB.shakeFrames = 15;

            setTimeout(() => {
              cardA.isFlipped = false;
              cardB.isFlipped = false;
              flippedCardsRef.current = [];
            }, 900);
          }
        }
        break;
      }
    }
  };

  const handleGameComplete = async () => {
    setIsFinished(true);
    if (soundEnabled) {
      gameAudio.playLevelComplete();
    }

    const accuracy = Math.max(10, Math.round((TOTAL_PAIRS / Math.max(TOTAL_PAIRS, moves)) * 100));
    const xpEarned = Math.round((score / 4) + 35);

    await persistGameCompletion({
      sessionId: `matrix-${Date.now()}`,
      gameId: 'memory-matrix',
      gameTitle: 'Ayah Memory Matrix',
      surahNumber: 1,
      surahName: 'Mixed Surahs',
      accuracy,
      score,
      timeSeconds: elapsedSeconds,
      comboMax: maxCombo,
      xpEarned,
      timestamp: Date.now(),
    });
  };

  const handleRestart = () => {
    setScore(0);
    setCombo(1);
    setMaxCombo(1);
    setMoves(0);
    setElapsedSeconds(0);
    void initCards();
  };

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Top HUD */}
      <GameHUD
        gameTitle="Ayah Memory Matrix"
        surahNumber={1}
        surahName="Various Surahs"
        score={score}
        combo={combo}
        elapsedSeconds={elapsedSeconds}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        onRestart={handleRestart}
        progressText={`Pairs: ${matchedPairsCount} / ${TOTAL_PAIRS}`}
      />

      {/* Instructions / Stats bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-card border border-border text-xs">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            Moves Made: <strong className="text-foreground">{moves}</strong>
          </span>
          <span className="text-muted-foreground">&bull;</span>
          <span className="text-muted-foreground">
            Matched: <strong className="text-primary">{matchedPairsCount} of {TOTAL_PAIRS}</strong>
          </span>
        </div>

        <div className="text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>Flip tiles to match Arabic Ayah segments with their translations.</span>
        </div>
      </div>

      {/* 2D Canvas Matrix Stage */}
      <div
        ref={containerRef}
        className="relative w-full h-[480px] rounded-2xl overflow-hidden border border-border bg-slate-950 shadow-inner select-none cursor-pointer"
        onClick={(e) => handleCanvasClick(e.clientX, e.clientY)}
        onTouchStart={(e) => {
          const touch = e.touches[0];
          if (touch) {
            handleCanvasClick(touch.clientX, touch.clientY);
          }
        }}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-slate-950/80 text-slate-300 text-sm font-semibold">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Drawing a fresh set of ayahs…</span>
          </div>
        )}

        {loadError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/90 px-6 text-center">
            <span className="text-sm font-semibold text-rose-300">{loadError}</span>
            <button
              type="button"
              onClick={() => void initCards()}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-primary/20 hover:opacity-90 transition-opacity"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Try Again</span>
            </button>
          </div>
        )}
      </div>

      {/* Finished Game Screen */}
      {isFinished && (
        <div className="p-8 rounded-2xl bg-card border border-border text-center flex flex-col items-center gap-4 animate-in zoom-in-95 duration-300 shadow-md">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-md">
            <Trophy className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">
            Round complete
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            You paired all 6 ayahs in {moves} moves and {elapsedSeconds} seconds.
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
                {Math.max(10, Math.round((TOTAL_PAIRS / Math.max(TOTAL_PAIRS, moves)) * 100))}%
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
              View Dashboard Streaks
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
