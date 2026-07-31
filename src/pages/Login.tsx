import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, Eye, EyeOff, User, Lock, X } from 'lucide-react';
import { useSettingsStore } from '../store';
import { db } from '../db';
import { createAuthSession, createAuthSessionAfterSetup } from '../lib/authSession';
import { MIN_PASSWORD_LENGTH } from '../lib/passwordAuth';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { settings, fetchSettings } = useSettingsStore();

  // اکشن‌های zustand یک‌بار در create ساخته می‌شوند و ارجاعشان پایدار است،
  // پس افزودنشان به آرایهٔ وابستگی حلقه نمی‌سازد و هشدار را ریشه‌ای می‌بندد.
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const isRtl = settings.language === 'fa';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Check if this is first time login (no username set)
      if (!settings.username) {
        if (username.length < 3 || password.length < MIN_PASSWORD_LENGTH) {
          setError(isRtl
            ? `نام کاربری حداقل ۳ و رمز عبور حداقل ${MIN_PASSWORD_LENGTH} کاراکتر باشد`
            : `Username min 3, password min ${MIN_PASSWORD_LENGTH} characters`);
          setLoading(false);
          return;
        }
        await useSettingsStore.getState().updateSettings({ username, password });
        await createAuthSessionAfterSetup(username, password);
        navigate('/');
      } else {
        const valid = await db.verifyCredentials(username, password);
        if (valid) {
          await createAuthSession(username, password);
          navigate('/');
        } else {
          setError(isRtl ? 'نام کاربری یا رمز عبور اشتباه است' : 'Invalid username or password');
        }
      }
    } catch (err) {
      setError((err as Error).message || (isRtl ? 'خطا در ورود' : 'Login error'));
    }
    setLoading(false);
  };

  const handleExit = () => {
    window.electronAPI?.app.quit();
  };

  const isElectron = !!window.electronAPI;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-teal-950/30 to-gray-950 flex items-center justify-center p-4" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Exit button for Electron */}
      {isElectron && (
        <button
          onClick={handleExit}
          className="fixed top-4 right-4 p-3 rounded-xl bg-gray-800/80 hover:bg-red-500/30 border border-gray-700 hover:border-red-500/50 text-gray-400 hover:text-red-400 transition-all z-50 group"
          title={isRtl ? 'خروج از برنامه' : 'Exit Application'}
        >
          <X size={24} />
        </button>
      )}

      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-teal-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="w-full max-w-md relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-r from-teal-500 to-cyan-500 shadow-2xl shadow-teal-500/30 mb-4">
            <Brain size={40} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent">
            ScalpAI
          </h1>
          <p className="text-gray-400 mt-2">
            {isRtl ? 'سیستم هوشمند تحلیل پوست و موی سر' : 'Smart Scalp & Hair Analysis System'}
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="bg-gray-900/70 backdrop-blur-2xl border border-teal-500/20 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-center mb-6 text-teal-50">
            {!settings.username
              ? (isRtl ? 'ایجاد حساب کاربری' : 'Create Account')
              : (isRtl ? 'ورود به سیستم' : 'Login')
            }
          </h2>

          {!settings.username && (
            <p className="text-sm text-gray-400 text-center mb-6">
              {isRtl ? 'برای اولین بار نام کاربری و رمز عبور دلخواه خود را وارد کنید' : 'Enter your desired username and password for the first time'}
            </p>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Username */}
            <div className="relative">
              <div className={`absolute top-1/2 -translate-y-1/2 ${isRtl ? 'right-4' : 'left-4'} text-gray-400`}>
                <User size={20} />
              </div>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder={isRtl ? 'نام کاربری' : 'Username'}
                className={`w-full ${isRtl ? 'pr-12 pl-4' : 'pl-12 pr-4'} py-3 rounded-xl bg-gray-800/50 border border-teal-500/30 focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30 focus:outline-none transition text-teal-50 placeholder:text-gray-500`}
                required
              />
            </div>

            {/* Password */}
            <div className="relative">
              <div className={`absolute top-1/2 -translate-y-1/2 ${isRtl ? 'right-4' : 'left-4'} text-gray-400`}>
                <Lock size={20} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={isRtl ? 'رمز عبور' : 'Password'}
                className={`w-full ${isRtl ? 'pr-12 pl-12' : 'pl-12 pr-12'} py-3 rounded-xl bg-gray-800/50 border border-teal-500/30 focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30 focus:outline-none transition text-teal-50 placeholder:text-gray-500`}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={`absolute top-1/2 -translate-y-1/2 ${isRtl ? 'left-4' : 'right-4'} text-gray-400 hover:text-teal-400 transition`}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 py-3 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-gray-900 font-semibold hover:from-teal-400 hover:to-cyan-400 shadow-lg shadow-teal-500/30 hover:shadow-xl hover:shadow-teal-400/40 transition-all disabled:opacity-50"
          >
            {loading
              ? (isRtl ? 'لطفا صبر کنید...' : 'Please wait...')
              : (!settings.username
                  ? (isRtl ? 'ایجاد حساب و ورود' : 'Create & Login')
                  : (isRtl ? 'ورود' : 'Login')
                )
            }
          </button>
        </form>

        <p className="text-center text-gray-500 text-sm mt-6">
          {isRtl ? 'نسخه ۱.۰.۰' : 'Version 1.0.0'}
        </p>
      </div>
    </div>
  );
}
