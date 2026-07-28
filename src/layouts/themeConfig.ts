import { Moon, Globe, Palette, Leaf, Sparkles, Bot, type LucideIcon } from 'lucide-react';

export type AppThemeId = 'dark' | 'blue' | 'purple' | 'cyber' | 'mint' | 'neural' | 'mintAi' | 'quantum';

// quantum is kept for backwards compatibility with an already-saved setting,
// but Mint AI is the user-facing replacement.
export const APP_THEME_IDS: AppThemeId[] = ['dark', 'blue', 'purple', 'cyber', 'mint', 'neural', 'mintAi'];

export interface ThemeStyle {
  body: string;
  sidebar: string;
  sidebarHover: string;
  header: string;
  card: string;
  cardStatic: string;
  input: string;
  activeMenu: string;
  buttonPrimary: string;
  buttonSecondary: string;
  accent: string;
  accentBg: string;
  logoGradient: string;
  themeIcon: LucideIcon;
}

export const themeConfig: Record<AppThemeId, ThemeStyle> = {
  dark: {
    body: 'bg-gray-900 text-gray-100',
    sidebar: 'bg-gray-800/90 backdrop-blur-xl border-gray-700/50',
    sidebarHover: 'hover:bg-gray-700/50',
    header: 'bg-gray-800/90 backdrop-blur-xl border-gray-700/50',
    card: 'bg-gray-800/60 backdrop-blur-lg border-gray-700/50 hover:bg-gray-800/80 hover:border-gray-600/50',
    cardStatic: 'bg-gray-800/60 backdrop-blur-lg border-gray-700/50',
    input: 'bg-gray-700/50 border-gray-600/50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30',
    activeMenu: 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25',
    buttonPrimary: 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-lg shadow-blue-500/25',
    buttonSecondary: 'bg-gray-700/50 hover:bg-gray-600/50 border-gray-600/50',
    accent: 'text-blue-400',
    accentBg: 'bg-blue-500/20',
    logoGradient: 'from-blue-400 to-cyan-400',
    themeIcon: Moon,
  },
  blue: {
    body: 'bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-950 text-blue-50',
    sidebar: 'bg-blue-900/40 backdrop-blur-2xl border-blue-400/20 shadow-xl shadow-blue-900/30',
    sidebarHover: 'hover:bg-blue-400/10 hover:shadow-lg hover:shadow-blue-500/10',
    header: 'bg-blue-900/40 backdrop-blur-2xl border-blue-400/20 shadow-lg shadow-blue-900/20',
    card: 'bg-blue-900/30 backdrop-blur-xl border-blue-400/20 hover:bg-blue-800/40 hover:border-blue-400/40 hover:shadow-xl hover:shadow-blue-500/10 transition-all duration-300',
    cardStatic: 'bg-blue-900/30 backdrop-blur-xl border-blue-400/20',
    input: 'bg-blue-900/30 border-blue-400/30 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30 placeholder:text-blue-300/50',
    activeMenu: 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/30',
    buttonPrimary: 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 shadow-lg shadow-cyan-500/30 hover:shadow-xl hover:shadow-cyan-500/40',
    buttonSecondary: 'bg-blue-800/40 hover:bg-blue-700/50 border-blue-400/30 hover:border-blue-400/50',
    accent: 'text-cyan-400',
    accentBg: 'bg-cyan-500/20',
    logoGradient: 'from-cyan-400 to-blue-400',
    themeIcon: Globe,
  },
  purple: {
    body: 'bg-gradient-to-br from-slate-950 via-indigo-950 to-purple-950 text-indigo-50',
    sidebar: 'bg-gradient-to-b from-violet-900/70 to-indigo-950/80 backdrop-blur-2xl border-violet-500/25 shadow-2xl shadow-violet-900/50',
    sidebarHover: 'hover:bg-violet-500/15 hover:shadow-md hover:shadow-violet-500/15 hover:scale-[1.02]',
    header: 'bg-indigo-950/60 backdrop-blur-2xl border-violet-400/20 shadow-lg shadow-indigo-950/30',
    card: 'bg-indigo-950/40 backdrop-blur-2xl border-violet-400/20 hover:bg-indigo-900/50 hover:border-violet-400/35 hover:shadow-2xl hover:shadow-violet-500/15 hover:scale-[1.01] transition-all duration-300',
    cardStatic: 'bg-indigo-950/40 backdrop-blur-2xl border-violet-400/20',
    input: 'bg-indigo-950/40 border-violet-400/25 focus:border-violet-400 focus:ring-2 focus:ring-violet-400/30 placeholder:text-indigo-300/40',
    activeMenu: 'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-lg shadow-violet-500/30',
    buttonPrimary: 'bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-400 hover:to-purple-400 shadow-lg shadow-violet-500/30 hover:shadow-xl hover:shadow-violet-500/40',
    buttonSecondary: 'bg-indigo-900/40 hover:bg-indigo-800/50 border-violet-400/25 hover:border-violet-400/45',
    accent: 'text-violet-400',
    accentBg: 'bg-violet-500/20',
    logoGradient: 'from-violet-400 to-purple-400',
    themeIcon: Palette,
  },
  cyber: {
    body: 'bg-gradient-to-br from-slate-950 via-teal-950/50 to-slate-950 text-teal-50',
    sidebar: 'bg-gradient-to-b from-teal-800/60 to-teal-950/70 backdrop-blur-2xl border-teal-400/30 shadow-2xl shadow-teal-900/50',
    sidebarHover: 'hover:bg-teal-400/20 hover:shadow-lg hover:shadow-teal-400/25 hover:scale-[1.02]',
    header: 'bg-teal-950/50 backdrop-blur-2xl border-teal-400/25 shadow-xl shadow-teal-900/30',
    card: 'bg-teal-950/30 backdrop-blur-2xl border-teal-400/20 hover:bg-teal-900/45 hover:border-teal-300/45 hover:shadow-2xl hover:shadow-teal-400/25 hover:scale-[1.01] transition-all duration-300',
    cardStatic: 'bg-teal-950/30 backdrop-blur-2xl border-teal-400/20',
    input: 'bg-teal-950/35 border-teal-400/30 focus:border-teal-300 focus:ring-2 focus:ring-teal-300/40 placeholder:text-teal-300/40',
    activeMenu: 'bg-gradient-to-r from-teal-500 to-cyan-500 text-slate-900 font-semibold shadow-lg shadow-teal-400/45',
    buttonPrimary: 'bg-gradient-to-r from-teal-500 to-cyan-500 text-slate-900 font-semibold hover:from-teal-400 hover:to-cyan-400 shadow-lg shadow-teal-400/40 hover:shadow-xl hover:shadow-teal-300/50',
    buttonSecondary: 'bg-teal-900/35 hover:bg-teal-800/55 border-teal-400/30 hover:border-teal-300/55',
    accent: 'text-teal-400',
    accentBg: 'bg-teal-500/25',
    logoGradient: 'from-teal-400 to-cyan-400',
    themeIcon: Leaf,
  },
  mint: {
    body: 'bg-gradient-to-br from-gray-950 via-emerald-950/40 to-gray-950 text-emerald-50',
    sidebar: 'bg-gradient-to-b from-emerald-900/50 to-emerald-950/60 backdrop-blur-2xl border-emerald-400/25 shadow-2xl shadow-emerald-900/40',
    sidebarHover: 'hover:bg-emerald-400/15 hover:shadow-lg hover:shadow-emerald-400/20 hover:scale-[1.02]',
    header: 'bg-emerald-950/40 backdrop-blur-2xl border-emerald-400/20 shadow-xl shadow-emerald-900/25',
    card: 'bg-emerald-950/25 backdrop-blur-2xl border-emerald-400/15 hover:bg-emerald-900/35 hover:border-emerald-300/35 hover:shadow-2xl hover:shadow-emerald-400/20 hover:scale-[1.01] transition-all duration-300',
    cardStatic: 'bg-emerald-950/25 backdrop-blur-2xl border-emerald-400/15',
    input: 'bg-emerald-950/30 border-emerald-400/25 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/35 placeholder:text-emerald-300/35',
    activeMenu: 'bg-gradient-to-r from-emerald-500 to-green-500 text-slate-900 font-semibold shadow-lg shadow-emerald-400/40',
    buttonPrimary: 'bg-gradient-to-r from-emerald-500 to-green-500 text-slate-900 font-semibold hover:from-emerald-400 hover:to-green-400 shadow-lg shadow-emerald-400/35 hover:shadow-xl hover:shadow-emerald-300/45',
    buttonSecondary: 'bg-emerald-900/30 hover:bg-emerald-800/45 border-emerald-400/25 hover:border-emerald-300/45',
    accent: 'text-emerald-400',
    accentBg: 'bg-emerald-500/20',
    logoGradient: 'from-emerald-400 to-green-400',
    themeIcon: Leaf,
  },
  neural: {
    body: 'bg-[#050A18] text-slate-50',
    sidebar: 'bg-slate-950/55 backdrop-blur-2xl border-white/10 shadow-2xl shadow-fuchsia-950/40',
    sidebarHover: 'hover:bg-white/8 hover:shadow-lg hover:shadow-teal-400/10 hover:scale-[1.02]',
    header: 'bg-slate-950/50 backdrop-blur-2xl border-white/10 shadow-lg shadow-black/30',
    card: 'bg-slate-950/45 backdrop-blur-2xl border-teal-400/15 hover:bg-slate-900/55 hover:border-fuchsia-400/30 hover:shadow-2xl hover:shadow-fuchsia-500/15 hover:scale-[1.01] transition-all duration-300',
    cardStatic: 'bg-slate-950/45 backdrop-blur-2xl border-teal-400/15',
    input: 'bg-slate-950/50 border-white/15 focus:border-teal-300 focus:ring-2 focus:ring-fuchsia-400/25 placeholder:text-slate-400/50',
    activeMenu: 'bg-gradient-to-r from-teal-500 via-cyan-500 to-fuchsia-500 text-white font-semibold shadow-lg shadow-fuchsia-500/30',
    buttonPrimary: 'bg-gradient-to-r from-teal-500 to-fuchsia-500 text-white font-semibold hover:from-teal-400 hover:to-fuchsia-400 shadow-lg shadow-fuchsia-500/30 hover:shadow-xl hover:shadow-teal-400/25',
    buttonSecondary: 'bg-white/5 hover:bg-white/10 border-white/15 hover:border-teal-300/40',
    accent: 'text-teal-300',
    accentBg: 'bg-gradient-to-r from-teal-500/20 to-fuchsia-500/20',
    logoGradient: 'from-teal-300 via-cyan-300 to-fuchsia-400',
    themeIcon: Sparkles,
  },
  mintAi: {
    body: 'bg-gradient-to-br from-[#031614] via-[#063b35] to-[#061d2a] text-emerald-50',
    sidebar: 'bg-[#031b19]/80 backdrop-blur-2xl border-emerald-300/25 shadow-2xl shadow-emerald-950/70',
    sidebarHover: 'hover:bg-emerald-300/12 hover:shadow-lg hover:shadow-cyan-400/15 hover:scale-[1.02]',
    header: 'bg-[#031b19]/70 backdrop-blur-2xl border-emerald-300/20 shadow-xl shadow-emerald-950/55',
    card: 'bg-[#062824]/65 backdrop-blur-2xl border-emerald-300/18 hover:bg-[#0a3c35]/75 hover:border-cyan-300/35 hover:shadow-2xl hover:shadow-emerald-400/15 hover:scale-[1.01] transition-all duration-300',
    cardStatic: 'bg-[#062824]/65 backdrop-blur-2xl border-emerald-300/18',
    input: 'bg-[#031b19]/70 border-emerald-300/25 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/30 placeholder:text-emerald-100/60',
    activeMenu: 'bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 text-[#021b18] font-semibold shadow-lg shadow-emerald-300/40',
    buttonPrimary: 'bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 text-[#021b18] font-semibold hover:from-emerald-300 hover:to-cyan-300 shadow-lg shadow-emerald-300/35 hover:shadow-xl hover:shadow-cyan-300/30',
    buttonSecondary: 'bg-emerald-950/45 hover:bg-emerald-900/60 border-emerald-300/25 hover:border-cyan-300/45',
    accent: 'text-emerald-300',
    accentBg: 'bg-gradient-to-r from-emerald-400/25 to-cyan-400/20',
    logoGradient: 'from-emerald-200 via-teal-200 to-cyan-300',
    themeIcon: Bot,
  },
  quantum: {
    body: 'bg-gradient-to-br from-[#020617] via-[#11103b] to-[#071b2f] text-slate-50',
    sidebar: 'bg-[#05071f]/80 backdrop-blur-2xl border-cyan-300/20 shadow-2xl shadow-cyan-950/60',
    sidebarHover: 'hover:bg-cyan-300/10 hover:shadow-lg hover:shadow-fuchsia-500/15 hover:scale-[1.02]',
    header: 'bg-[#05071f]/70 backdrop-blur-2xl border-cyan-300/15 shadow-xl shadow-indigo-950/50',
    card: 'bg-[#090d2d]/60 backdrop-blur-2xl border-cyan-300/15 hover:bg-[#101443]/75 hover:border-fuchsia-300/35 hover:shadow-2xl hover:shadow-fuchsia-500/15 hover:scale-[1.01] transition-all duration-300',
    cardStatic: 'bg-[#090d2d]/60 backdrop-blur-2xl border-cyan-300/15',
    input: 'bg-[#05071f]/65 border-cyan-300/20 focus:border-fuchsia-300 focus:ring-2 focus:ring-fuchsia-400/30 placeholder:text-slate-400/50',
    activeMenu: 'bg-gradient-to-r from-cyan-400 via-blue-500 to-fuchsia-500 text-white font-semibold shadow-lg shadow-fuchsia-500/35',
    buttonPrimary: 'bg-gradient-to-r from-cyan-400 via-blue-500 to-fuchsia-500 text-white font-semibold hover:from-cyan-300 hover:to-fuchsia-400 shadow-lg shadow-fuchsia-500/35 hover:shadow-xl hover:shadow-cyan-400/25',
    buttonSecondary: 'bg-white/5 hover:bg-white/10 border-cyan-300/20 hover:border-fuchsia-300/40',
    accent: 'text-cyan-300',
    accentBg: 'bg-gradient-to-r from-cyan-400/20 to-fuchsia-500/20',
    logoGradient: 'from-cyan-300 via-blue-300 to-fuchsia-400',
    themeIcon: Bot,
  },
};
