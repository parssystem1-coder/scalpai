import { useMemo, useState } from 'react';
import type { LesionSummaryItem } from '../db';
import { lesionDisplayLabel } from '../lib/diagnosisCatalog';
import { LESION_PIE_COLORS } from '../pages/offline-analysis/constants';

export interface LesionSlice {
  name: string;
  value: number;
  color: string;
}

interface Props {
  lesions: { type: string; confidence: number }[];
  summary?: LesionSummaryItem[];
  lang?: 'fa' | 'en';
  title: string;
}

function polarToCartesian(cx: number, cy: number, rx: number, ry: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + rx * Math.cos(rad),
    y: cy + ry * Math.sin(rad),
  };
}

function describeTopSlice(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  startAngle: number,
  endAngle: number,
) {
  const start = polarToCartesian(cx, cy, rx, ry, startAngle);
  const end = polarToCartesian(cx, cy, rx, ry, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${rx} ${ry} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    'Z',
  ].join(' ');
}

function describeWall(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  depth: number,
  startAngle: number,
  endAngle: number,
) {
  const topStart = polarToCartesian(cx, cy, rx, ry, startAngle);
  const topEnd = polarToCartesian(cx, cy, rx, ry, endAngle);
  const botStart = { x: topStart.x, y: topStart.y + depth };
  const botEnd = { x: topEnd.x, y: topEnd.y + depth };
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${topStart.x} ${topStart.y}`,
    `A ${rx} ${ry} 0 ${largeArc} 1 ${topEnd.x} ${topEnd.y}`,
    `L ${botEnd.x} ${botEnd.y}`,
    `A ${rx} ${ry} 0 ${largeArc} 0 ${botStart.x} ${botStart.y}`,
    'Z',
  ].join(' ');
}

function darken(hex: string, amount = 0.35) {
  const h = hex.replace('#', '');
  const num = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  const r = Math.max(0, ((num >> 16) & 255) * (1 - amount));
  const g = Math.max(0, ((num >> 8) & 255) * (1 - amount));
  const b = Math.max(0, (num & 255) * (1 - amount));
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function lighten(hex: string, amount = 0.2) {
  const h = hex.replace('#', '');
  const num = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  const r = Math.min(255, ((num >> 16) & 255) + (255 - ((num >> 16) & 255)) * amount);
  const g = Math.min(255, ((num >> 8) & 255) + (255 - ((num >> 8) & 255)) * amount);
  const b = Math.min(255, (num & 255) + (255 - (num & 255)) * amount);
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function offsetForMid(mid: number, explode: number) {
  const rad = ((mid - 90) * Math.PI) / 180;
  return {
    dx: Math.cos(rad) * explode,
    dy: Math.sin(rad) * explode * 0.45,
  };
}

/**
 * نمودار دایره‌ای سه‌بعدی ایزومتریک برای توزیع ضایعات —
 * بدون برچسب روی خود نمودار تا شلوغ نشود.
 */
export default function LesionDistribution3D({ lesions, summary, lang = 'fa', title }: Props) {
  const [active, setActive] = useState<number | null>(null);

  const slices = useMemo<LesionSlice[]>(() => {
    if (summary?.length) {
      return summary.map((item, i) => ({
        name: lesionDisplayLabel(item.type, lang),
        // هر نوع ضایعه فقط یک بار؛ مقدار بر اساس photo-region یکتا است.
        value: Math.max(1, item.affectedPhotoRegionCount),
        color: LESION_PIE_COLORS[i % LESION_PIE_COLORS.length],
      }));
    }
    const grouped = new Map<string, { total: number; max: number }>();
    for (const lesion of lesions) {
      const current = grouped.get(lesion.type) || { total: 0, max: 0 };
      current.total += 1;
      current.max = Math.max(current.max, lesion.confidence);
      grouped.set(lesion.type, current);
    }
    return [...grouped.entries()].map(([type, value], i) => ({
      name: lesionDisplayLabel(type, lang),
      value: Math.max(1, value.total),
      color: LESION_PIE_COLORS[i % LESION_PIE_COLORS.length],
    }));
  }, [lesions, summary, lang]);

  const total = slices.reduce((s, x) => s + x.value, 0) || 1;

  const geometry = useMemo(() => {
    const cx = 160;
    const cy = 78;
    const rx = 120;
    const ry = 48;
    const depth = 28;
    let angle = 0;
    return slices.map((slice, index) => {
      const span = (slice.value / total) * 360;
      const startAngle = angle;
      const endAngle = angle + Math.max(span, 0.8);
      angle = endAngle;
      const mid = (startAngle + endAngle) / 2;
      const wallVisible = mid > 0 && mid < 180;
      return {
        ...slice,
        index,
        startAngle,
        endAngle,
        mid,
        wallVisible,
        topPath: describeTopSlice(cx, cy, rx, ry, startAngle, endAngle),
        wallPath: describeWall(cx, cy, rx, ry, depth, startAngle, endAngle),
      };
    });
  }, [slices, total]);

  const wallsBackToFront = [...geometry]
    .filter(g => g.wallVisible)
    .sort(
      (a, b) =>
        Math.sin(((a.mid - 90) * Math.PI) / 180) - Math.sin(((b.mid - 90) * Math.PI) / 180),
    );

  if (slices.length === 0) return null;

  return (
    <div
      className="rounded-2xl bg-white/5 border border-white/10 p-6 overflow-hidden"
      data-print-chart="lesions"
      data-print-title={title}
    >
      <h3 className="font-semibold mb-5">{title}</h3>
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6 items-center">
        <div
          className="relative flex items-center justify-center min-h-[280px]"
          style={{
            background:
              'radial-gradient(ellipse at 50% 72%, rgba(16,185,129,0.1) 0%, transparent 58%)',
          }}
        >
          <div
            className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[72%] h-7 rounded-[100%] bg-black/45 blur-md pointer-events-none"
            aria-hidden
          />
          <svg
            viewBox="0 0 320 300"
            className="w-full max-w-[440px] lesion-3d-chart"
            role="img"
            aria-label={title}
          >
            <defs>
              {geometry.map(g => (
                <linearGradient
                  key={`g-${g.index}`}
                  id={`lesion3d-grad-${g.index}`}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor={lighten(g.color, 0.3)} />
                  <stop offset="50%" stopColor={g.color} />
                  <stop offset="100%" stopColor={darken(g.color, 0.28)} />
                </linearGradient>
              ))}
              <filter id="lesion3d-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <radialGradient id="lesion3d-center" cx="45%" cy="35%" r="65%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </radialGradient>
            </defs>

            {wallsBackToFront.map(g => {
              const explode = active === g.index ? 8 : 0;
              const { dx, dy } = offsetForMid(g.mid, explode);
              return (
                <path
                  key={`wall-${g.index}`}
                  d={g.wallPath}
                  transform={`translate(${dx}, ${dy})`}
                  fill={darken(g.color, active === g.index ? 0.12 : 0.42)}
                  stroke={darken(g.color, 0.55)}
                  strokeWidth={0.5}
                  opacity={active === null || active === g.index ? 1 : 0.3}
                  className="transition-all duration-200"
                  onMouseEnter={() => setActive(g.index)}
                  onMouseLeave={() => setActive(null)}
                />
              );
            })}

            {geometry.map(g => {
              const isActive = active === g.index;
              const { dx, dy } = offsetForMid(g.mid, isActive ? 8 : 0);
              return (
                <g
                  key={`top-${g.index}`}
                  transform={`translate(${dx}, ${dy})`}
                  onMouseEnter={() => setActive(g.index)}
                  onMouseLeave={() => setActive(null)}
                  className="cursor-pointer"
                  filter={isActive ? 'url(#lesion3d-glow)' : undefined}
                >
                  <path
                    d={g.topPath}
                    fill={`url(#lesion3d-grad-${g.index})`}
                    stroke={lighten(g.color, 0.4)}
                    strokeWidth={isActive ? 1.6 : 0.7}
                    opacity={active === null || isActive ? 1 : 0.38}
                    className="transition-all duration-200"
                  />
                </g>
              );
            })}

            <ellipse
              cx="160"
              cy="78"
              rx="118"
              ry="46"
              fill="url(#lesion3d-center)"
              pointerEvents="none"
            />
            <ellipse
              cx="160"
              cy="78"
              rx="118"
              ry="46"
              fill="none"
              stroke="rgba(255,255,255,0.14)"
              strokeWidth="1"
              pointerEvents="none"
            />
            {/* Hidden on screen; included inside the captured SVG so printed/PDF
                charts retain the values that normally live in the HTML legend. */}
            <g className="lesion-print-values">
              {geometry.map((g, index) => {
                const column = index % 2;
                const row = Math.floor(index / 2);
                const pct = Math.round((g.value / total) * 100);
                return (
                  <text key={`print-${g.index}`} x={column === 0 ? 8 : 165} y={218 + row * 18} fill="#111827" fontSize="10" fontFamily="Tahoma, sans-serif" fontWeight="600">
                    {`${g.name}: ${pct}%`}
                  </text>
                );
              })}
            </g>
          </svg>

          {active !== null && geometry[active] && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-black/70 border border-white/10 text-xs whitespace-nowrap backdrop-blur-sm">
              <span className="font-medium">{geometry[active].name}</span>
              <span className="opacity-70 mx-1.5">·</span>
              <span className="font-bold tabular-nums">
                {Math.round((geometry[active].value / total) * 100)}%
              </span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {geometry.map(g => {
            const pct = Math.round((g.value / total) * 100);
            const isActive = active === g.index;
            return (
              <button
                key={`leg-${g.index}`}
                type="button"
                onMouseEnter={() => setActive(g.index)}
                onMouseLeave={() => setActive(null)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-start transition ${
                  isActive ? 'bg-white/10 scale-[1.02]' : 'bg-white/5 hover:bg-white/8'
                }`}
              >
                <span
                  className="w-3.5 h-3.5 rounded-md flex-shrink-0"
                  style={{
                    background: `linear-gradient(135deg, ${lighten(g.color, 0.25)}, ${g.color})`,
                    boxShadow: `0 0 10px ${g.color}66`,
                  }}
                />
                <span className="flex-1 min-w-0 truncate text-sm font-medium">{g.name}</span>
                <span className="text-sm font-bold tabular-nums opacity-90">{pct}%</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
