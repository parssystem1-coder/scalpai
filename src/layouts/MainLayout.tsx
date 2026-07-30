import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSettingsStore } from '../store';
import {
  LayoutDashboard, Users, Calendar, Image, Stethoscope, Brain, Cpu,
  Settings, Info, ChevronRight, ChevronLeft, Bell, HelpCircle, Globe,
  Maximize, Menu, Leaf, LogOut, Check, User, Sparkles, Bot, FileText, GraduationCap
} from 'lucide-react';
import NeuralBackground from '../components/NeuralBackground';
import AIScreenSaver from '../components/AIScreenSaver';
import PrivacyConsentModal from '../components/PrivacyConsentModal';
import { themeConfig, APP_THEME_IDS, type AppThemeId } from './themeConfig';
import { sampleNotifications, type AppNotification } from './sampleNotifications';

const menuItems = [
  { path: '/', icon: LayoutDashboard, label: 'داشبورد', labelEn: 'Dashboard' },
  { path: '/clients', icon: Users, label: 'مشتریان', labelEn: 'Clients' },
  { path: '/sessions', icon: Calendar, label: 'جلسات پیش رو', labelEn: 'Upcoming Sessions' },
  { path: '/gallery', icon: Image, label: 'گالری', labelEn: 'Gallery' },
  { path: '/medical-questionnaire', icon: FileText, label: 'پرسشنامه پزشکی', labelEn: 'Medical Questionnaire' },
  { path: '/ai-analysis', icon: Brain, label: 'تحلیل هوش مصنوعی', labelEn: 'AI Analysis' },
  { path: '/offline-analysis', icon: Cpu, label: 'تحلیل آفلاین', labelEn: 'Offline Analysis' },
  { path: '/trichologist-analysis', icon: Stethoscope, label: 'تحلیل تریکولوژیست', labelEn: 'Trichologist Analysis' },
  { path: '/local-learning', icon: GraduationCap, label: 'یادگیری ماشین', labelEn: 'Machine Learning' },
  { path: '/settings', icon: Settings, label: 'تنظیمات', labelEn: 'Settings' },
  { path: '/about', icon: Info, label: 'درباره ما', labelEn: 'About Us' },
];

interface Props { children: React.ReactNode; }

export default function MainLayout({ children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>(sampleNotifications);
  const [showScreenSaver, setShowScreenSaver] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { settings, updateSettings, fetchSettings } = useSettingsStore();

  useEffect(() => { fetchSettings(); }, []);

  useEffect(() => {
    let timer: number | undefined;
    const saverActive = { current: false };
    const resetIdleTimer = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (saverActive.current) {
        saverActive.current = false;
        setShowScreenSaver(false);
      }
      timer = window.setTimeout(() => {
        saverActive.current = true;
        setShowScreenSaver(true);
      }, 60_000);
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      'pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll',
    ];
    activityEvents.forEach(event => window.addEventListener(event, resetIdleTimer, { passive: true }));
    resetIdleTimer();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      activityEvents.forEach(event => window.removeEventListener(event, resetIdleTimer));
    };
  }, []);

  const toggleTheme = () => {
    const idx = APP_THEME_IDS.indexOf(settings.theme as AppThemeId);
    const safeIdx = idx >= 0 ? idx : 0;
    updateSettings({ theme: APP_THEME_IDS[(safeIdx + 1) % APP_THEME_IDS.length] });
  };

  const toggleLanguage = () => {
    updateSettings({ language: settings.language === 'fa' ? 'en' : 'fa' });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const handleLogout = async () => {
    const { destroyAuthSession } = await import('../lib/authSession');
    await destroyAuthSession();
    // In Electron, close the app completely
    if (window.electronAPI) {
      window.electronAPI.app.quit();
    } else {
      navigate('/login');
    }
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const theme = themeConfig[settings.theme] || themeConfig.dark;
  const ThemeIcon = theme.themeIcon;
  const isRtl = settings.language === 'fa';
  const userInitial = settings.firstName?.[0]?.toUpperCase() || settings.username?.[0]?.toUpperCase() || 'U';

  return (
    <div className={`min-h-screen ${theme.body} transition-all duration-500 relative ${settings.theme === 'mintAi' ? 'theme-mint-ai' : ''}`} dir={isRtl ? 'rtl' : 'ltr'}>
      {/* موج ۲ (C3.1) — رضایت‌نامهٔ حریم‌خصوصی؛ تا ثبت، کل اپ پوشیده می‌ماند */}
      <PrivacyConsentModal />
      {/* Animated backgrounds */}
      {(settings.theme === 'neural' || settings.theme === 'quantum' || settings.theme === 'mintAi') && <NeuralBackground />}
      {settings.theme === 'cyber' && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-teal-500/8 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-cyan-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>
      )}
      {settings.theme === 'purple' && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/8 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-violet-500/8 rounded-full blur-3xl" />
        </div>
      )}
      {settings.theme === 'blue' && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-3xl" />
        </div>
      )}
      {settings.theme === 'mint' && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-0 left-1/3 w-[500px] h-[500px] bg-emerald-500/8 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-0 right-1/3 w-[500px] h-[500px] bg-green-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }} />
        </div>
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 ${isRtl ? 'right-0' : 'left-0'} h-full ${collapsed ? 'w-20' : 'w-64'} ${theme.sidebar} ${isRtl ? 'border-l' : 'border-r'} transition-all duration-300 z-50`}>
        <div className="flex items-center justify-between p-4 border-b border-inherit">
          {!collapsed && (
            <h1 className={`text-xl font-bold bg-gradient-to-r ${theme.logoGradient} bg-clip-text text-transparent flex items-center gap-2`}>
              {settings.theme === 'cyber' && <Leaf size={20} className="text-teal-400" />}
              {settings.theme === 'neural' && <Sparkles size={20} className="text-fuchsia-300" />}
              {settings.theme === 'mintAi' && <Bot size={20} className="text-emerald-200" />}
              ScalpAI
            </h1>
          )}
          <button onClick={() => setCollapsed(!collapsed)} className={`p-2 rounded-lg ${theme.sidebarHover} transition-all duration-200`}>
            {collapsed ? (isRtl ? <ChevronLeft size={20} /> : <ChevronRight size={20} />) : (isRtl ? <ChevronRight size={20} /> : <ChevronLeft size={20} />)}
          </button>
        </div>
        <nav className="p-4 space-y-2">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isActive ? theme.activeMenu : theme.sidebarHover}`}
              >
                <Icon size={20} />
                {!collapsed && <span>{isRtl ? item.label : item.labelEn}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <div className={`${collapsed ? (isRtl ? 'mr-20' : 'ml-20') : (isRtl ? 'mr-64' : 'ml-64')} transition-all duration-300 relative z-10`}>
        {/* Header */}
        <header className={`sticky top-0 ${theme.header} border-b px-6 py-4 z-40`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button className="lg:hidden p-2 rounded-lg hover:bg-white/10">
                <Menu size={20} />
              </button>
              <h2 className="text-lg font-semibold">
                {location.pathname === '/profile'
                  ? (isRtl ? 'پروفایل' : 'Profile')
                  : menuItems.find(i => i.path === location.pathname)?.[(isRtl && !['/clients', '/sessions', '/gallery'].includes(location.pathname)) ? 'label' : 'labelEn'] || 'ScalpAI'}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              {/* Notifications */}
              <div className="relative">
                <button
                  onClick={() => { setShowNotifications(!showNotifications); setShowProfileMenu(false); }}
                  className={`p-2 rounded-lg ${theme.sidebarHover} transition-all duration-200 relative`}
                >
                  <Bell size={20} />
                  {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center text-white font-bold">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {/* Notifications Dropdown */}
                {showNotifications && (
                  <div className={`absolute top-12 ${isRtl ? 'left-0' : 'right-0'} w-80 rounded-xl ${theme.cardStatic} border border-white/10 shadow-2xl overflow-hidden`}>
                    <div className="flex items-center justify-between p-4 border-b border-white/10">
                      <span className="font-semibold">{isRtl ? 'اعلانات' : 'Notifications'}</span>
                      <button onClick={markAllAsRead} className="text-xs text-teal-400 hover:underline">
                        {isRtl ? 'خواندن همه' : 'Mark all read'}
                      </button>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <p className="p-4 text-center opacity-50">{isRtl ? 'اعلانی وجود ندارد' : 'No notifications'}</p>
                      ) : (
                        notifications.map(n => (
                          <div key={n.id} className={`p-4 border-b border-white/5 ${!n.read ? 'bg-white/5' : ''}`}>
                            <div className="flex items-start gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                n.type === 'success' ? 'bg-green-500/20 text-green-400' :
                                n.type === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                                n.type === 'error' ? 'bg-red-500/20 text-red-400' :
                                'bg-blue-500/20 text-blue-400'
                              }`}>
                                {n.type === 'success' ? <Check size={16} /> : <Bell size={16} />}
                              </div>
                              <div>
                                <p className="font-medium text-sm">{n.title}</p>
                                <p className="text-xs opacity-70">{n.message}</p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button className={`p-2 rounded-lg ${theme.sidebarHover} transition-all duration-200`}>
                <HelpCircle size={20} />
              </button>
              <button onClick={toggleLanguage} className={`p-2 rounded-lg ${theme.sidebarHover} transition-all duration-200 flex items-center gap-1`}>
                <Globe size={20} />
                <span className="text-sm">{settings.language === 'fa' ? 'FA' : 'EN'}</span>
              </button>
              <button onClick={toggleTheme} className={`p-2 rounded-lg ${theme.sidebarHover} transition-all duration-200`}>
                <ThemeIcon size={20} className={theme.accent} />
              </button>
              <button onClick={toggleFullscreen} className={`p-2 rounded-lg ${theme.sidebarHover} transition-all duration-200`}>
                <Maximize size={20} />
              </button>

              {/* Logout */}
              <button onClick={handleLogout} className={`p-2 rounded-lg ${theme.sidebarHover} transition-all duration-200 text-red-400`} title={isRtl ? 'خروج' : 'Logout'}>
                <LogOut size={20} />
              </button>

              {/* Profile */}
              <div className="relative">
                <button
                  onClick={() => { setShowProfileMenu(!showProfileMenu); setShowNotifications(false); }}
                  className={`w-10 h-10 rounded-full bg-gradient-to-r ${theme.logoGradient} flex items-center justify-center shadow-lg hover:scale-105 transition`}
                >
                  <span className="text-white font-bold">{userInitial}</span>
                </button>

                {/* Profile Dropdown */}
                {showProfileMenu && (
                  <div className={`absolute top-12 ${isRtl ? 'left-0' : 'right-0'} w-48 rounded-xl ${theme.cardStatic} border border-white/10 shadow-2xl overflow-hidden`}>
                    <Link
                      to="/profile"
                      onClick={() => setShowProfileMenu(false)}
                      className="flex items-center gap-3 p-4 hover:bg-white/5 transition"
                    >
                      <User size={18} />
                      <span>{isRtl ? 'پروفایل' : 'Profile'}</span>
                    </Link>
                    <Link
                      to="/settings"
                      onClick={() => setShowProfileMenu(false)}
                      className="flex items-center gap-3 p-4 hover:bg-white/5 transition border-t border-white/5"
                    >
                      <Settings size={18} />
                      <span>{isRtl ? 'تنظیمات' : 'Settings'}</span>
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-3 p-4 hover:bg-white/5 transition border-t border-white/5 w-full text-red-400"
                    >
                      <LogOut size={18} />
                      <span>{isRtl ? 'خروج' : 'Logout'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6 relative" onClick={() => { setShowNotifications(false); setShowProfileMenu(false); }}>
          {children}
        </main>
      </div>

      {/* Global CSS Variables */}
      <style>{`
        :root {
          --theme-card: ${settings.theme === 'dark' ? 'rgba(31, 41, 55, 0.6)' :
                         settings.theme === 'blue' ? 'rgba(30, 58, 138, 0.3)' :
                         settings.theme === 'purple' ? 'rgba(88, 28, 135, 0.3)' :
                         settings.theme === 'neural' ? 'rgba(5, 10, 24, 0.55)' :
                         settings.theme === 'mintAi' ? 'rgba(6, 40, 36, 0.66)' :
                         'rgba(17, 24, 39, 0.6)'};
        }
      `}</style>

      {showScreenSaver && (
        <AIScreenSaver
          isRtl={isRtl}
          onWake={() => setShowScreenSaver(false)}
        />
      )}
    </div>
  );
}

export { themeConfig } from './themeConfig';
