/** نوار درصد افقی برای شاخص‌های پوست سر / تخصصی */
export default function MetricPercentBar({
  label,
  value,
  barClassName,
}: {
  label: string;
  value: number;
  barClassName: string;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span>{Math.round(clamped)}%</span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full transition-all ${barClassName}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
