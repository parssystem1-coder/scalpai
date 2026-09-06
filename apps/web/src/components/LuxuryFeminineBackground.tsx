import { useEffect, useRef, useState } from "react";

export default function LuxuryFeminineBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      setMousePos({ x, y });
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const W = () => canvas.offsetWidth;
    const H = () => canvas.offsetHeight;

    // Glowing luxury particles (Rose Gold, Champagne, Diamond dust)
    const particleCount = 55;
    const particles = Array.from({ length: particleCount }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      radius: 0.8 + Math.random() * 2.8,
      speedX: (Math.random() - 0.5) * 0.02,
      speedY: -0.015 - Math.random() * 0.035,
      opacity: 0.2 + Math.random() * 0.7,
      color: [
        [228, 160, 172], // Rose Petal
        [212, 148, 156], // Rose Gold
        [245, 222, 196], // Champagne Silk
        [255, 240, 245], // Lavender Mist
        [230, 190, 150], // Warm Amber
      ][Math.floor(Math.random() * 5)],
      pulse: Math.random() * Math.PI * 2,
    }));

    // Flowing silk strands for hair & trichology aesthetics
    const strandCount = 20;
    const strands = Array.from({ length: strandCount }, (_, i) => ({
      baseX: (i / (strandCount - 1)) * 110 - 5,
      amplitude: 25 + Math.random() * 45,
      frequency: 0.0012 + Math.random() * 0.0016,
      phase: Math.random() * Math.PI * 2,
      speed: 0.0004 + Math.random() * 0.0006,
      opacity: 0.08 + Math.random() * 0.18,
      thickness: 0.8 + Math.random() * 1.6,
      tint: i % 2 === 0 ? "rgba(224, 150, 165, " : "rgba(230, 195, 170, ",
    }));

    const render = (time: number) => {
      ctx.clearRect(0, 0, W(), H());

      // 1. Draw flowing silk waves
      strands.forEach((strand) => {
        const px = (strand.baseX / 100) * W() + Math.sin(time * strand.speed + strand.phase) * 20;
        ctx.beginPath();
        ctx.moveTo(px, -40);

        for (let y = 0; y <= H() + 40; y += 8) {
          const wave =
            strand.amplitude * Math.sin(y * strand.frequency + strand.phase + time * strand.speed) +
            (strand.amplitude * 0.4) * Math.cos(y * strand.frequency * 1.8 + time * strand.speed * 0.7);
          ctx.lineTo(px + wave, y);
        }

        const strokeGrad = ctx.createLinearGradient(0, 0, 0, H());
        strokeGrad.addColorStop(0, `${strand.tint}0)`);
        strokeGrad.addColorStop(0.3, `${strand.tint}${strand.opacity})`);
        strokeGrad.addColorStop(0.7, `${strand.tint}${strand.opacity * 1.5})`);
        strokeGrad.addColorStop(1, `${strand.tint}0)`);

        ctx.strokeStyle = strokeGrad;
        ctx.lineWidth = strand.thickness;
        ctx.stroke();
      });

      // 2. Draw luxury floating luminous orbs & diamond dust
      particles.forEach((p) => {
        p.x += p.speedX;
        p.y += p.speedY;
        p.pulse += 0.025;

        if (p.y < -5) {
          p.y = 105;
          p.x = Math.random() * 100;
        }

        const currentRadius = p.radius * (1 + 0.25 * Math.sin(p.pulse));
        const px = (p.x / 100) * W();
        const py = (p.y / 100) * H();

        const [r, g, b] = p.color;
        const alpha = p.opacity * (0.6 + 0.4 * Math.sin(p.pulse));

        const radGrad = ctx.createRadialGradient(px, py, 0, px, py, currentRadius * 3);
        radGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
        radGrad.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`);
        radGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.beginPath();
        ctx.arc(px, py, currentRadius * 3, 0, Math.PI * 2);
        ctx.fillStyle = radGrad;
        ctx.fill();
      });

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      {/* 1. Base Realistic 3D Hair Follicle & Cellular Bulb Render */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url('/hero-follicle-bg.jpg')`,
          backgroundSize: "cover",
          backgroundPosition: "center right",
          transform: "scale(1.03)",
          animation: "float-gentle 14s ease-in-out infinite",
          filter: "contrast(102%) brightness(101%)",
        }}
      />

      {/* 2. Soft Ambient Lighting Overlay for perfect readability */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
            linear-gradient(90deg, 
              rgba(251, 243, 245, 0.92) 0%, 
              rgba(250, 245, 240, 0.78) 38%, 
              rgba(245, 236, 232, 0.35) 70%, 
              rgba(251, 243, 245, 0.2) 100%
            )
          `,
          mixBlendMode: "normal",
        }}
      />

      {/* 3. Interactive Dynamic Mouse Ambient Glow (3D Lighting) */}
      <div
        style={{
          position: "absolute",
          top: `${mousePos.y}%`,
          left: `${mousePos.x}%`,
          width: "550px",
          height: "550px",
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(235, 180, 190, 0.3) 0%, rgba(240, 205, 185, 0.12) 45%, transparent 70%)",
          filter: "blur(50px)",
          transition: "top 0.15s cubic-bezier(0.1, 1, 0.2, 1), left 0.15s cubic-bezier(0.1, 1, 0.2, 1)",
          pointerEvents: "none",
        }}
      />

      {/* 4. Glowing Bulb Caustics Pulsing Glow */}
      <div
        style={{
          position: "absolute",
          top: "62%",
          right: "26%",
          width: "280px",
          height: "280px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(245, 195, 140, 0.45) 0%, rgba(228, 145, 155, 0.25) 45%, transparent 70%)",
          filter: "blur(35px)",
          animation: "glow-pulse 6s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />

      {/* 5. Canvas with Silk Waves and Floating Particles */}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
