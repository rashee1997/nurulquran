'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameVerse, getAvailableSurahs, getSurahGameVerses } from '@/lib/games/game-data';
import { CanvasEngine, CanvasParticle, RippleWave } from '@/lib/games/canvas-engine';
import {
  DRIFT_X,
  DRIFT_Y,
  STAGE_HEIGHT,
  arabicFontSize,
  planWordGrid,
  shouldShowTranslit,
  stageHeightForWordCount,
  translitFontSize,
} from '@/lib/games/word-layout';
import { gameAudio } from '@/lib/games/audio-synth';
import { persistGameCompletion } from '@/lib/games/game-service';
import { GameHUD } from './GameHUD';
import { Sparkles, CheckCircle2, ArrowRight, RefreshCw, Volume2, Loader2 } from 'lucide-react';

interface FloatingWordNode {
  id: string;
  wordIndex: number;
  arabic: string;
  transliteration: string;
  translationEn: string;
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  phase: number;
  speed: number;
  isMatched: boolean;
  isShaking: boolean;
  shakeFrames: number;
  /** Measured on first draw, because it needs a 2D context. Cleared whenever the card is re-laid out. */
  fit?: WordTextFit;
}

interface WordTextFit {
  arabicSize: number;
  translitSize: number;
  translit: string;
  showTranslit: boolean;
}

const ARABIC_FONT_STACK = '"Amiri", "Scheherazade New", "Traditional Arabic", serif';

/**
 * Measures the font sizes (and the transliteration) that actually fit a card.
 *
 * Arabic words vary a lot in length, and `fillText` paints straight past the card edge, so the
 * size is stepped down until the word fits. Run once per card, not per frame.
 */
function fitWordText(ctx: CanvasRenderingContext2D, node: FloatingWordNode): WordTextFit {
  let arabicSize = arabicFontSize(node.height);
  ctx.font = `bold ${arabicSize}px ${ARABIC_FONT_STACK}`;
  while (arabicSize > 11 && ctx.measureText(node.arabic).width > node.width - 18) {
    arabicSize -= 1;
    ctx.font = `bold ${arabicSize}px ${ARABIC_FONT_STACK}`;
  }

  const showTranslit = shouldShowTranslit(node.height);
  let translitSize = translitFontSize(node.height);
  let translit = node.transliteration;
  if (showTranslit) {
    ctx.font = `500 ${translitSize}px sans-serif`;
    while (translitSize > 7 && ctx.measureText(translit).width > node.width - 14) {
      translitSize -= 1;
      ctx.font = `500 ${translitSize}px sans-serif`;
    }
    // Past the size floor a long transliteration is clipped rather than left to bleed off the card.
    while (translit.length > 4 && ctx.measureText(translit).width > node.width - 14) {
      translit = `${translit.slice(0, -2)}…`;
    }
  }

  return { arabicSize, translitSize, translit, showTranslit };
}

export const AyahAssemblyCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // The canvas is behind the loading gate below, so on the component's first render it does not
  // exist yet and a render loop started there would attach to a null ref and never draw. This
  // flag flips when the canvas node actually attaches (and back to false when it detaches, which
  // a surah switch does), so the loop below starts against a real element.
  const [canvasReady, setCanvasReady] = useState<boolean>(false);
  const attachCanvas = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    setCanvasReady(node !== null);
  }, []);
  
  // Game Configuration & State
  const [selectedSurah, setSelectedSurah] = useState<number>(1);
  const [currentAyahIndex, setCurrentAyahIndex] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [combo, setCombo] = useState<number>(1);
  const [maxCombo, setMaxCombo] = useState<number>(1);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [mistakesCount, setMistakesCount] = useState<number>(0);
  const [isAyahCompleted, setIsAyahCompleted] = useState<boolean>(false);
  const [isGameFinished, setIsGameFinished] = useState<boolean>(false);

  // Verses of the selected Surah, fetched live from the same verified provider the reader uses.
  const [surahVerses, setSurahVerses] = useState<GameVerse[]>([]);
  const [isLoadingSurah, setIsLoadingSurah] = useState<boolean>(true);
  const [surahError, setSurahError] = useState<string | null>(null);
  /** Bumped by "Try Again" to re-run the load effect below. */
  const [reloadToken, setReloadToken] = useState<number>(0);
  const currentVerse: GameVerse | undefined = surahVerses[currentAyahIndex] || surahVerses[0];

  // The stage is sized by the surah's longest ayah, so a dense surah gets a taller board and the
  // height stays put as the player moves between verses. The canvas reads its own height off the
  // container, so this is the single source of truth for both.
  const stageHeight = stageHeightForWordCount(
    surahVerses.reduce((max, verse) => Math.max(max, verse.words.length), 0)
  );

  // Sequence tracking: index of the next word expected (1-based)
  const [expectedWordIndex, setExpectedWordIndex] = useState<number>(1);
  const [assembledWords, setAssembledWords] = useState<string[]>([]);

  // Canvas interactive references
  const nodesRef = useRef<FloatingWordNode[]>([]);
  const particlesRef = useRef<CanvasParticle[]>([]);
  const ripplesRef = useRef<RippleWave[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  const availableSurahs = getAvailableSurahs();

  // Load the selected Surah's verses whenever it changes.
  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the previous surah's verses while the async fetch for the new one is in flight
    setIsLoadingSurah(true);
    setSurahError(null);
    getSurahGameVerses(selectedSurah)
      .then((verses) => {
        if (!active) return;
        setSurahVerses(verses);
        setIsLoadingSurah(false);
      })
      .catch((error: unknown) => {
        // The provider throws `QuranUnavailableError` rather than substituting text. Unhandled,
        // that rejection left `isLoadingSurah` true for good — the "Loading Surah N…" placeholder
        // sat over a dead game with no way to retry.
        if (!active) return;
        console.error(`Failed to load surah ${selectedSurah} for Ayah Assembly:`, error);
        setSurahError(`Surah ${selectedSurah} could not be loaded from the Quran provider.`);
        setIsLoadingSurah(false);
      });
    return () => {
      active = false;
    };
  }, [selectedSurah, reloadToken]);

  // Timer loop
  useEffect(() => {
    if (isGameFinished) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isGameFinished]);

  // Initialize or re-layout floating nodes for the current verse
  const initNodesForVerse = useCallback((verse: GameVerse) => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const stageWidth = container.clientWidth || 800;
    const stageHeightPx = container.clientHeight || STAGE_HEIGHT;

    const words = [...verse.words];
    // Shuffle words for floating layout
    const shuffled = [...words].sort(() => Math.random() - 0.5);

    const grid = planWordGrid(stageWidth, stageHeightPx, words.length);
    // Everything outside the drift range is jitter headroom; cards stay inside their own cell.
    const slackX = Math.max(0, (grid.cellW - grid.cardW) / 2 - DRIFT_X);
    const slackY = Math.max(0, (grid.cellH - grid.cardH) / 2 - DRIFT_Y);

    const newNodes: FloatingWordNode[] = shuffled.map((w, idx) => {
      const col = idx % grid.cols;
      const row = Math.floor(idx / grid.cols);
      // A short last row is centred rather than left-aligned.
      const itemsInRow = Math.min(grid.cols, words.length - row * grid.cols);
      const rowOffset = (grid.cols * grid.cellW - itemsInRow * grid.cellW) / 2;
      const baseX =
        grid.padX +
        rowOffset +
        col * grid.cellW +
        grid.cellW / 2 +
        (Math.random() - 0.5) * 2 * Math.min(14, slackX);
      const baseY =
        grid.padY +
        row * grid.cellH +
        grid.cellH / 2 +
        (Math.random() - 0.5) * 2 * Math.min(10, slackY);

      return {
        id: `word-${verse.ayahNumber}-${w.wordIndex}`,
        wordIndex: w.wordIndex,
        arabic: w.arabic,
        transliteration: w.transliteration,
        translationEn: w.translationEn,
        x: baseX,
        y: baseY,
        baseX,
        baseY,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        width: grid.cardW,
        height: grid.cardH,
        phase: Math.random() * Math.PI * 2,
        speed: 0.02 + Math.random() * 0.02,
        isMatched: false,
        isShaking: false,
        shakeFrames: 0,
      };
    });

    nodesRef.current = newNodes;
    setExpectedWordIndex(1);
    setAssembledWords([]);
    setIsAyahCompleted(false);
  }, []);

  // When selected Surah or Ayah index changes, re-initialize
  useEffect(() => {
    if (currentVerse) {
      initNodesForVerse(currentVerse);
    }
  }, [currentVerse, initNodesForVerse]);

  // Main 2D Canvas Render & Animation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let isRunning = true;

    const render = () => {
      if (!isRunning) return;
      const width = container.clientWidth || 800;
      const height = container.clientHeight || STAGE_HEIGHT;

      const setup = CanvasEngine.setupHiDPI(canvas, width, height);
      if (!setup) return;
      const { ctx } = setup;

      // 1. Draw Celestial Background
      ctx.clearRect(0, 0, width, height);

      // Deep celestial radial gradient
      const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 40, width / 2, height / 2, width);
      bgGrad.addColorStop(0, 'rgba(16, 185, 129, 0.04)');
      bgGrad.addColorStop(0.5, 'rgba(14, 165, 233, 0.03)');
      bgGrad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Subtle constellation grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      const step = 60;
      for (let x = 0; x < width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // 2. Draw Ripples & Particles
      CanvasEngine.updateAndDrawRipples(ctx, ripplesRef.current);
      CanvasEngine.updateAndDrawParticles(ctx, particlesRef.current);

      // 3. Update & Draw Floating Word Nodes
      const nodes = nodesRef.current;

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (!node || node.isMatched) continue;

        // Orbital floating physics. The layout reserves exactly this much clearance per side.
        node.phase += node.speed;
        const driftX = Math.sin(node.phase) * DRIFT_X;
        const driftY = Math.cos(node.phase * 0.8) * DRIFT_Y;
        node.x = node.baseX + driftX;
        node.y = node.baseY + driftY;

        // Apply shake if wrong tap
        let shakeOffset = 0;
        if (node.isShaking) {
          node.shakeFrames--;
          shakeOffset = Math.sin(node.shakeFrames * 1.5) * 6;
          if (node.shakeFrames <= 0) {
            node.isShaking = false;
          }
        }

        const renderX = node.x + shakeOffset;
        const renderY = node.y;

        // Card Shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 4;

        // Node Container Background
        ctx.fillStyle = node.isShaking ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.92)';
        ctx.strokeStyle = node.isShaking ? '#EF4444' : 'rgba(16, 185, 129, 0.35)';
        ctx.lineWidth = 1.5;

        CanvasEngine.drawRoundedRect(
          ctx,
          renderX - node.width / 2,
          renderY - node.height / 2,
          node.width,
          node.height,
          Math.min(14, node.height * 0.28),
          true,
          true
        );

        ctx.shadowColor = 'transparent';

        // Word Index Tag (small badge). It deliberately carries no number: the order is the puzzle.
        const badgeRadius = Math.min(9, node.height * 0.16);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
        ctx.beginPath();
        ctx.arc(
          renderX - node.width / 2 + badgeRadius + 6,
          renderY - node.height / 2 + badgeRadius + 6,
          badgeRadius,
          0,
          Math.PI * 2
        );
        ctx.fill();

        if (!node.fit) node.fit = fitWordText(ctx, node);
        const fit = node.fit;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Arabic Word Text
        ctx.fillStyle = '#0F172A';
        ctx.font = `bold ${fit.arabicSize}px ${ARABIC_FONT_STACK}`;
        ctx.fillText(node.arabic, renderX, fit.showTranslit ? renderY - node.height * 0.14 : renderY);

        // Transliteration Text
        if (fit.showTranslit) {
          ctx.fillStyle = '#64748B';
          ctx.font = `500 ${fit.translitSize}px sans-serif`;
          ctx.fillText(fit.translit, renderX, renderY + node.height * 0.26);
        }
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      isRunning = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [canvasReady]);

  // Handle word click/tap hit detection
  const handleCanvasInteraction = (clientX: number, clientY: number) => {
    if (isAyahCompleted || isGameFinished || !currentVerse) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    // Check hit test against active nodes
    const nodes = nodesRef.current;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node || node.isMatched) continue;

      const halfW = node.width / 2;
      const halfH = node.height / 2;
      const inX = clickX >= node.x - halfW && clickX <= node.x + halfW;
      const inY = clickY >= node.y - halfH && clickY <= node.y + halfH;

      if (inX && inY) {
        // Hit this node!
        if (node.wordIndex === expectedWordIndex) {
          // CORRECT WORD!
          node.isMatched = true;
          const nextExpected = expectedWordIndex + 1;
          setExpectedWordIndex(nextExpected);
          setAssembledWords((prev) => [...prev, node.arabic]);

          // Visual & Audio Feedback
          if (soundEnabled) {
            gameAudio.playCorrectMatch(combo);
          }

          // Spawn burst particles & ripple
          CanvasEngine.createBurst(particlesRef.current, node.x, node.y, 22, '#10B981');
          ripplesRef.current.push({
            x: node.x,
            y: node.y,
            radius: 12,
            maxRadius: 65,
            alpha: 1,
            color: '#10B981',
          });

          // Update combo & score
          const newCombo = combo + 1;
          setCombo(newCombo);
          if (newCombo > maxCombo) setMaxCombo(newCombo);
          setScore((prev) => prev + 10 * newCombo);

          // Check if verse is complete
          if (nextExpected > currentVerse.words.length) {
            handleAyahCompleted();
          }
        } else {
          // WRONG WORD SEQUENCE!
          node.isShaking = true;
          node.shakeFrames = 18;
          setMistakesCount((prev) => prev + 1);
          setCombo(1); // Reset combo

          if (soundEnabled) {
            gameAudio.playWrongWord();
          }

          ripplesRef.current.push({
            x: node.x,
            y: node.y,
            radius: 8,
            maxRadius: 40,
            alpha: 0.8,
            color: '#EF4444',
          });
        }
        break;
      }
    }
  };

  const handleAyahCompleted = () => {
    if (!currentVerse) return;
    setIsAyahCompleted(true);
    if (soundEnabled) {
      gameAudio.playLevelComplete();
      // Play authentic Alafasy recitation for the full Ayah
      setTimeout(() => {
        gameAudio.playRecitation(currentVerse.audioUrl);
      }, 500);
    }

    // Spawn massive celebratory fireworks in canvas
    if (containerRef.current) {
      const w = containerRef.current.clientWidth || 800;
      for (let i = 0; i < 4; i++) {
        setTimeout(() => {
          CanvasEngine.createBurst(
            particlesRef.current,
            w * 0.2 + Math.random() * w * 0.6,
            80 + Math.random() * 120,
            30,
            '#F59E0B'
          );
        }, i * 180);
      }
    }
  };

  const handleNextAyah = async () => {
    if (!currentVerse) return;
    gameAudio.stopRecitation();
    if (currentAyahIndex + 1 < surahVerses.length) {
      setCurrentAyahIndex((prev) => prev + 1);
    } else {
      // Entire Surah finished!
      setIsGameFinished(true);
      const totalWords = surahVerses.reduce((acc, v) => acc + v.words.length, 0);
      const accuracy = Math.max(10, Math.round(((totalWords - mistakesCount) / totalWords) * 100));
      const xpEarned = Math.round((score / 5) + 30);

      await persistGameCompletion({
        sessionId: `assembly-${Date.now()}`,
        gameId: 'ayah-assembly',
        gameTitle: 'Celestial Ayah Assembly',
        surahNumber: currentVerse.surahNumber,
        surahName: currentVerse.surahName,
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
    gameAudio.stopRecitation();
    setScore(0);
    setCombo(1);
    setMaxCombo(1);
    setElapsedSeconds(0);
    setMistakesCount(0);
    setIsGameFinished(false);
    setCurrentAyahIndex(0);
    if (surahVerses[0]) initNodesForVerse(surahVerses[0]);
  };

  if (isLoadingSurah) {
    return (
      <div
        className="w-full flex items-center justify-center gap-2 rounded-2xl border border-border bg-slate-950/90 text-slate-300 text-sm font-semibold"
        style={{ height: stageHeight }}
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading Surah {selectedSurah}…</span>
      </div>
    );
  }

  // A load that finished without verses is a dead end too, so it gets the same way out.
  if (surahError || !currentVerse) {
    return (
      <div
        className="w-full flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-slate-950/90 px-6 text-center"
        style={{ height: stageHeight }}
      >
        <span className="text-sm font-semibold text-rose-300">
          {surahError ?? `Surah ${selectedSurah} returned no verses to assemble.`}
        </span>
        <button
          type="button"
          onClick={() => setReloadToken((prev) => prev + 1)}
          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-primary/20 hover:opacity-90 transition-opacity"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Try Again</span>
        </button>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Top HUD */}
      <GameHUD
        gameTitle="Celestial Ayah Assembly"
        surahNumber={currentVerse.surahNumber}
        surahName={currentVerse.surahName}
        ayahNumber={currentVerse.ayahNumber}
        score={score}
        combo={combo}
        elapsedSeconds={elapsedSeconds}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        onRestart={handleRestart}
        hasAudioRecitation={Boolean(currentVerse.audioUrl)}
        onPlayRecitation={() => gameAudio.playRecitation(currentVerse.audioUrl)}
        progressText={`Ayah ${currentAyahIndex + 1} of ${surahVerses.length}`}
      />

      {/* Surah Selector & Instructions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-card border border-border text-xs">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground font-medium">Select Surah:</span>
          <select
            value={selectedSurah}
            onChange={(e) => {
              const sid = parseInt(e.target.value, 10);
              setSelectedSurah(sid);
              setCurrentAyahIndex(0);
            }}
            className="px-2.5 py-1 rounded-lg bg-background border border-border text-foreground font-semibold cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-primary"
          >
            {availableSurahs.map((s) => (
              <option key={s.surahNumber} value={s.surahNumber}>
                {s.surahNumber}. {s.surahName} ({s.surahNameArabic}) - {s.totalAyahs} Ayahs
              </option>
            ))}
          </select>
        </div>

        <div className="text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>Tap the floating words in correct Quranic sequence.</span>
        </div>
      </div>

      {/* Main 2D Canvas Stage */}
      <div
        ref={containerRef}
        className="relative w-full rounded-2xl overflow-hidden border border-border bg-slate-950/90 shadow-inner select-none cursor-pointer"
        style={{ height: stageHeight }}
        onClick={(e) => handleCanvasInteraction(e.clientX, e.clientY)}
        onTouchStart={(e) => {
          const touch = e.touches[0];
          if (touch) {
            handleCanvasInteraction(touch.clientX, touch.clientY);
          }
        }}
      >
        <canvas ref={attachCanvas} className="w-full h-full block" />

        {/* Assembled Ayah Display Banner (Bottom Tray) */}
        <div className="absolute bottom-4 left-4 right-4 p-3.5 rounded-xl bg-card/90 backdrop-blur-md border border-border shadow-lg flex flex-col items-center gap-1">
          <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
            Current Assembly Sequence
          </span>
          <div className="flex flex-row-reverse items-center justify-center gap-2 flex-wrap min-h-[36px]">
            {assembledWords.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">
                Tap the first word to begin assembling...
              </span>
            ) : (
              assembledWords.map((word, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-arabic text-xl font-bold animate-in zoom-in-50 duration-200"
                >
                  {word}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Ayah Completed Modal / Banner */}
      {isAyahCompleted && !isGameFinished && (
        <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-foreground flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-3 duration-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-emerald-700 dark:text-emerald-400">
                Ayah {currentVerse.ayahNumber} assembled
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-xl line-clamp-2">
                &ldquo;{currentVerse.translationEn}&rdquo;
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 font-tamil line-clamp-1">
                {currentVerse.translationTa}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => gameAudio.playRecitation(currentVerse.audioUrl)}
              type="button"
              className="px-3 py-2 rounded-xl bg-card border border-border hover:bg-muted text-foreground text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Volume2 className="w-4 h-4 text-primary" />
              <span>Listen</span>
            </button>
            <button
              onClick={handleNextAyah}
              type="button"
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-primary/20 hover:opacity-90 transition-opacity"
            >
              <span>Next Ayah</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Game Finished Screen */}
      {isGameFinished && (
        <div className="p-8 rounded-2xl bg-card border border-border text-center flex flex-col items-center gap-4 animate-in zoom-in-95 duration-300 shadow-md">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-3xl shadow-md">
            🏆
          </div>
          <h2 className="text-2xl font-bold text-foreground">
            Surah {currentVerse.surahName} Mastered!
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            You reconstructed every Ayah with high fidelity. Your score, accuracy, and streak have been synced to your Hifz Dashboard.
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
                {Math.max(10, Math.round(((surahVerses.length * 4 - mistakesCount) / (surahVerses.length * 4)) * 100))}%
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
