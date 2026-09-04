import React from "react";
import { TrendingUp } from "lucide-react";

interface WaveformPoint {
  visitDate: string;
  density: number; // hairs/cm2
  caliber: number; // µm
  anagenPct: number; // %
}

interface FollicleCaliberWaveformProps {
  data?: WaveformPoint[];
  currentCaliber?: string;
  densityTrend?: string;
}

const DEFAULT_TIMELINE: WaveformPoint[] = [
  { visitDate: "۳ ماه قبل", density: 128, caliber: 58, anagenPct: 72 },
  { visitDate: "۲ ماه قبل", density: 136, caliber: 64, anagenPct: 78 },
  { visitDate: "۱ ماه قبل", density: 142, caliber: 68, anagenPct: 83 },
  { visitDate: "امروز (ویزیت جاری)", density: 154, caliber: 74, anagenPct: 88 },
];

export const FollicleCaliberWaveform: React.FC<FollicleCaliberWaveformProps> = ({
  data = DEFAULT_TIMELINE,
  currentCaliber = "74 µm",
  densityTrend = "+۲۰.۳٪ بهبود",
}) => {
  const width = 500;
  const height = 180;
  const padding = 35;

  // Scale points
  const maxDensity = 170;
  const minDensity = 110;

  const points = data.map((d, index) => {
    const x = padding + (index / (data.length - 1)) * (width - padding * 2);
    const y =
      height -
      padding -
      ((d.density - minDensity) / (maxDensity - minDensity)) * (height - padding * 2);
    return { x, y, ...d };
  });

  const pathD = points.reduce((acc, p, idx) => {
    return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, "");

  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - padding} L ${
    points[0].x
  } ${height - padding} Z`;

  return (
    <div className="p-6 rounded-3xl bg-white/55 border border-white/80 backdrop-blur-xl shadow-md relative overflow-hidden">
      {/* Background flare */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-[oklch(82%_0.14_58/0.08)] rounded-full blur-3xl pointer-events-none" />

      <div className="flex items-center justify-between mb-4 border-b border-black/5 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <h4 className="text-sm font-bold text-[oklch(20%_0.02_20)]">روند پویای تراکم و کالیبر ساقه</h4>
          </div>
          <p className="text-[0.68rem] text-[oklch(45%_0.02_20)] mt-0.5">
            روند افزایشی تراکم فولیکولی در ۴ نوبت ویزیت تریکوسکوپی اخیر
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-left">
            <span className="text-[0.65rem] text-[oklch(50%_0.015_20)] block">ضخامت میانگین:</span>
            <span className="text-xs font-mono font-black text-[oklch(20%_0.02_20)]">{currentCaliber}</span>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold shadow-xs">
            {densityTrend}
          </span>
        </div>
      </div>

      {/* SVG Stage */}
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-44 overflow-visible drop-shadow-sm"
        >
          <defs>
            <linearGradient id="waveformGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e07a91" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#e07a91" stopOpacity="0.0" />
            </linearGradient>

            <linearGradient id="strokeLine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#c46d7d" />
              <stop offset="50%" stopColor="#e59b3c" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
          </defs>

          {/* Horizontal grid lines */}
          {[120, 140, 160].map((val) => {
            const y =
              height -
              padding -
              ((val - minDensity) / (maxDensity - minDensity)) * (height - padding * 2);
            return (
              <g key={val}>
                <line
                  x1={padding}
                  y1={y}
                  x2={width - padding}
                  y2={y}
                  stroke="rgba(196, 109, 125, 0.18)"
                  strokeDasharray="3,3"
                />
                <text
                  x={padding - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="#785963"
                  className="text-[0.6rem] font-mono opacity-80"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Area Fill */}
          <path d={areaD} fill="url(#waveformGrad)" />

          {/* Main Trend Line */}
          <path
            d={pathD}
            fill="none"
            stroke="url(#strokeLine)"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Data Nodes */}
          {points.map((p, idx) => (
            <g key={idx}>
              <circle
                cx={p.x}
                cy={p.y}
                r="5"
                fill="#ffffff"
                stroke="#c46d7d"
                strokeWidth="2.5"
                className="hover:scale-150 transition-transform cursor-pointer"
              />
              {/* Date Label */}
              <text
                x={p.x}
                y={height - 10}
                textAnchor="middle"
                fill="#5a4049"
                className="text-[0.62rem] font-medium"
              >
                {p.visitDate}
              </text>
              {/* Value Badge on top of dot */}
              <text
                x={p.x}
                y={p.y - 10}
                textAnchor="middle"
                fill="#9f2d48"
                className="text-[0.68rem] font-mono font-bold"
              >
                {p.density}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
};

export default FollicleCaliberWaveform;
