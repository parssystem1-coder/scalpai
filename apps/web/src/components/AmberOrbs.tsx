import React, { useEffect, useRef } from "react";

const ORB_CONFIGS = [
  { size: 125, xPct: 78, yPct: 15, speedY: 0.0008, speedX: 0.0006, ampY: 38, ampX: 24, phase: 0.2, rotSpeed: 0.0004, parallaxFactor: 0.045 },
  { size: 85,  xPct: 88, yPct: 52, speedY: 0.0011, speedX: 0.0009, ampY: 30, ampX: 20, phase: 1.8, rotSpeed: -0.0006, parallaxFactor: 0.035 },
  { size: 52,  xPct: 60, yPct: 26, speedY: 0.0014, speedX: 0.0012, ampY: 22, ampX: 18, phase: 3.2, rotSpeed: 0.0008, parallaxFactor: 0.022 },
  { size: 105, xPct: 72, yPct: 78, speedY: 0.0007, speedX: 0.0005, ampY: 34, ampX: 22, phase: 4.5, rotSpeed: -0.0003, parallaxFactor: 0.040 },
  { size: 42,  xPct: 53, yPct: 66, speedY: 0.0016, speedX: 0.0013, ampY: 20, ampX: 15, phase: 2.1, rotSpeed: 0.0009, parallaxFactor: 0.018 }
];

export const AmberOrbs: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let animId: number;
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let targetMouseX = mouseX;
    let targetMouseY = mouseY;

    const handleMouseMove = (e: MouseEvent) => {
      targetMouseX = e.clientX;
      targetMouseY = e.clientY;
    };
    window.addEventListener("mousemove", handleMouseMove);

    const orbs = containerRef.current?.querySelectorAll<HTMLDivElement>(".amber-orb-item");

    const animate = (time: number) => {
      mouseX += (targetMouseX - mouseX) * 0.05;
      mouseY += (targetMouseY - mouseY) * 0.05;
      const normX = mouseX - window.innerWidth / 2;
      const normY = mouseY - window.innerHeight / 2;

      orbs?.forEach((el, idx) => {
        const cfg = ORB_CONFIGS[idx];
        const waveY = Math.sin(time * cfg.speedY + cfg.phase) * cfg.ampY + Math.cos(time * cfg.speedY * 0.5) * (cfg.ampY * 0.35);
        const waveX = Math.cos(time * cfg.speedX + cfg.phase) * cfg.ampX + Math.sin(time * cfg.speedX * 0.7) * (cfg.ampX * 0.3);
        const breathScale = 1 + Math.sin(time * cfg.speedY * 0.8 + cfg.phase) * 0.045;
        const rotation = time * cfg.rotSpeed * 30;

        el.style.transform = `translate3d(${(waveX + normX * cfg.parallaxFactor).toFixed(2)}px, ${(waveY + normY * cfg.parallaxFactor).toFixed(2)}px, 0) scale(${breathScale.toFixed(3)}) rotate(${rotation.toFixed(2)}deg)`;
      });

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div ref={containerRef} className="fixed inset-0 z-[1] pointer-events-none overflow-hidden">
      {ORB_CONFIGS.map((cfg, idx) => (
        <div
          key={idx}
          className="amber-orb-item"
          style={{
            width: `${cfg.size}px`,
            height: `${cfg.size}px`,
            left: `${cfg.xPct}%`,
            top: `${cfg.yPct}%`,
          }}
        />
      ))}
    </div>
  );
};
