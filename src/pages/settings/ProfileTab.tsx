import { useEffect, useState } from 'react';
import { User, Lock, Eye, EyeOff, Save } from 'lucide-react';
import { useSettingsStore } from '../../store';
import { db } from '../../db';
import { useLang, useT } from '../../i18n';
import { settingsDict } from './strings';
import type { Notify } from './types';
import { updateAuthUsername } from '../../lib/authSession';
import { MIN_PASSWORD_LENGTH } from '../../lib/passwordAuth';

export default function ProfileTab({ notify }: { notify: Notify }) {
  const { settings, updateSettings } = useSettingsStore();
  const t = useT(settingsDict);
  const { isRtl } = useLang();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  useEffect(() => {
    setFirstName(settings.firstName || '');
    setLastName(settings.lastName || '');
    setUsername(settings.username || '');
  }, [settings]);

  const handleSaveProfile = async () => {
    if (!firstName.trim()) {
      notify('error', t('firstNameRequired'));
      return;
    }
    await updateSettings({ firstName, lastName });
    notify('success', t('profileSaved'));
  };

  const handleChangeUsername = async () => {
    if (username.length < 3) {
      notify('error', t('usernameMin'));
      return;
    }
    await updateSettings({ username });
    await updateAuthUsername(username);
    notify('success', t('usernameChanged'));
  };

  const handleChangePassword = async () => {
    if (!settings.username) return;
    const valid = await db.verifyCredentials(settings.username, currentPassword);
    if (!valid) {
      notify('error', t('wrongCurrentPassword'));
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      notify('error', t('passwordMin'));
      return;
    }
    if (newPassword !== confirmPassword) {
      notify('error', t('passwordMismatch'));
      return;
    }
    await updateSettings({ password: newPassword });
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    notify('success', t('passwordChanged'));
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Personal Info */}
      <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6">
        <div className="flex items-center gap-3 mb-6">
          <User className="text-teal-400" size={24} />
          <h3 className="font-semibold">{t('personalInfo')}</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-2 opacity-70">{t('firstName')}</label>
            <input
              type="text"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-teal-400 focus:outline-none"
              placeholder={t('firstNamePlaceholder')}
            />
          </div>
          <div>
            <label className="block text-sm mb-2 opacity-70">{t('lastName')}</label>
            <input
              type="text"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-teal-400 focus:outline-none"
              placeholder={t('lastNamePlaceholder')}
            />
          </div>
        </div>

        <button
          onClick={handleSaveProfile}
          className="mt-4 flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-gray-900 font-semibold hover:from-teal-400 hover:to-cyan-400 transition"
        >
          <Save size={20} />
          <span>{t('saveProfile')}</span>
        </button>
      </div>

      {/* Username */}
      <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6">
        <div className="flex items-center gap-3 mb-6">
          <User className="text-blue-400" size={24} />
          <h3 className="font-semibold">{t('changeUsername')}</h3>
        </div>

        <div>
          <label className="block text-sm mb-2 opacity-70">{t('newUsername')}</label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-400 focus:outline-none"
            placeholder={t('newUsername')}
          />
        </div>

        <button
          onClick={handleChangeUsername}
          className="mt-4 flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-500 hover:bg-blue-400 transition font-semibold"
        >
          <Save size={20} />
          <span>{t('changeUsername')}</span>
        </button>
      </div>

      {/* Password */}
      <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Lock className="text-purple-400" size={24} />
          <h3 className="font-semibold">{t('changePassword')}</h3>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <label className="block text-sm mb-2 opacity-70">{t('currentPassword')}</label>
            <input
              type={showCurrentPassword ? 'text' : 'password'}
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-purple-400 focus:outline-none"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              className={`absolute top-10 ${isRtl ? 'left-4' : 'right-4'} text-gray-400 hover:text-purple-400`}
            >
              {showCurrentPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          <div className="relative">
            <label className="block text-sm mb-2 opacity-70">{t('newPassword')}</label>
            <input
              type={showNewPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-purple-400 focus:outline-none"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              className={`absolute top-10 ${isRtl ? 'left-4' : 'right-4'} text-gray-400 hover:text-purple-400`}
            >
              {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          <div>
            <label className="block text-sm mb-2 opacity-70">{t('confirmNewPassword')}</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-purple-400 focus:outline-none"
              placeholder="••••••••"
            />
          </div>
        </div>

        <button
          onClick={handleChangePassword}
          className="mt-4 flex items-center gap-2 px-6 py-3 rounded-xl bg-purple-500 hover:bg-purple-400 transition font-semibold"
        >
          <Lock size={20} />
          <span>{t('changePassword')}</span>
        </button>
      </div>
    </div>
  );
}
