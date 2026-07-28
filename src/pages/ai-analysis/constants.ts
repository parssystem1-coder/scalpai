import { Brain, BarChart3, Eye, Users, Calendar } from 'lucide-react';

export const tabs = [
  { id: 'analysis', icon: Brain, labelKey: 'tabAnalysis' },
  { id: 'visualization', icon: Eye, labelKey: 'tabVisualization' },
  { id: 'results', icon: BarChart3, labelKey: 'tabResults' },
  { id: 'history', icon: Calendar, labelKey: 'tabHistory' },
  { id: 'allAnalyses', icon: Users, labelKey: 'tabAllAnalyses' },
] as const;

export type TabId = (typeof tabs)[number]['id'];

export const BBOX_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'] as const;
