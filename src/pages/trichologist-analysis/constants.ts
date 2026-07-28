import { User, FileText, Eye, Lightbulb, ClipboardList, Calendar, Users, TrendingUp } from 'lucide-react';

export const tabs = [
  { id: 'basic', icon: User, labelKey: 'tabBasic' },
  { id: 'questionnaire', icon: FileText, labelKey: 'tabQuestionnaire' },
  { id: 'observations', icon: Eye, labelKey: 'tabObservations' },
  { id: 'recommendations', icon: Lightbulb, labelKey: 'tabRecommendations' },
  { id: 'treatment', icon: ClipboardList, labelKey: 'tabTreatment' },
  { id: 'clinicalTrend', icon: TrendingUp, labelKey: 'tabClinicalTrend' },
  { id: 'history', icon: Calendar, labelKey: 'tabHistory' },
  { id: 'allAnalyses', icon: Users, labelKey: 'tabAllAnalyses' },
] as const;

export type TabId = (typeof tabs)[number]['id'];
