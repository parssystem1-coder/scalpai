import React from "react";

export interface RadarMetric {
  label: string;
  value: number; // 0 - 100
  benchmark: number; // 0 - 100
  unit?: string;
}

interface TrichologyRadarChartProps {
  metrics: RadarMetric[];
  title?: string;
  subtitle?: string;
  aiScore?: number;
}

export const TrichologyRadarChart: React.FC<TrichologyRadarChartProps> = ({
  metrics,
  title = "ماتریس ۶ محوره تریکولوژی هوشمند",
  subtitle = "محاسبه بردار سلامت فولیکولی توسط شبکه عصبی عمیق",
  aiScore = 94,
}) => {
  const size = 320;
  const center = size / 2;
  const radius = size * 0.38;
  const total = metrics.length;

  const getCoordinates = (index: number, value: number, maxVal = 100) => {
    const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
    const r = (value / maxVal) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  // Generate path points for AI patient polygon
  const patientPoints = metrics
    .map((m, i) => {
      const { x, y } = getCoordinates(i, m.value);
      return `${x},${y}`;
    })
    .join(" ");

  // Generate path points for ideal benchmark polygon
  const benchmarkPoints = metrics
    .map((m, i) => {
      const { x, y } = getCoordinates(i, m.benchmark);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="relative p-6 rounded-3xl bg-white/55 border border-white/80 backdrop-blur-xl shadow-md overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-[oklch(82%_0.14_58/0.08)] blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-[oklch(62%_0.09_16/0.08)] blur-3xl pointer-events-none" />

      <div className="flex items-center justify-between mb-4 border-b border-black/5 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[oklch(62%_0.09_16)] animate-ping" />
            <h4 className="text-sm font-bold text-[oklch(20%_0.02_20)]">{title}</h4>
          </div>
          <p className="text-[0.7rem] text-[oklch(45%_0.02_20)] mt-0.5">{subtitle}</p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 border border-black/5 text-xs shadow-xs">
          <span className="text-[0.68rem] text-[oklch(50%_0.015_20)]">شاخص AI:</span>
          <span className="font-mono font-black text-[oklch(20%_0.02_20)]">{aiScore}٪</span>
        </div>
      </div>

      {/* Radar SVG Stage */}
      <div className="flex flex-col items-center justify-center">
        <svg width={size} height={size} className="overflow-visible select-none drop-shadow-sm">
          <defs>
            <linearGradient id="radarPatientGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#c46d7d" stopOpacity="0.35" />
              <stop offset="50%" stopColor="#e07a91" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#c46d7d" stopOpacity="0.1" />
            </linearGradient>

            <linearGradient id="lineGlow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#c46d7d" />
              <stop offset="100%" stopColor="#a84d5f" />
            </linearGradient>

            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Web concentric rings (20%, 40%, 60%, 80%, 100%) */}
          {[0.25, 0.5, 0.75, 1].map((scale, level) => {
            const r = radius * scale;
            const ringPoints = Array.from({ length: total })
              .map((_, i) => {
                const angle = (Math.PI * 2 * i) / total - Math.PI / 2;
                return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
              })
              .join(" ");

            return (
              <polygon
                key={level}
                points={ringPoints}
                fill={level % 2 === 0 ? "rgba(196, 109, 125, 0.04)" : "transparent"}
                stroke="rgba(184, 93, 110, 0.2)"
                strokeWidth="1"
                strokeDasharray={level === 3 ? "none" : "3,3"}
              />
            );
          })}

          {/* Spoke Axes */}
          {metrics.map((_, i) => {
            const { x, y } = getCoordinates(i, 100);
            return (
              <line
                key={i}
                x1={center}
                y1={center}
                x2={x}
                y2={y}
                stroke="rgba(184, 93, 110, 0.2)"
                strokeWidth="1"
              />
            );
          })}

          {/* Ideal Benchmark Polygon */}
          <polygon
            points={benchmarkPoints}
            fill="none"
            stroke="rgba(217, 119, 6, 0.6)"
            strokeWidth="1.5"
            strokeDasharray="4,4"
          />

          {/* Patient Current Polygon */}
          <polygon
            points={patientPoints}
            fill="url(#radarPatientGrad)"
            stroke="url(#lineGlow)"
            strokeWidth="2.5"
            filter="url(#glow)"
            className="transition-all duration-700 ease-out"
          />

          {/* Metric Vertex Nodes */}
          {metrics.map((m, i) => {
            const { x, y } = getCoordinates(i, m.value);
            const labelCoord = getCoordinates(i, 122);
            return (
              <g key={i}>
                <circle
                  cx={x}
                  cy={y}
                  r="4.5"
                  fill="#ffffff"
                  stroke="#c46d7d"
                  strokeWidth="2"
                  className="transition-all duration-700"
                />
                <circle
                  cx={x}
                  cy={y}
                  r="8"
                  fill="none"
                  stroke="rgba(212, 104, 127, 0.35)"
                  strokeWidth="1"
                  className="animate-pulse"
                />

                {/* Axis Label */}
                <text
                  x={labelCoord.x}
                  y={labelCoord.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#2b1f23"
                  className="text-[0.65rem] font-bold select-none"
                >
                  {m.label} ({m.value}%)
                </text>
              </g>
            );
          })}
        </svg>

        {/* Legend */}
        <div className="flex items-center gap-6 mt-3 text-[0.7rem]">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-[oklch(62%_0.09_16)] border border-[oklch(62%_0.09_16)]" />
            <span className="text-[oklch(30%_0.02_20)] font-medium">پروفایل بالینی بیمار</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-amber-500 border-b border-dashed border-amber-600" />
            <span className="text-amber-700 font-medium">استاندارد نرمال طلایی</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrichologyRadarChart;
