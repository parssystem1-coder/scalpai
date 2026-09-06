/* ─── Dew drop data ─────────────────────────────────────────── */
const DEW_DROPS = [
  { x: 18, y: 28, r: 3.2, delay: 0 },
  { x: 34, y: 52, r: 2.1, delay: 0.8 },
  { x: 55, y: 22, r: 4.1, delay: 1.4 },
  { x: 67, y: 68, r: 2.6, delay: 2.1 },
  { x: 78, y: 38, r: 3.5, delay: 0.4 },
  { x: 42, y: 76, r: 1.9, delay: 1.9 },
  { x: 88, y: 58, r: 2.8, delay: 0.9 },
  { x: 12, y: 64, r: 3.0, delay: 2.5 },
  { x: 62, y: 44, r: 1.6, delay: 1.2 },
  { x: 25, y: 84, r: 2.3, delay: 3.1 },
  { x: 91, y: 22, r: 1.8, delay: 0.6 },
  { x: 47, y: 14, r: 3.7, delay: 2.8 },
];

/* ─── Sparkle positions ─────────────────────────────────────── */
const SPARKLES = [
  { x: 22, y: 35, delay: 0, dur: 2.4 },
  { x: 48, y: 18, delay: 0.6, dur: 3.1 },
  { x: 71, y: 55, delay: 1.2, dur: 2.7 },
  { x: 84, y: 30, delay: 0.3, dur: 2.0 },
  { x: 15, y: 72, delay: 1.8, dur: 3.5 },
  { x: 60, y: 82, delay: 0.9, dur: 2.2 },
  { x: 35, y: 62, delay: 2.3, dur: 2.9 },
  { x: 93, y: 45, delay: 1.5, dur: 2.6 },
  { x: 58, y: 36, delay: 0.4, dur: 3.3 },
  { x: 29, y: 48, delay: 2.7, dur: 2.1 },
  { x: 76, y: 16, delay: 1.0, dur: 2.8 },
  { x: 44, y: 90, delay: 0.7, dur: 3.0 },
];

/* ─── Holographic ring configs ──────────────────────────────── */
const HOLO_RINGS = [
  { cx: 38, cy: 42, dur: 3.8, delay: 0, size: 12, hue: "rose-gold" },
  { cx: 62, cy: 35, dur: 4.5, delay: 1.2, size: 9, hue: "gold" },
  { cx: 51, cy: 62, dur: 3.2, delay: 0.7, size: 15, hue: "pearl" },
  { cx: 75, cy: 55, dur: 5.1, delay: 2.0, size: 8, hue: "rose-gold" },
  { cx: 28, cy: 58, dur: 4.0, delay: 1.6, size: 11, hue: "gold" },
];

const STRAND_LINES = [
  { y1: 15, y2: 18, delay: 0, dur: 8 },
  { y1: 28, y2: 32, delay: 1.2, dur: 9 },
  { y1: 42, y2: 46, delay: 0.5, dur: 7.5 },
  { y1: 55, y2: 58, delay: 2.1, dur: 8.8 },
  { y1: 68, y2: 71, delay: 0.9, dur: 7.2 },
  { y1: 80, y2: 84, delay: 1.7, dur: 9.5 },
];

import { useEffect, useRef } from "react";

function Sparkle({ x, y, delay, dur }: { x: number; y: number; delay: number; dur: number }) {
  return (
    <g
      transform={`translate(${x * 0.01 * 100}% ${y * 0.01 * 100}%)`}
      style={{
        animation: `sparkle-pulse ${dur}s ease-in-out ${delay}s infinite`,
        transformOrigin: "center",
      }}
    >
      <path
        d="M0,-5 L1,-1 L5,0 L1,1 L0,5 L-1,1 L-5,0 L-1,-1 Z"
        fill="url(#sparkleGrad)"
        opacity="0.9"
      />
    </g>
  );
}

function NeuralScanLine({ y, delay, dur }: { y: number; delay: number; dur: number }) {
  return (
    <line
      x1="0" y1={`${y}%`}
      x2="100%" y2={`${y}%`}
      stroke="url(#scanGrad)"
      strokeWidth="0.5"
      style={{
        animation: `neural-scan ${dur}s ease-in-out ${delay}s infinite`,
        transformOrigin: "left center",
      }}
    />
  );
}

function HoloRing({ cx, cy, dur, delay, size, hue }: (typeof HOLO_RINGS)[0]) {
  const color =
    hue === "rose-gold" ? "#C9906A" : hue === "gold" ? "#D4A96A" : "#E8D9C0";
  return (
    <g transform={`translate(${cx}%, ${cy}%)`}>
      {[0, 1, 2].map((i) => (
        <circle
          key={i}
          cx="0" cy="0"
          r={size + i * 4}
          fill="none"
          stroke={color}
          strokeWidth="0.6"
          strokeDasharray={`${(size + i * 4) * 0.4} ${(size + i * 4) * 0.6}`}
          style={{
            animation: `ring-pulse ${dur + i * 0.8}s ease-out ${delay + i * 0.4}s infinite`,
            transformOrigin: "center",
          }}
        />
      ))}
      <circle
        cx="0" cy="0"
        r={size * 0.35}
        fill={color}
        opacity="0.15"
        style={{
          animation: `dew-float ${dur * 0.6}s ease-in-out ${delay}s infinite`,
        }}
      />
    </g>
  );
}

function DewDrop({ x, y, r, delay }: (typeof DEW_DROPS)[0]) {
  return (
    <g
      style={{
        animation: `dew-float ${3.5 + delay * 0.3}s ease-in-out ${delay}s infinite`,
      }}
    >
      <circle
        cx={`${x}%`} cy={`${y}%`} r={r}
        fill="url(#dewGrad)"
        opacity="0.82"
      />
      <circle
        cx={`${x - r * 0.3}%`} cy={`${y - r * 0.35}%`} r={r * 0.28}
        fill="white"
        opacity="0.9"
      />
      <ellipse
        cx={`${x + r * 0.2}%`} cy={`${y + r * 0.3}%`} rx={r * 0.15} ry={r * 0.1}
        fill="url(#dewRefract)"
        opacity="0.7"
      />
    </g>
  );
}

function HairCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener("resize", resize);

    const W = () => canvas.offsetWidth;
    const H = () => canvas.offsetHeight;

    /* Strand definitions */
    const strands = Array.from({ length: 28 }, (_, i) => ({
      baseX: (i / 27) * W() * 1.2 - W() * 0.1,
      amplitude: 18 + Math.random() * 32,
      frequency: 0.0015 + Math.random() * 0.002,
      phase: Math.random() * Math.PI * 2,
      speed: 0.0006 + Math.random() * 0.0008,
      opacity: 0.06 + Math.random() * 0.22,
      width: 0.4 + Math.random() * 1.4,
      color: [
        [245, 234, 213],
        [240, 228, 208],
        [232, 218, 194],
        [250, 242, 228],
        [225, 205, 178],
      ][Math.floor(Math.random() * 5)],
    }));

    const draw = (t: number) => {
      ctx.clearRect(0, 0, W(), H());

      strands.forEach((s) => {
        const x = s.baseX + Math.sin(t * s.speed + s.phase) * 12;
        ctx.beginPath();
        ctx.moveTo(x, -20);

        for (let y = 0; y < H() + 20; y += 4) {
          const xOff =
            s.amplitude * Math.sin(y * s.frequency + s.phase + t * s.speed * 1.5) +
            s.amplitude * 0.3 * Math.sin(y * s.frequency * 2.1 + t * s.speed * 0.7);
          ctx.lineTo(x + xOff, y);
        }

        /* Shimmer gradient along strand */
        const grad = ctx.createLinearGradient(x, 0, x, H());
        const [r, g, b] = s.color;
        grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
        grad.addColorStop(0.2, `rgba(${r},${g},${b},${s.opacity})`);
        grad.addColorStop(0.5, `rgba(${r + 15},${g + 12},${b + 8},${s.opacity * 1.4})`);
        grad.addColorStop(0.8, `rgba(${r},${g},${b},${s.opacity * 0.7})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

        ctx.strokeStyle = grad;
        ctx.lineWidth = s.width;
        ctx.stroke();
      });

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        mixBlendMode: "multiply",
        pointerEvents: "none",
      }}
    />
  );
}

function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener("resize", resize);

    const W = () => canvas.offsetWidth;
    const H = () => canvas.offsetHeight;

    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      r: 0.5 + Math.random() * 2.5,
      vx: (Math.random() - 0.5) * 0.015,
      vy: -0.02 - Math.random() * 0.04,
      opacity: 0.2 + Math.random() * 0.7,
      life: Math.random(),
      lifeSpeed: 0.002 + Math.random() * 0.004,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, W(), H());

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life += p.lifeSpeed;

        if (p.y < -2 || p.life > 1) {
          p.x = Math.random() * 100;
          p.y = 102;
          p.life = 0;
          p.opacity = 0.2 + Math.random() * 0.7;
        }

        const fade = Math.sin(p.life * Math.PI);
        const px = (p.x / 100) * W();
        const py = (p.y / 100) * H();

        const grad = ctx.createRadialGradient(px, py, 0, px, py, p.r * 2.5);
        grad.addColorStop(0, `rgba(212,169,106,${p.opacity * fade})`);
        grad.addColorStop(0.5, `rgba(201,144,106,${p.opacity * fade * 0.5})`);
        grad.addColorStop(1, `rgba(201,144,106,0)`);

        ctx.beginPath();
        ctx.arc(px, py, p.r * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      });

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
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
  );
}

function SvgOverlay() {
  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id="dewGrad" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#FFFDF8" stopOpacity="0.95" />
          <stop offset="40%" stopColor="#F5EFE4" stopOpacity="0.75" />
          <stop offset="80%" stopColor="#D4C4AA" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#C9906A" stopOpacity="0.2" />
        </radialGradient>

        <linearGradient id="dewRefract" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFE8C0" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#FFF5E0" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#C9906A" stopOpacity="0.6" />
        </linearGradient>

        <linearGradient id="scanGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#C9906A" stopOpacity="0" />
          <stop offset="20%" stopColor="#D4A96A" stopOpacity="0.6" />
          <stop offset="50%" stopColor="#FAF7F2" stopOpacity="0.9" />
          <stop offset="80%" stopColor="#D4A96A" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#C9906A" stopOpacity="0" />
        </linearGradient>

        <radialGradient id="sparkleGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFAEE" />
          <stop offset="60%" stopColor="#D4A96A" />
          <stop offset="100%" stopColor="#C9906A" stopOpacity="0" />
        </radialGradient>

        <filter id="glow">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="dewBlur">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.15" />
        </filter>
      </defs>

      {/* Neural scan lines */}
      {STRAND_LINES.map((s, i) => (
        <NeuralScanLine key={i} y={s.y1} delay={s.delay} dur={s.dur} />
      ))}

      {/* Holographic rings */}
      <g filter="url(#glow)">
        {HOLO_RINGS.map((r, i) => (
          <HoloRing key={i} {...r} />
        ))}
      </g>

      {/* Dew drops */}
      <g filter="url(#glow)">
        {DEW_DROPS.map((d, i) => (
          <DewDrop key={i} {...d} />
        ))}
      </g>

      {/* Sparkles */}
      <g filter="url(#glow)">
        {SPARKLES.map((s, i) => (
          <Sparkle key={i} x={s.x} y={s.y} delay={s.delay} dur={s.dur} />
        ))}
      </g>
    </svg>
  );
}

export default function FigmaLuxuryBackground() {
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
      {/* Gradient background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 140% 90% at 50% 0%, #F0E6D4 0%, #FAF7F2 45%, #F5F0E8 100%)",
        }}
      />

      {/* Warm light bloom */}
      <div
        style={{
          position: "absolute",
          top: "-10%",
          left: "20%",
          width: "60%",
          height: "55%",
          background:
            "radial-gradient(ellipse, rgba(212,169,106,0.18) 0%, rgba(232,217,192,0.08) 50%, transparent 70%)",
          filter: "blur(60px)",
          animation: "holo-drift 12s ease-in-out infinite",
        }}
      />

      {/* Secondary light — rose-gold */}
      <div
        style={{
          position: "absolute",
          bottom: "5%",
          right: "10%",
          width: "45%",
          height: "40%",
          background:
            "radial-gradient(ellipse, rgba(201,144,106,0.12) 0%, rgba(232,200,180,0.06) 50%, transparent 70%)",
          filter: "blur(80px)",
          animation: "holo-drift 16s ease-in-out 2s infinite",
        }}
      />

      {/* Hair strand canvas */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.9 }}>
        <HairCanvas />
      </div>

      {/* SVG dew/rings/sparkles */}
      <SvgOverlay />

      {/* Floating particles */}
      <ParticleField />

      {/* Shallow depth-of-field vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse 70% 60% at 50% 45%, transparent 30%, rgba(250,247,242,0.55) 100%)",
        }}
      />
    </div>
  );
}
