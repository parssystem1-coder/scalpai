import { useMemo, useState } from 'react';

export interface MetricBarItem {
  label: string;
  value: number;
}

interface Props {
  data: MetricBarItem[];
  title: string;
}

/** پالت گرادیان زنده برای میله‌های سه‌بعدی */
const BAR_PALETTES = [
  { front: '#06b6d4', mid: '#0891b2', side: '#0e7490', top: '#67e8f9', glow: '#22d3ee' },
  { front: '#34d399', mid: '#10b981', side: '#047857', top: '#6ee7b7', glow: '#34d399' },
  { front: '#fbbf24', mid: '#f59e0b', side: '#b45309', top: '#fde68a', glow: '#fbbf24' },
  { front: '#fb7185', mid: '#f43f5e', side: '#be123c', top: '#fda4af', glow: '#fb7185' },
  { front: '#a78bfa', mid: '#8b5cf6', side: '#6d28d9', top: '#c4b5fd', glow: '#a78bfa' },
  { front: '#60a5fa', mid: '#3b82f6', side: '#1d4ed8', top: '#93c5fd', glow: '#60a5fa' },
  { front: '#f472b6', mid: '#ec4899', side: '#be185d', top: '#f9a8d4', glow: '#f472b6' },
  { front: '#4ade80', mid: '#22c55e', side: '#15803d', top: '#86efac', glow: '#4ade80' },
  { front: '#fcd34d', mid: '#eab308', side: '#a16207', top: '#fef08a', glow: '#fcd34d' },
  { front: '#2dd4bf', mid: '#14b8a6', side: '#0f766e', top: '#5eead4', glow: '#2dd4bf' },
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * نمودار میله‌ای سه‌بعدی ایزومتریک برای شاخص‌های پوست سر
 */
export default function MetricsBar3D({ data, title }: Props) {
  const [active, setActive] = useState<number | null>(null);

  const items = useMemo(
    () =>
      data.map((d, i) => ({
        ...d,
        value: clamp(Number(d.value) || 0, 0, 100),
        palette: BAR_PALETTES[i % BAR_PALETTES.length],
      })),
    [data],
  );

  if (items.length === 0) return null;

  const padL = 44;
  const padR = 20;
  const padT = 36;
  const padB = 72;
  const chartW = 640;
  const chartH = 300;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;
  const baseY = padT + plotH;

  const depthX = 14;
  const depthY = -10;
  const gapRatio = 0.38;
  const slot = plotW / items.length;
  const barW = Math.min(42, slot * (1 - gapRatio));

  const yTicks = [0, 25, 50, 75, 100];

  return (
    <div
      className="rounded-2xl bg-white/5 border border-white/10 p-6 overflow-hidden"
      data-print-chart="bars"
      data-print-title={title}
    >
      <h3 className="font-semibold mb-5">{title}</h3>

      <div
        className="relative rounded-xl"
        style={{
          background:
            'radial-gradient(ellipse at 50% 100%, rgba(6,182,212,0.07) 0%, transparent 55%), linear-gradient(180deg, rgba(255,255,255,0.03), transparent 40%)',
        }}
      >
        <svg
          viewBox={`0 0 ${chartW} ${chartH}`}
          className="w-full metrics-3d-chart"
          role="img"
          aria-label={title}
        >
          <defs>
            {items.map((item, i) => (
              <linearGradient
                key={`fg-${i}`}
                id={`metrics3d-front-${i}`}
                x1="0%"
                y1="0%"
                x2="0%"
                y2="100%"
              >
                <stop offset="0%" stopColor={item.palette.front} />
                <stop offset="55%" stopColor={item.palette.mid} />
                <stop offset="100%" stopColor={item.palette.side} />
              </linearGradient>
            ))}
            {items.map((item, i) => (
              <linearGradient
                key={`sg-${i}`}
                id={`metrics3d-side-${i}`}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor={item.palette.mid} />
                <stop offset="100%" stopColor={item.palette.side} />
              </linearGradient>
            ))}
            {items.map((item, i) => (
              <linearGradient
                key={`tg-${i}`}
                id={`metrics3d-top-${i}`}
                x1="0%"
                y1="100%"
                x2="100%"
                y2="0%"
              >
                <stop offset="0%" stopColor={item.palette.front} />
                <stop offset="100%" stopColor={item.palette.top} />
              </linearGradient>
            ))}
            <filter id="metrics3d-glow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="metrics3d-floor" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
          </defs>

          {/* شبکه افقی */}
          {yTicks.map(tick => {
            const y = baseY - (tick / 100) * plotH;
            return (
              <g key={tick}>
                <line
                  x1={padL}
                  y1={y}
                  x2={chartW - padR + depthX}
                  y2={y + depthY * 0.15}
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth={1}
                  strokeDasharray={tick === 0 ? undefined : '4 4'}
                />
                <text
                  x={padL - 10}
                  y={y + 4}
                  textAnchor="end"
                  fill="rgba(255,255,255,0.45)"
                  fontSize={11}
                  fontFamily="inherit"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* کف سه‌بعدی */}
          <polygon
            points={[
              `${padL},${baseY}`,
              `${chartW - padR},${baseY}`,
              `${chartW - padR + depthX},${baseY + depthY}`,
              `${padL + depthX},${baseY + depthY}`,
            ].join(' ')}
            fill="url(#metrics3d-floor)"
            opacity={0.5}
          />
          <line
            x1={padL}
            y1={baseY}
            x2={chartW - padR}
            y2={baseY}
            stroke="rgba(255,255,255,0.18)"
            strokeWidth={1.5}
          />

          {/* میله‌ها از چپ به راست — رسم از پشت به جلو برای عمق */}
          {items.map((item, i) => {
            const h = Math.max((item.value / 100) * plotH, item.value > 0 ? 4 : 0);
            const x = padL + slot * i + (slot - barW) / 2;
            const y = baseY - h;
            const isActive = active === i;
            const lift = isActive ? -6 : 0;
            const dim = active !== null && !isActive;

            const front = [
              `${x},${y + lift}`,
              `${x + barW},${y + lift}`,
              `${x + barW},${baseY + lift}`,
              `${x},${baseY + lift}`,
            ].join(' ');

            const top = [
              `${x},${y + lift}`,
              `${x + depthX},${y + depthY + lift}`,
              `${x + barW + depthX},${y + depthY + lift}`,
              `${x + barW},${y + lift}`,
            ].join(' ');

            const side = [
              `${x + barW},${y + lift}`,
              `${x + barW + depthX},${y + depthY + lift}`,
              `${x + barW + depthX},${baseY + depthY + lift}`,
              `${x + barW},${baseY + lift}`,
            ].join(' ');

            const label = item.label.length > 10 ? `${item.label.slice(0, 9)}…` : item.label;

            return (
              <g
                key={i}
                className="cursor-pointer metrics-3d-bar"
                style={{
                  opacity: dim ? 0.35 : 1,
                  transition: 'opacity 0.2s ease',
                  animationDelay: `${i * 60}ms`,
                }}
                filter={isActive ? 'url(#metrics3d-glow)' : undefined}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
              >
                {/* سایه کف */}
                <ellipse
                  cx={x + barW / 2 + depthX / 2}
                  cy={baseY + 6}
                  rx={barW * 0.7}
                  ry={5}
                  fill="rgba(0,0,0,0.35)"
                  className="pointer-events-none"
                />

                <polygon
                  points={side}
                  fill={`url(#metrics3d-side-${i})`}
                  stroke={item.palette.side}
                  strokeWidth={0.4}
                />
                <polygon
                  points={front}
                  fill={`url(#metrics3d-front-${i})`}
                  stroke={item.palette.front}
                  strokeWidth={0.4}
                />
                <polygon
                  points={top}
                  fill={`url(#metrics3d-top-${i})`}
                  stroke={item.palette.top}
                  strokeWidth={0.6}
                />

                {/* هایلایت لبه جلو */}
                <line
                  x1={x + 2}
                  y1={y + lift + 2}
                  x2={x + 2}
                  y2={baseY + lift - 2}
                  stroke="rgba(255,255,255,0.25)"
                  strokeWidth={1.2}
                  strokeLinecap="round"
                />

                {/* مقدار روی میله */}
                <text
                  x={x + barW / 2 + depthX / 3}
                  y={y + depthY + lift - 8}
                  textAnchor="middle"
                  fill={isActive ? '#fff' : 'rgba(255,255,255,0.85)'}
                  fontSize={isActive ? 13 : 11}
                  fontWeight="700"
                  fontFamily="inherit"
                >
                  {Math.round(item.value)}
                </text>

                {/* برچسب محور */}
                <text
                  x={x + barW / 2}
                  y={baseY + 22}
                  textAnchor="middle"
                  fill={isActive ? '#fff' : 'rgba(255,255,255,0.55)'}
                  fontSize={10}
                  fontFamily="inherit"
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>

        {active !== null && items[active] && (
          <div
            className="absolute top-3 left-1/2 -translate-x-1/2 px-3.5 py-2 rounded-xl bg-black/75 border border-white/10 text-sm backdrop-blur-sm flex items-center gap-2.5 pointer-events-none"
            style={{
              boxShadow: `0 0 24px ${items[active].palette.glow}44`,
            }}
          >
            <span
              className="w-2.5 h-2.5 rounded-sm"
              style={{
                background: `linear-gradient(135deg, ${items[active].palette.top}, ${items[active].palette.mid})`,
                boxShadow: `0 0 8px ${items[active].palette.glow}`,
              }}
            />
            <span className="font-medium">{items[active].label}</span>
            <span className="opacity-50">·</span>
            <span className="font-bold tabular-nums">{Math.round(items[active].value)}</span>
          </div>
        )}
      </div>

      {/* راهنمای رنگی فشرده */}
      <div className="mt-4 flex flex-wrap gap-2 justify-center">
        {items.map((item, i) => (
          <button
            key={i}
            type="button"
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition ${
              active === i ? 'bg-white/15 scale-105' : 'bg-white/5 hover:bg-white/10'
            }`}
          >
            <span
              className="w-2 h-2 rounded-sm"
              style={{
                background: `linear-gradient(135deg, ${item.palette.top}, ${item.palette.mid})`,
              }}
            />
            <span className="opacity-80">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
