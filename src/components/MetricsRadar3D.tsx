import { useMemo, useState } from 'react';

export interface RadarMetric {
  metric: string;
  value: number;
}

interface Props {
  data: RadarMetric[];
  title: string;
}

const AXIS_COLORS = [
  '#22d3ee',
  '#34d399',
  '#fbbf24',
  '#fb7185',
  '#a78bfa',
  '#60a5fa',
  '#f472b6',
  '#4ade80',
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function polarPoint(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  angleDeg: number,
  radiusNorm: number,
) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + Math.cos(rad) * rx * radiusNorm,
    y: cy + Math.sin(rad) * ry * radiusNorm,
  };
}

/**
 * نمودار رادار سه‌بعدی ایزومتریک — نمای کلی شاخص‌ها
 */
export default function MetricsRadar3D({ data, title }: Props) {
  const [active, setActive] = useState<number | null>(null);

  const items = useMemo(
    () =>
      data.map((d, i) => ({
        metric: d.metric,
        value: clamp(Number(d.value) || 0, 0, 100),
        color: AXIS_COLORS[i % AXIS_COLORS.length],
      })),
    [data],
  );

  const n = items.length;
  if (n < 3) return null;

  const cx = 210;
  const cy = 128;
  const rx = 118;
  const ry = 52;
  const depth = 28;
  const levels = [0.25, 0.5, 0.75, 1];

  const angleStep = 360 / n;

  const axisAngles = items.map((_, i) => i * angleStep);

  const baseRing = (level: number) =>
    axisAngles
      .map(a => polarPoint(cx, cy, rx, ry, a, level))
      .map(p => `${p.x},${p.y}`)
      .join(' ');

  const dataPoints = items.map((item, i) =>
    polarPoint(cx, cy, rx, ry, axisAngles[i], item.value / 100),
  );

  const dataPath = dataPoints.map(p => `${p.x},${p.y}`).join(' ');

  // دیواره‌های جانبی بین صفحه داده و صفحه پایه (برای حس حجم)
  const wallFaces = dataPoints.map((top, i) => {
    const next = dataPoints[(i + 1) % n];
    const bot1 = { x: top.x, y: top.y + depth };
    const bot2 = { x: next.x, y: next.y + depth };
    // فقط دیواره‌های «جلویی» را پررنگ‌تر نشان بده
    const midY = (top.y + next.y) / 2;
    const isFront = midY >= cy - 4;
    return {
      i,
      points: `${top.x},${top.y} ${next.x},${next.y} ${bot2.x},${bot2.y} ${bot1.x},${bot1.y}`,
      isFront,
      midY,
    };
  });

  const wallsSorted = [...wallFaces].sort((a, b) => a.midY - b.midY);

  const floorPoints = axisAngles
    .map(a => {
      const p = polarPoint(cx, cy, rx, ry, a, 1);
      return { x: p.x, y: p.y + depth };
    })
    .map(p => `${p.x},${p.y}`)
    .join(' ');

  return (
    <div
      className="rounded-2xl bg-white/5 border border-white/10 p-6 overflow-hidden"
      data-print-chart="radar"
      data-print-title={title}
    >
      <h3 className="font-semibold mb-5">{title}</h3>

      <div
        className="relative grid grid-cols-1 lg:grid-cols-[1.35fr_0.65fr] gap-5 items-center"
      >
        <div
          className="relative flex items-center justify-center min-h-[320px]"
          style={{
            background:
              'radial-gradient(ellipse at 50% 62%, rgba(52,211,153,0.1) 0%, transparent 55%)',
          }}
        >
          <div
            className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[58%] h-8 rounded-[100%] bg-black/40 blur-md pointer-events-none"
            aria-hidden
          />

          <svg
            viewBox="0 0 420 300"
            className="w-full max-w-[520px] metrics-radar-3d"
            role="img"
            aria-label={title}
          >
            <defs>
              <linearGradient id="radar3d-fill" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.75" />
                <stop offset="45%" stopColor="#22d3ee" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.65" />
              </linearGradient>
              <linearGradient id="radar3d-wall" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#065f46" stopOpacity="0.35" />
              </linearGradient>
              <linearGradient id="radar3d-stroke" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6ee7b7" />
                <stop offset="50%" stopColor="#67e8f9" />
                <stop offset="100%" stopColor="#c4b5fd" />
              </linearGradient>
              <filter id="radar3d-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <radialGradient id="radar3d-center" cx="50%" cy="45%" r="55%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.14)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </radialGradient>
            </defs>

            {/* کف سه‌بعدی */}
            <polygon
              points={floorPoints}
              fill="rgba(16,185,129,0.08)"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={1}
            />

            {/* دیواره‌های حجم داده */}
            {wallsSorted.map(w => (
              <polygon
                key={`wall-${w.i}`}
                points={w.points}
                fill="url(#radar3d-wall)"
                opacity={w.isFront ? 0.7 : 0.35}
                stroke="rgba(16,185,129,0.25)"
                strokeWidth={0.5}
              />
            ))}

            {/* حلقه‌های شبکه روی صفحه بالا */}
            {levels.map(level => (
              <polygon
                key={`ring-${level}`}
                points={baseRing(level)}
                fill="none"
                stroke={
                  level === 1 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)'
                }
                strokeWidth={level === 1 ? 1.4 : 1}
                strokeDasharray={level === 1 ? undefined : '3 4'}
              />
            ))}

            {/* محورها */}
            {axisAngles.map((angle, i) => {
              const tip = polarPoint(cx, cy, rx, ry, angle, 1);
              return (
                <line
                  key={`axis-${i}`}
                  x1={cx}
                  y1={cy}
                  x2={tip.x}
                  y2={tip.y}
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth={1}
                />
              );
            })}

            {/* هایلایت مرکز */}
            <ellipse
              cx={cx}
              cy={cy}
              rx={rx * 0.22}
              ry={ry * 0.22}
              fill="url(#radar3d-center)"
              pointerEvents="none"
            />

            {/* سطح داده */}
            <polygon
              points={dataPath}
              fill="url(#radar3d-fill)"
              stroke="url(#radar3d-stroke)"
              strokeWidth={2.2}
              strokeLinejoin="round"
              filter="url(#radar3d-glow)"
              className="radar-3d-surface"
            />

            {/* نقاط رأس */}
            {dataPoints.map((p, i) => {
              const isActive = active === i;
              const labelPos = polarPoint(cx, cy, rx + 28, ry + 18, axisAngles[i], 1);
              const short =
                items[i].metric.length > 8
                  ? `${items[i].metric.slice(0, 7)}…`
                  : items[i].metric;

              return (
                <g
                  key={`pt-${i}`}
                  className="cursor-pointer"
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                >
                  {/* خط راهنما به برچسب */}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isActive ? 7 : 5}
                    fill={items[i].color}
                    stroke="#0b1220"
                    strokeWidth={2}
                    filter={isActive ? 'url(#radar3d-glow)' : undefined}
                    className="transition-all duration-150"
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isActive ? 11 : 8}
                    fill={items[i].color}
                    opacity={0.2}
                    className="pointer-events-none"
                  />

                  <text
                    x={labelPos.x}
                    y={labelPos.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={isActive ? '#fff' : 'rgba(255,255,255,0.65)'}
                    fontSize={isActive ? 12 : 10}
                    fontWeight={isActive ? 700 : 500}
                    fontFamily="inherit"
                  >
                    {short}
                  </text>
                </g>
              );
            })}
          </svg>

          {active !== null && items[active] && (
            <div
              className="absolute top-3 left-1/2 -translate-x-1/2 px-3.5 py-2 rounded-xl bg-black/75 border border-white/10 text-sm backdrop-blur-sm flex items-center gap-2.5 pointer-events-none"
              style={{ boxShadow: `0 0 22px ${items[active].color}55` }}
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{
                  background: items[active].color,
                  boxShadow: `0 0 8px ${items[active].color}`,
                }}
              />
              <span className="font-medium">{items[active].metric}</span>
              <span className="opacity-50">·</span>
              <span className="font-bold tabular-nums">{Math.round(items[active].value)}</span>
            </div>
          )}
        </div>

        {/* لیست مقادیر */}
        <div className="space-y-2">
          {items.map((item, i) => {
            const isActive = active === i;
            return (
              <button
                key={i}
                type="button"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-start transition ${
                  isActive ? 'bg-white/10 scale-[1.02]' : 'bg-white/5 hover:bg-white/8'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{
                    background: item.color,
                    boxShadow: `0 0 8px ${item.color}88`,
                  }}
                />
                <span className="flex-1 min-w-0 truncate text-sm">{item.metric}</span>
                <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${item.value}%`,
                      background: `linear-gradient(90deg, ${item.color}, ${item.color}aa)`,
                    }}
                  />
                </div>
                <span className="text-sm font-bold tabular-nums w-8 text-end">
                  {Math.round(item.value)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
