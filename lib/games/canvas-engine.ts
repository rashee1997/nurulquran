/**
 * 2D Canvas Engine Utilities for Quran EdTech Mini-Games
 * Handles HiDPI (Retina) scaling, particle bursts, orbital drift, and touch hit-testing.
 */

export interface CanvasParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  decay: number;
  color: string;
  shape?: 'circle' | 'spark' | 'ring';
}

export interface RippleWave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
}

export interface CanvasSetup {
  ctx: CanvasRenderingContext2D;
  dpr: number;
  width: number;
  height: number;
}

export class CanvasEngine {
  /**
   * Sizes a canvas for the device pixel ratio and returns its 2D context.
   *
   * Callers invoke this from inside their animation loop, so the sizing is skipped
   * when the backing store already matches. Assigning `canvas.width`/`height` resets
   * the whole context and reallocates the bitmap, which previously happened on every
   * single frame (visible jank and heavy GC churn on low-end phones).
   *
   * Returns `null` when the browser cannot provide a 2D context, so callers can bail
   * out instead of running a draw loop against a non-existent context.
   */
  static setupHiDPI(
    canvas: HTMLCanvasElement,
    containerWidth: number,
    containerHeight: number
  ): CanvasSetup | null {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const width = Math.max(1, Math.round(containerWidth));
    const height = Math.max(1, Math.round(containerHeight));
    const backingWidth = Math.round(width * dpr);
    const backingHeight = Math.round(height * dpr);

    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth;
      canvas.height = backingHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      // `setTransform` (not `scale`) keeps the DPR mapping exact even if a previous
      // draw left a transform behind.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    return { ctx, dpr, width, height };
  }

  static createBurst(
    particles: CanvasParticle[],
    x: number,
    y: number,
    count = 18,
    color = '#10B981'
  ): void {
    const colors = [color, '#F59E0B', '#38BDF8', '#FFFFFF'];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5);
      const speed = 1.5 + Math.random() * 3.5;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2 + Math.random() * 3,
        alpha: 1,
        decay: 0.02 + Math.random() * 0.025,
        color: colors[Math.floor(Math.random() * colors.length)] ?? color,
        shape: Math.random() > 0.4 ? 'circle' : 'spark',
      });
    }
  }

  static updateAndDrawParticles(ctx: CanvasRenderingContext2D, particles: CanvasParticle[]): void {
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];
      if (!particle) continue;

      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.05; // slight gravity
      particle.vx *= 0.98; // air resistance
      particle.alpha -= particle.decay;

      if (particle.alpha <= 0) {
        particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, particle.alpha);

      if (particle.shape === 'spark') {
        // Motion streak: a line trailing opposite to the particle's travel.
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = Math.max(1, particle.radius * 0.7);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(particle.x - particle.vx * 2.5, particle.y - particle.vy * 2.5);
        ctx.stroke();
      } else if (particle.shape === 'ring') {
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = Math.max(1, particle.radius * 0.4);
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  static updateAndDrawRipples(ctx: CanvasRenderingContext2D, ripples: RippleWave[]): void {
    for (let i = ripples.length - 1; i >= 0; i--) {
      const ripple = ripples[i];
      if (!ripple) continue;

      ripple.radius += 2.2;
      ripple.alpha -= 0.025;

      if (ripple.alpha <= 0 || ripple.radius >= ripple.maxRadius) {
        ripples.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, ripple.alpha);
      ctx.strokeStyle = ripple.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  static drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill = true,
    stroke = true
  ): void {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }
}
