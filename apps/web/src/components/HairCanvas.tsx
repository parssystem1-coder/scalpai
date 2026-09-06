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
    let mousePos = { x: -1000, y: -1000 };

    const handleMouseMove = (e: MouseEvent) => {
      mousePos = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", handleMouseMove);

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const imgWidth = 1376;
      const imgHeight = 768;
      const imgAspect = imgWidth / imgHeight;
      const screenAspect = canvas.width / canvas.height;

      if (screenAspect > imgAspect) {
        bgScale = canvas.width / imgWidth;
        bgOffsetX = 0;
        bgOffsetY = (canvas.height - imgHeight * bgScale) / 2;
      } else {
        bgScale = canvas.height / imgHeight;
        bgOffsetX = (canvas.width - imgWidth * bgScale) / 2;
        bgOffsetY = 0;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    // Exact Bezier fit to the hair shaft in the 1376x768 background image
    const p0 = { x: 658, y: 680 }; // Dermal papilla / follicle bulb
    const p1 = { x: 690, y: 480 }; // Subcutaneous follicle canal
    const p2 = { x: 730, y: 180 }; // Epidermal emergence point
    const p3 = { x: 930, y: -40 }; // Shaft upper trajectory

    const getHairPoint = (t: number) => {
      const u = Math.max(0, Math.min(1, 1 - t));
      const tt = Math.max(0, Math.min(1, t));

      const rawX = u * u * u * p0.x + 3 * u * u * tt * p1.x + 3 * u * tt * tt * p2.x + tt * tt * tt * p3.x;
      const rawY = u * u * u * p0.y + 3 * u * u * tt * p1.y + 3 * u * tt * tt * p2.y + tt * tt * tt * p3.y;

      const dx = 3 * u * u * (p1.x - p0.x) + 6 * u * tt * (p2.x - p1.x) + 3 * tt * tt * (p3.x - p2.x);
      const dy = 3 * u * u * (p1.y - p0.y) + 6 * u * tt * (p2.y - p1.y) + 3 * tt * tt * (p3.y - p2.y);
      const len = Math.hypot(dx, dy) || 1;

      // Shaft radius profile: bulb at bottom (38px) down to cortex shaft (14px)
      let r: number;
      if (t < 0.15) {
        r = 38 - (t / 0.15) * 14;
      } else if (t < 0.4) {
        r = 24 - ((t - 0.15) / 0.25) * 8;
      } else {
        r = 16 - (t - 0.4) * 3;
      }

      return {
        x: rawX * bgScale + bgOffsetX,
        y: rawY * bgScale + bgOffsetY,
        nx: -dy / len,
        ny: dx / len,
        tx: dx / len,
        ty: dy / len,
        coreRadius: r * bgScale
      };
    };

    // Build clipping path matching the inner core boundary of the hair shaft
    const buildHairCortexPath = (context: CanvasRenderingContext2D) => {
      const steps = 50;
      const leftEdge: { x: number; y: number }[] = [];
      const rightEdge: { x: number; y: number }[] = [];

      for (let i = 0; i <= steps; i++) {
        const pt = getHairPoint(i / steps);
        leftEdge.push({ x: pt.x + pt.nx * (pt.coreRadius * 0.95), y: pt.y + pt.ny * (pt.coreRadius * 0.95) });
        rightEdge.push({ x: pt.x - pt.nx * (pt.coreRadius * 0.95), y: pt.y - pt.ny * (pt.coreRadius * 0.95) });
      }

      context.beginPath();
      context.moveTo(leftEdge[0].x, leftEdge[0].y);
      for (let i = 1; i <= steps; i++) context.lineTo(leftEdge[i].x, leftEdge[i].y);
      for (let i = steps; i >= 0; i--) context.lineTo(rightEdge[i].x, rightEdge[i].y);
      context.closePath();
    };

    // Ascending active micro-bubbles & nutrient spheres
    class ActiveBubble {
      t: number;
      speed: number;
      size: number;
      radialOffset: number;
      wobbleFreq: number;
      wobblePhase: number;
      alpha: number;
      type: "lipid-bubble" | "gold-photon" | "rose-spark";

      constructor(initRandomT = true) {
        this.t = initRandomT ? Math.random() : 0.01;
        this.speed = 0.0014 + Math.random() * 0.0024;
        this.size = (2.2 + Math.random() * 4.2) * Math.max(0.65, bgScale);
        this.radialOffset = (Math.random() - 0.5) * 1.3; // -0.65 to +0.65
        this.wobbleFreq = 4 + Math.random() * 8;
        this.wobblePhase = Math.random() * Math.PI * 2;
        this.alpha = 0.65 + Math.random() * 0.35;

        const rand = Math.random();
        if (rand < 0.45) this.type = "lipid-bubble";
        else if (rand < 0.8) this.type = "gold-photon";
        else this.type = "rose-spark";
      }

      update() {
        this.t += this.speed;
        if (this.t > 1) {
          this.t = 0.01;
          this.speed = 0.0014 + Math.random() * 0.0024;
          this.radialOffset = (Math.random() - 0.5) * 1.3;
        }
      }

      draw(context: CanvasRenderingContext2D) {
        const pt = getHairPoint(this.t);
        const wobble = Math.sin(this.t * this.wobbleFreq + this.wobblePhase) * (pt.coreRadius * 0.15);
        const offset = pt.coreRadius * 0.55 * this.radialOffset + wobble;
        const px = pt.x + pt.nx * offset;
        const py = pt.y + pt.ny * offset;

        // Smooth fade-in at bottom bulb and fade-out at top tip
        let a = this.alpha;
        if (this.t < 0.08) a *= this.t / 0.08;
        if (this.t > 0.90) a *= (1 - this.t) / 0.10;

        context.save();

        if (this.type === "lipid-bubble") {
          // Glossy micro-bubble with internal gradient and specular glint
          const grad = context.createRadialGradient(
            px - this.size * 0.28,
            py - this.size * 0.28,
            this.size * 0.1,
            px,
            py,
            this.size
          );
          grad.addColorStop(0, `rgba(255, 255, 240, ${a})`);
          grad.addColorStop(0.4, `rgba(255, 215, 150, ${a * 0.85})`);
          grad.addColorStop(0.85, `rgba(220, 130, 80, ${a * 0.4})`);
          grad.addColorStop(1, `rgba(180, 80, 60, 0)`);

          context.beginPath();
          context.fillStyle = grad;
          context.arc(px, py, this.size, 0, Math.PI * 2);
          context.fill();

          // Outer lipid highlight ring
          context.beginPath();
          context.strokeStyle = `rgba(255, 250, 230, ${a * 0.75})`;
          context.lineWidth = 0.8 * bgScale;
          context.arc(px, py, this.size * 0.9, 0, Math.PI * 2);
          context.stroke();

          // Specular glint
          context.beginPath();
          context.fillStyle = `rgba(255, 255, 255, ${a * 0.95})`;
          context.arc(px - this.size * 0.35, py - this.size * 0.35, this.size * 0.25, 0, Math.PI * 2);
          context.fill();
        } else if (this.type === "gold-photon") {
          // Luminous golden energy photon
          const grad = context.createRadialGradient(px, py, 0, px, py, this.size * 1.5);
          grad.addColorStop(0, `rgba(255, 255, 230, ${a})`);
          grad.addColorStop(0.3, `rgba(255, 210, 110, ${a * 0.85})`);
          grad.addColorStop(0.7, `rgba(235, 140, 50, ${a * 0.35})`);
          grad.addColorStop(1, "rgba(200, 100, 40, 0)");

          context.fillStyle = grad;
          context.beginPath();
          context.arc(px, py, this.size * 1.5, 0, Math.PI * 2);
          context.fill();
        } else {
          // Rose-gold bioactive spark
          const grad = context.createRadialGradient(px, py, 0, px, py, this.size * 1.4);
          grad.addColorStop(0, `rgba(255, 240, 245, ${a})`);
          grad.addColorStop(0.35, `rgba(255, 160, 180, ${a * 0.8})`);
          grad.addColorStop(0.8, `rgba(215, 90, 120, ${a * 0.3})`);
          grad.addColorStop(1, "rgba(180, 60, 90, 0)");

          context.fillStyle = grad;
          context.beginPath();
          context.arc(px, py, this.size * 1.4, 0, Math.PI * 2);
          context.fill();
        }

        context.restore();
      }
    }

    const bubbles = Array.from({ length: 48 }, () => new ActiveBubble(true));

    let waveProgress1 = 0;
    let waveProgress2 = 0.45;
    let waveProgress3 = 0.80;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Clip strictly to the cortex core of the hair shaft
      ctx.save();
      buildHairCortexPath(ctx);
      ctx.clip();

      // 1. Ascending Bio-Photonic Light Wave Pulses (امواج نوری کورتکس)
      const drawLightPulse = (progress: number, intensity: number) => {
        const wavePt = getHairPoint(progress);
        ctx.save();
        ctx.globalCompositeOperation = "screen";

        // Proximity glow boost if mouse is near hair point
        const distToMouse = Math.hypot(wavePt.x - mousePos.x, wavePt.y - mousePos.y);
        const mouseBoost = distToMouse < 220 ? (1 - distToMouse / 220) * 0.4 : 0;
        const pulseRadius = wavePt.coreRadius * (1.6 + mouseBoost);

        // Core hotspot
        const waveGrad = ctx.createRadialGradient(
          wavePt.x,
          wavePt.y,
          wavePt.coreRadius * 0.15,
          wavePt.x,
          wavePt.y,
          pulseRadius
        );
        waveGrad.addColorStop(0, `rgba(255, 255, 240, ${0.9 * intensity})`);
        waveGrad.addColorStop(0.25, `rgba(255, 220, 140, ${0.75 * intensity})`);
        waveGrad.addColorStop(0.65, `rgba(235, 130, 95, ${0.35 * intensity})`);
        waveGrad.addColorStop(1, "rgba(200, 80, 80, 0)");

        ctx.fillStyle = waveGrad;
        ctx.beginPath();
        ctx.arc(wavePt.x, wavePt.y, pulseRadius, 0, Math.PI * 2);
        ctx.fill();

        // Elongated shaft illumination along tangent
        ctx.beginPath();
        const beamLen = wavePt.coreRadius * 2.2;
        const beamGrad = ctx.createLinearGradient(
          wavePt.x - wavePt.tx * beamLen,
          wavePt.y - wavePt.ty * beamLen,
          wavePt.x + wavePt.tx * beamLen,
          wavePt.y + wavePt.ty * beamLen
        );
        beamGrad.addColorStop(0, "rgba(255, 230, 160, 0)");
        beamGrad.addColorStop(0.5, `rgba(255, 250, 230, ${0.8 * intensity})`);
        beamGrad.addColorStop(1, "rgba(255, 230, 160, 0)");

        ctx.strokeStyle = beamGrad;
        ctx.lineWidth = wavePt.coreRadius * 0.75;
        ctx.lineCap = "round";
        ctx.moveTo(wavePt.x - wavePt.tx * beamLen, wavePt.y - wavePt.ty * beamLen);
        ctx.lineTo(wavePt.x + wavePt.tx * beamLen, wavePt.y + wavePt.ty * beamLen);
        ctx.stroke();

        ctx.restore();
      };

      // Advance pulses upward along shaft
      waveProgress1 = (waveProgress1 + 0.0028) % 1;
      waveProgress2 = (waveProgress2 + 0.0032) % 1;
      waveProgress3 = (waveProgress3 + 0.0024) % 1;

      drawLightPulse(waveProgress1, 1.0);
      drawLightPulse(waveProgress2, 0.85);
      drawLightPulse(waveProgress3, 0.7);

      // 2. Render all active ascending bubbles & micro-photons
      bubbles.forEach(b => {
        b.update();
        b.draw(ctx);
      });

      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-[2] pointer-events-none w-screen h-screen" />;
};

