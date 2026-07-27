import { Cpu, BarChart3, Eye, Users, Calendar } from 'lucide-react';

export const tabs = [
  { id: 'analysis', icon: Cpu, labelKey: 'tabAnalysis' },
  { id: 'visualization', icon: Eye, labelKey: 'tabVisualization' },
  { id: 'results', icon: BarChart3, labelKey: 'tabResults' },
  { id: 'history', icon: Calendar, labelKey: 'tabHistory' },
  { id: 'allAnalyses', icon: Users, labelKey: 'tabAllAnalyses' },
] as const;

export type TabId = (typeof tabs)[number]['id'];

export const CHART_COLORS = ['#3b82f6', '#f97316', '#eab308', '#a855f7', '#ef4444'];
export const LESION_PIE_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7'];

export const DEFAULT_LABEL_FORM = {
  oiliness: 30,
  dryness: 30,
  dandruff: 10,
  redness: 10,
  densityScore: 50,
  shine: 10,
  patchiness: 10,
  pigmentation: 10,
  hairThickness: 50,
  observations: [] as string[],
  lesions: [] as { type: string; confidence: number; bbox?: number[] }[],
};
