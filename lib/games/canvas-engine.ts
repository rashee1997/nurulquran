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

export class CanvasEngine {
  static setupHiDPI(canvas: HTMLCanvasElement, containerWidth: number, containerHeight: number): {
    ctx: CanvasRenderingContext2D;
    dpr: number;
    width: number;
    height: number;
  } {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = containerWidth * dpr;
    canvas.height = containerHeight * dpr;
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${containerHeight}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    return { ctx, dpr, width: containerWidth, height: containerHeight };
  }

  static createBurst(
    particles: CanvasParticle[],
    x: number,
    y: number,
    count = 18,
    color = '#10B981'
  ) {
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
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: Math.random() > 0.4 ? 'circle' : 'spark',
      });
    }
  }

  static updateAndDrawParticles(
    ctx: CanvasRenderingContext2D,
    particles: CanvasParticle[]
  ) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05; // slight gravity
      p.vx *= 0.98; // air resistance
      p.alpha -= p.decay;

      if (p.alpha <= 0) {
        particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;

      if (p.shape === 'spark') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  static updateAndDrawRipples(
    ctx: CanvasRenderingContext2D,
    ripples: RippleWave[]
  ) {
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.radius += 2.2;
      r.alpha -= 0.025;

      if (r.alpha <= 0 || r.radius >= r.maxRadius) {
        ripples.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, r.alpha);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
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
  ) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }
}
