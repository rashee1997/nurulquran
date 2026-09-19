'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ARABIC_ALPHABET } from '@/lib/audio/alphabet-audio';
import type { LetterForm } from '@/lib/arabic/types';
import { isEnglishEnabled, isTamilEnabled, type FeedbackLanguage } from '@/lib/i18n/language';
import { CheckCircle2, Eraser, RotateCcw, Undo2 } from 'lucide-react';

/**
 * Guided handwriting canvas.
 *
 * The letter form is drawn on the canvas itself as a grey guide sitting on the
 * Arabic baseline; the learner traces over it with pen/touch/finger. Scoring is
 * deterministic and local: the guide glyph and the learner's ink are each
 * rasterised into a coarse cell grid, then scored on
 *
 *   coverage — how much of the guide the pen actually touched
 *   spill    — how much ink landed outside the guide's neighbourhood
 *
 * Stroke *order* data (`LetterStrokeModel`) is authored separately; this canvas
 * deliberately scores shape fidelity, and the activity instruction text carries
 * the pen-down order.
 */

const GUIDE_FONT_STACK = '"Scheherazade New", "Noto Sans Arabic", "Amiri Quran", serif';
const BASELINE_RATIO = 0.62;
const GLYPH_HEIGHT_RATIO = 0.62;
const INK_WIDTH = 11;
const PASS_SCORE = 60;
/** Device pixels per scoring cell. */
const CELL = 4;
/** Sample every Nth pixel when rasterising (must stay < CELL). */
const SAMPLE_STEP = 2;
const MIN_INK_CELLS = 12;

interface Point {
  x: number;
  y: number;
}

interface Geometry {
  width: number;
  height: number;
  dpr: number;
  fontSize: number;
  baselineY: number;
}

interface Verdict {
  score: number;
  coverage: number;
  spill: number;
  passed: boolean;
  reason: 'scored' | 'empty' | 'no-guide';
}

function applyTransform(ctx: CanvasRenderingContext2D, geo: Geometry): void {
  ctx.setTransform(geo.dpr, 0, 0, geo.dpr, 0, 0);
}

function drawBaseline(ctx: CanvasRenderingContext2D, geo: Geometry): void {
  ctx.save();
  ctx.setLineDash([7, 7]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(125, 145, 135, 0.6)';
  ctx.beginPath();
  ctx.moveTo(12, geo.baselineY);
  ctx.lineTo(geo.width - 12, geo.baselineY);
  ctx.stroke();
  ctx.restore();
}

function drawGuide(
  ctx: CanvasRenderingContext2D,
  geo: Geometry,
  glyph: string,
  fillStyle: string
): void {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `${geo.fontSize}px ${GUIDE_FONT_STACK}`;
  ctx.fillStyle = fillStyle;
  ctx.fillText(glyph, geo.width / 2, geo.baselineY);
  ctx.restore();
}

function drawInk(
  ctx: CanvasRenderingContext2D,
  geo: Geometry,
  strokes: readonly (readonly Point[])[],
  color: string
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = INK_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const stroke of strokes) {
    if (stroke.length === 0) continue;
    if (stroke.length === 1) {
      const single = stroke[0];
      if (!single) continue;
      ctx.beginPath();
      ctx.arc(single.x, single.y, INK_WIDTH / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    stroke.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
  }
  ctx.restore();

  void geo;
}

function readInkColor(element: HTMLElement | null): string {
  if (!element || typeof window === 'undefined') return '#059669';
  const value = getComputedStyle(element).getPropertyValue('--primary').trim();
  return value || '#059669';
}

function createRaster(geo: Geometry): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(geo.width * geo.dpr));
  canvas.height = Math.max(1, Math.round(geo.height * geo.dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  applyTransform(ctx, geo);
  return { canvas, ctx };
}

/** Rasterises whatever is on `ctx` into a set of occupied cell indices. */
function collectCells(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  alphaThreshold = 60
): Set<number> {
  const cells = new Set<number>();
  const columns = Math.ceil(canvas.width / CELL);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < canvas.height; y += SAMPLE_STEP) {
    const rowOffset = y * canvas.width;
    const rowCell = Math.floor(y / CELL) * columns;
    for (let x = 0; x < canvas.width; x += SAMPLE_STEP) {
      if ((data[(rowOffset + x) * 4 + 3] ?? 0) >= alphaThreshold) {
        cells.add(rowCell + Math.floor(x / CELL));
      }
    }
  }
  return cells;
}

export const StrokeTraceCanvas: React.FC<{
  letterId: string;
  form: LetterForm;
  language: FeedbackLanguage;
  onScore?: (score: number) => void;
  onPassed?: (score: number) => void;
}> = ({ letterId, form, language, onScore, onPassed }) => {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const geometryRef = useRef<Geometry | null>(null);
  const strokesRef = useRef<Point[][]>([]);
  const drawingRef = useRef(false);
  const frameRef = useRef<number | null>(null);

  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [strokeCount, setStrokeCount] = useState(0);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const letter = useMemo(() => ARABIC_ALPHABET.find((item) => item.id === letterId), [letterId]);
  const glyph = letter?.forms[form] ?? letter?.letter ?? '';
  const letterName = isTamilEnabled(language) && !isEnglishEnabled(language)
    ? letter?.nameTa
    : letter?.nameEn;

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const geo = geometryRef.current;
    if (!canvas || !geo) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    applyTransform(ctx, geo);
    ctx.clearRect(0, 0, geo.width, geo.height);
    drawBaseline(ctx, geo);
    if (glyph) drawGuide(ctx, geo, glyph, 'rgba(120, 138, 128, 0.32)');
    drawInk(ctx, geo, strokesRef.current, readInkColor(canvas));
  }, [glyph]);

  const scheduleRender = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      render();
    });
  }, [render]);

  // Measure the box and keep the canvas backing store in sync.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;

    const measure = () => {
      const rect = box.getBoundingClientRect();
      const width = Math.max(180, Math.round(rect.width));
      const height = Math.max(140, Math.round(rect.height));
      setGeometry((previous) => {
        if (
          previous &&
          previous.width === width &&
          previous.height === height
        ) {
          return previous;
        }
        return {
          width,
          height,
          dpr: Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, 2),
          fontSize: Math.round(height * GLYPH_HEIGHT_RATIO),
          baselineY: Math.round(height * BASELINE_RATIO),
        };
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Size the canvas for the measured geometry, then paint once fonts have loaded.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !geometry) return;

    geometryRef.current = geometry;
    canvas.width = Math.max(1, Math.round(geometry.width * geometry.dpr));
    canvas.height = Math.max(1, Math.round(geometry.height * geometry.dpr));
    canvas.style.width = `${geometry.width}px`;
    canvas.style.height = `${geometry.height}px`;

    let cancelled = false;
    const paint = () => {
      if (!cancelled) render();
    };

    const fontSet = typeof document !== 'undefined' ? document.fonts : undefined;
    if (fontSet && glyph) {
      fontSet
        .load(`${geometry.fontSize}px "Scheherazade New"`, glyph)
        .then(paint)
        .catch(paint);
      fontSet.ready.then(paint).catch(() => undefined);
    }
    paint();

    return () => {
      cancelled = true;
    };
  }, [geometry, glyph, render]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    },
    []
  );

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    strokesRef.current = [...strokesRef.current, [pointFromEvent(event)]];
    setStrokeCount(strokesRef.current.length);
    setVerdict(null);
    scheduleRender();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    const strokes = strokesRef.current;
    const current = strokes[strokes.length - 1];
    if (!current) return;
    current.push(pointFromEvent(event));
    scheduleRender();
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    render();
  };

  const undoStroke = () => {
    strokesRef.current = strokesRef.current.slice(0, -1);
    setStrokeCount(strokesRef.current.length);
    setVerdict(null);
    render();
  };

  const clearAll = () => {
    strokesRef.current = [];
    setStrokeCount(0);
    setVerdict(null);
    render();
  };

  const scoreTracing = () => {
    const geo = geometryRef.current;
    if (!geo || !glyph) {
      setVerdict({ score: 0, coverage: 0, spill: 0, passed: false, reason: 'no-guide' });
      return;
    }

    if (strokesRef.current.length === 0) {
      setVerdict({ score: 0, coverage: 0, spill: 0, passed: false, reason: 'empty' });
      return;
    }

    const guideRaster = createRaster(geo);
    if (!guideRaster) return;
    drawGuide(guideRaster.ctx, geo, glyph, '#000000');
    const guideCells = collectCells(guideRaster.ctx, guideRaster.canvas);

    const inkRaster = createRaster(geo);
    if (!inkRaster) return;
    drawInk(inkRaster.ctx, geo, strokesRef.current, '#000000');
    const inkCells = collectCells(inkRaster.ctx, inkRaster.canvas);

    if (guideCells.size === 0) {
      setVerdict({ score: 0, coverage: 0, spill: 0, passed: false, reason: 'no-guide' });
      return;
    }

    if (inkCells.size < MIN_INK_CELLS) {
      setVerdict({ score: 0, coverage: 0, spill: 0, passed: false, reason: 'empty' });
      return;
    }

    let covered = 0;
    guideCells.forEach((cell) => {
      if (inkCells.has(cell)) covered += 1;
    });

    // Allow a one-cell neighbourhood so a clean trace is never punished for
    // sitting a couple of pixels off the guide.
    const columns = Math.ceil(inkRaster.canvas.width / CELL);
    const allowed = new Set<number>(guideCells);
    guideCells.forEach((cell) => {
      const col = cell % columns;
      const row = (cell - col) / columns;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nextCol = col + dx;
          const nextRow = row + dy;
          if (nextCol < 0 || nextRow < 0 || nextCol >= columns) continue;
          allowed.add(nextRow * columns + nextCol);
        }
      }
    });

    let spillCells = 0;
    inkCells.forEach((cell) => {
      if (!allowed.has(cell)) spillCells += 1;
    });

    const coverage = covered / guideCells.size;
    const spill = spillCells / inkCells.size;
    const penalty = Math.round(Math.max(0, spill - 0.3) * 140);
    const score = Math.max(0, Math.min(100, Math.round(coverage * 100) - penalty));

    const result: Verdict = { score, coverage, spill, passed: score >= PASS_SCORE, reason: 'scored' };
    setVerdict(result);
    onScore?.(score);
    if (result.passed) onPassed?.(score);
  };

  const feedbackCopy = (result: Verdict): string => {
    if (result.reason === 'no-guide') {
      const en = 'Guide glyph unavailable for this letter form — switch the form and try again.';
      const ta = 'இந்த எழுத்து வடிவத்திற்கு வழிகாட்டி கிடைக்கவில்லை — வடிவத்தை மாற்றி மீண்டும் முயலுங்கள்.';
      return isTamilEnabled(language) && !isEnglishEnabled(language) ? ta : isEnglishEnabled(language) && !isTamilEnabled(language) ? en : `${en} · ${ta}`;
    }
    if (result.reason === 'empty') {
      const en = 'Trace the grey guide with your pen first.';
      const ta = 'முதலில் சாம்பல் வழிகாட்டியின் மேல் எழுதுங்கள்.';
      return isTamilEnabled(language) && !isEnglishEnabled(language) ? ta : isEnglishEnabled(language) && !isTamilEnabled(language) ? en : `${en} · ${ta}`;
    }
    const verdictEn = result.passed
      ? 'Shape matched — the pen stays on the guide.'
      : result.spill > 0.45
        ? 'Ink strays outside the letter — stay on the guide.'
        : 'Ink touches only part of the guide — trace every stroke.';
    const verdictTa = result.passed
      ? 'வடிவம் பொருந்தியது — எழுத்துக்கோட்டின் மேல் நிற்கிறது.'
      : result.spill > 0.45
        ? 'மை எழுத்துக்கு வெளியே செல்கிறது — வழிகாட்டியில் நில்லுங்கள்.'
        : 'மை வழிகாட்டியின் ஒரு பகுதியை மட்டும் தொடுகிறது — அனைத்து இழுவைகளையும் வரையுங்கள்.';
    return isTamilEnabled(language) && !isEnglishEnabled(language) ? verdictTa : isEnglishEnabled(language) && !isTamilEnabled(language) ? verdictEn : `${verdictEn} · ${verdictTa}`;
  };

  return (
    <div className="space-y-3">
      <div
        ref={boxRef}
        className="relative w-full h-[240px] sm:h-[280px] rounded-2xl border-2 border-dashed border-border-strong bg-surface-muted overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="absolute inset-0 touch-none cursor-crosshair"
          aria-label={`Trace the letter ${letterName ?? letterId} in the ${form} form`}
        />
        {strokeCount === 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center">
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-card/90 border border-border text-muted-foreground">
              {isTamilEnabled(language) && !isEnglishEnabled(language)
                ? 'வழிகாட்டியின் மேல் விரல் அல்லது பேனாவால் எழுதுங்கள்'
                : isEnglishEnabled(language) && !isTamilEnabled(language)
                  ? 'Trace over the guide with pen, mouse or finger'
                  : 'Trace over the guide · வழிகாட்டியின் மேல் எழுதுங்கள்'}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={scoreTracing}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-xs active:scale-98 transition-all"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Check tracing</span>
        </button>
        <button
          type="button"
          onClick={undoStroke}
          disabled={strokeCount === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted text-foreground text-xs font-semibold border border-border hover:bg-surface-hover disabled:opacity-40 transition-colors"
        >
          <Undo2 className="w-3.5 h-3.5" />
          <span>Undo stroke</span>
        </button>
        <button
          type="button"
          onClick={clearAll}
          disabled={strokeCount === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted text-foreground text-xs font-semibold border border-border hover:bg-surface-hover disabled:opacity-40 transition-colors"
        >
          <Eraser className="w-3.5 h-3.5" />
          <span>Clear</span>
        </button>
        <span className="text-[11px] text-muted-foreground ml-auto">
          {strokeCount} stroke{strokeCount === 1 ? '' : 's'} · pass ≥ {PASS_SCORE}%
        </span>
      </div>

      {verdict && (
        <div
          className={`p-3 rounded-xl border space-y-1.5 ${
            verdict.passed
              ? 'bg-success-subtle border-success/30'
              : 'bg-destructive-subtle border-destructive/25'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-xs font-bold ${verdict.passed ? 'text-success-strong' : 'text-destructive-strong'}`}
            >
              {verdict.passed ? 'Passed' : 'Try again'} · {verdict.score}%
            </span>
            {verdict.reason === 'scored' && (
              <span className="text-[10px] text-muted-foreground">
                coverage {Math.round(verdict.coverage * 100)}% · spill {Math.round(verdict.spill * 100)}%
              </span>
            )}
          </div>
          <p className="text-[11px] text-foreground/90 leading-relaxed">{feedbackCopy(verdict)}</p>
          {!verdict.passed && (
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary-strong hover:underline"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset and trace again</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
