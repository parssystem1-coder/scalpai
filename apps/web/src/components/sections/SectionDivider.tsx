import React from "react";
export default function SectionDivider({ label }: { label: string }) {
  return <div className="flex items-center gap-4 py-2 opacity-70"><div className="h-px flex-1 bg-gradient-to-r from-transparent via-[oklch(62%_0.09_16/0.3)] to-transparent" /><span className="text-[0.65rem] font-mono font-bold uppercase tracking-widest text-[oklch(45%_0.02_20)] bg-white/75 px-3.5 py-1 rounded-full border border-white/80 shadow-xs">{label}</span><div className="h-px flex-1 bg-gradient-to-r from-transparent via-[oklch(62%_0.09_16/0.3)] to-transparent" /></div>;
}
