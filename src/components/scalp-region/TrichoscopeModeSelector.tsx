import {
  TRICHOSCOPE_MODES,
  type TrichoscopeModeId,
} from '../../lib/trichoscopeModes';

type Props = {
  value: TrichoscopeModeId;
  onChange: (mode: TrichoscopeModeId) => void;
  /** kept for API compatibility — labels are always English */
  isRtl?: boolean;
};

export default function TrichoscopeModeSelector({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-cyan-100">
          Trichoscope Lens
        </p>
        <span className="text-[10px] text-white/45">
          Select before region
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {TRICHOSCOPE_MODES.map(mode => {
          const selected = value === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => onChange(mode.id)}
              className={`text-start rounded-xl border px-2.5 py-2 transition ${
                selected
                  ? 'border-white/70 bg-white/15 ring-1 ring-white/25'
                  : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/25'
              }`}
              title={mode.useEn}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-3.5 h-3.5 rounded-[3px] border border-black/25 shrink-0"
                  style={{
                    background: mode.color,
                    boxShadow: selected ? `0 0 10px ${mode.color}` : undefined,
                  }}
                />
                <span className="text-[11px] font-semibold text-white truncate">{mode.en}</span>
              </div>
              <p className="mt-1 text-[9px] leading-snug text-white/45 line-clamp-2">
                {mode.useEn}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
