import React, { useEffect, useRef } from "react";

export const HairCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let bgScale = 1;
    let bgOffsetX = 0;
    let bgOffsetY = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const imgAspect = 1536 / 1024;
      const screenAspect = canvas.width / canvas.height;
      if (screenAspect > imgAspect) {
        bgScale = canvas.width / 1536;
        bgOffsetX = 0;
        bgOffsetY = (canvas.height - 1024 * bgScale) / 2;
      } else {
        bgScale = canvas.height / 1024;
        bgOffsetX = (canvas.width - 1536 * bgScale) / 2;
        bgOffsetY = 0;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const getHairPoint = (t: number) => {
      const p0 = { x: 1036.5, y: 850.0 };
      const p1 = { x: 995.0, y: 560.0 };
      const p2 = { x: 865.0, y: 260.0 };
      const p3 = { x: 672.0, y: -20.0 };

      const u = 1 - t;
      const rawX = u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x;
      const rawY = u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y;

      const dx = 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
      const dy = 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);
      const len = Math.hypot(dx, dy) || 1;

      return {
        x: rawX * bgScale + bgOffsetX,
        y: rawY * bgScale + bgOffsetY,
        nx: -dy / len,
        ny: dx / len,
        coreRadius: ((1 - t) * 55.0 + t * 24.0) * bgScale
      };
    };

    const buildHairCortexPath = (context: CanvasRenderingContext2D) => {
      const steps = 40;
      const leftEdge: { x: number; y: number }[] = [];
      const rightEdge: { x: number; y: number }[] = [];
      for (let i = 0; i <= steps; i++) {
        const pt = getHairPoint(i / steps);
        leftEdge.push({ x: pt.x + pt.nx * (pt.coreRadius * 0.9), y: pt.y + pt.ny * (pt.coreRadius * 0.9) });
        rightEdge.push({ x: pt.x - pt.nx * (pt.coreRadius * 0.9), y: pt.y - pt.ny * (pt.coreRadius * 0.9) });
      }
      context.beginPath();
      context.moveTo(leftEdge[0].x, leftEdge[0].y);
      for (let i = 1; i <= steps; i++) context.lineTo(leftEdge[i].x, leftEdge[i].y);
      for (let i = steps; i >= 0; i--) context.lineTo(rightEdge[i].x, rightEdge[i].y);
      context.closePath();
    };

    class Particle {
      t: number;
      speed: number;
      size: number;
      radialOffset: number;
      alpha: number;
      glowHue: string;

      constructor() {
        this.t = Math.random();
        this.speed = 0.0016 + Math.random() * 0.0022;
        this.size = (2.0 + Math.random() * 4.5) * Math.max(0.6, bgScale);
        this.radialOffset = (Math.random() - 0.5) * 1.4;
        this.alpha = 0.4 + Math.random() * 0.55;
        this.glowHue = Math.random() > 0.4 ? "gold" : "rose";
      }

      update() {
        this.t += this.speed;
        if (this.t > 1) this.t = 0.01;
      }

      draw(context: CanvasRenderingContext2D) {
        const pt = getHairPoint(this.t);
        const px = pt.x + pt.nx * (pt.coreRadius * 0.7 * this.radialOffset);
        const py = pt.y + pt.ny * (pt.coreRadius * 0.7 * this.radialOffset);
        let a = this.alpha;
        if (this.t < 0.12) a *= this.t / 0.12;
        if (this.t > 0.88) a *= (1 - this.t) / 0.12;

        context.save();
        context.beginPath();
        const grad = context.createRadialGradient(px - this.size * 0.3, py - this.size * 0.3, this.size * 0.1, px, py, this.size);
        if (this.glowHue === "gold") {
          grad.addColorStop(0, `rgba(255, 250, 225, ${a})`);
          grad.addColorStop(1, "rgba(215, 140, 50, 0)");
        } else {
          grad.addColorStop(0, `rgba(255, 235, 240, ${a})`);
          grad.addColorStop(1, "rgba(180, 80, 95, 0)");
        }
        context.fillStyle = grad;
        context.arc(px, py, this.size, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    }

    const particles = Array.from({ length: 42 }, () => new Particle());
    let waveProgress = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      buildHairCortexPath(ctx);
      ctx.clip();

      waveProgress = (waveProgress + 0.0035) % 1;
      const wavePt = getHairPoint(waveProgress);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const pulseRadius = wavePt.coreRadius * 1.8;
      const waveGrad = ctx.createRadialGradient(wavePt.x, wavePt.y, 2, wavePt.x, wavePt.y, pulseRadius);
      waveGrad.addColorStop(0, "rgba(255, 245, 220, 0.85)");
      waveGrad.addColorStop(1, "rgba(220, 130, 120, 0)");
      ctx.fillStyle = waveGrad;
      ctx.beginPath();
      ctx.arc(wavePt.x, wavePt.y, pulseRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      particles.forEach(p => {
        p.update();
        p.draw(ctx);
      });
      ctx.restore();

      animId = requestAnimationFrame(render);
    };
    render();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-[2] pointer-events-none w-screen h-screen" />;
};
