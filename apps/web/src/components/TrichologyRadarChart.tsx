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
    <div className="relative p-6 rounded-3xl luxury-glass-card overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-rose-400/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-amber-400/10 blur-3xl pointer-events-none" />

      <div className="flex items-center justify-between mb-4 border-b border-rose-200/10 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
            <h4 className="text-sm font-bold text-white">{title}</h4>
          </div>
          <p className="text-[0.7rem] text-rose-200/70 mt-0.5">{subtitle}</p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-rose-950/70 border border-rose-400/30 text-xs shadow-sm">
          <span className="text-[0.68rem] text-rose-300/80">شاخص AI:</span>
          <span className="font-mono font-black text-rose-200">{aiScore}٪</span>
        </div>
      </div>

      {/* Radar SVG Stage */}
      <div className="flex flex-col items-center justify-center">
        <svg width={size} height={size} className="overflow-visible select-none drop-shadow-sm">
          <defs>
            <linearGradient id="radarPatientGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#d4687f" stopOpacity="0.45" />
              <stop offset="50%" stopColor="#e07a91" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#b84a62" stopOpacity="0.15" />
            </linearGradient>

            <linearGradient id="lineGlow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#d4687f" />
              <stop offset="100%" stopColor="#8f2d44" />
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
                fill={level % 2 === 0 ? "rgba(212, 104, 127, 0.04)" : "transparent"}
                stroke="rgba(184, 93, 110, 0.25)"
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
                stroke="rgba(184, 93, 110, 0.22)"
                strokeWidth="1"
              />
            );
          })}

          {/* Ideal Benchmark Polygon */}
          <polygon
            points={benchmarkPoints}
            fill="none"
            stroke="rgba(217, 119, 6, 0.55)"
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
                  stroke="#b84a62"
                  strokeWidth="2"
                  className="transition-all duration-700"
                />
                <circle
                  cx={x}
                  cy={y}
                  r="8"
                  fill="none"
                  stroke="rgba(212, 104, 127, 0.4)"
                  strokeWidth="1"
                  className="animate-pulse"
                />

                {/* Axis Label */}
                <text
                  x={labelCoord.x}
                  y={labelCoord.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#ffe4e6"
                  className="text-[0.65rem] font-bold select-none drop-shadow-md"
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
            <span className="w-3 h-3 rounded-sm bg-rose-500/70 border border-rose-300" />
            <span className="text-rose-100 font-medium">پروفایل بالینی بیمار</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-amber-400 border-b border-dashed border-amber-300" />
            <span className="text-amber-300 font-medium">استاندارد نرمال طلایی</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrichologyRadarChart;
