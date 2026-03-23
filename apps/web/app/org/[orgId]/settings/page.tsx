'use client';

import { useEffect, useRef, useState } from 'react';
import { Lock, Palette, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../../../contexts/AuthContext';
import { apiFetch, apiFetchFormData, API_BASE_URL } from '../../../../lib/api';
import {
  applyTheme,
  getStoredTheme,
  type ThemePreference,
} from '../../../../components/ThemeInitializer';

export default function OrgSettingsPage() {
  const { user, refreshMe } = useAuth();

  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [email] = useState(user?.email ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null | undefined>(user?.avatarUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeTab, setActiveTab] = useState<'Profile' | 'Security' | 'Appearance'>(
    'Profile',
  );

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [securityError, setSecurityError] = useState('');
  const [securitySuccess, setSecuritySuccess] = useState('');
  const [securitySaving, setSecuritySaving] = useState(false);

  const [theme, setTheme] = useState<ThemePreference>('light');

  useEffect(() => {
    const pref = getStoredTheme();
    setTheme(pref);
  }, []);

  const handleThemeChange = (next: ThemePreference) => {
    setTheme(next);
    applyTheme(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const updated = await apiFetch('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: firstName.trim() || null,
          lastName: lastName.trim() || null,
          bio: bio.trim() || null,
        }),
      });
      setFirstName(updated.firstName ?? '');
      setLastName(updated.lastName ?? '');
      setBio(updated.bio ?? '');
      setAvatarUrl(updated.avatarUrl ?? null);
      await refreshMe();
      setSuccess('Profile updated.');
    } catch (err: any) {
      setError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const updated = await apiFetchFormData('/auth/me/avatar', formData);
      setAvatarUrl(updated.avatarUrl ?? null);
      await refreshMe();
      setSuccess('Profile picture updated.');
      e.target.value = '';
    } catch (err: any) {
      setError(err.message || 'Failed to upload profile picture');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await apiFetch('/auth/me/avatar/delete', { method: 'POST' });
      setAvatarUrl(null);
      await refreshMe();
      setSuccess('Profile picture removed.');
    } catch (err: any) {
      setError(err.message || 'Failed to remove profile picture');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityError('');
    setSecuritySuccess('');

    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      setSecurityError('All password fields are required.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setSecurityError('New password and confirmation do not match.');
      return;
    }

    setSecuritySaving(true);
    try {
      await apiFetch('/auth/me/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSecuritySuccess('Password updated successfully.');
    } catch (err: any) {
      const msg = err.message || 'Failed to update password';
      setSecurityError(msg);
    } finally {
      setSecuritySaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-4 sm:px-5 sm:py-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-6xl">
        {/* Page header */}
        <header className="mb-9">
          <h1 className="text-[24px] font-semibold leading-snug text-slate-900">
            Settings
          </h1>
          <p className="mt-1.5 text-[13px] text-slate-500">
            Manage your account and application preferences.
          </p>
        </header>

        {/* Main content: strict two-column layout */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-12">
          {/* Left settings navigation */}
          <nav className="w-full pt-0 text-[13px] text-slate-600 lg:w-56 lg:pt-2">
            <ul className="flex gap-1.5 overflow-x-auto lg:block lg:space-y-1.5">
              {[
                { label: 'Profile', icon: UserIcon },
                { label: 'Security', icon: Lock },
                { label: 'Appearance', icon: Palette },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.label;
                return (
                  <li key={item.label} className="flex-shrink-0 lg:block">
                    <button
                      type="button"
                      onClick={() => setActiveTab(item.label as typeof activeTab)}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition lg:px-1.5 ${
                        isActive
                          ? 'text-slate-900 font-semibold'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                        <Icon size={16} strokeWidth={1.7} />
                      </span>
                      <span className="font-medium tracking-[0.01em]">
                        {item.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Right column: settings content */}
          <main className="min-w-0 flex-1">
            {activeTab === 'Profile' && (
              <section className="max-w-xl rounded-2xl border border-slate-100 bg-white px-4 py-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:px-6 sm:py-6 lg:px-8 lg:py-7">
              <h2 className="text-[15px] font-semibold leading-snug text-slate-900">
                Public Profile
              </h2>

              {error && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
                  {error}
                </div>
              )}
              {success && (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">
                  {success}
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-5 space-y-5.5">
                {/* Profile picture row */}
                <div className="flex items-center gap-4">
                  <div className="h-[56px] w-[56px] overflow-hidden rounded-full bg-slate-200">
                    {avatarUrl ? (
                      // Prefix relative URLs with API base
                      <img
                        src={
                          avatarUrl.startsWith('http')
                            ? avatarUrl
                            : `${API_BASE_URL}${avatarUrl}`
                        }
                        alt="Avatar"
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="flex-1">
                    <div className="text-[12px] font-medium text-slate-700">
                      Profile Picture
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      JPG, GIF or PNG. Max size of 800K
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px]">
                      <button
                        type="button"
                        onClick={handleUploadClick}
                        className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                      >
                        Upload
                      </button>
                      {avatarUrl && (
                        <button
                          type="button"
                          onClick={handleRemoveAvatar}
                          className="text-slate-400 hover:text-slate-500"
                        >
                          Remove
                        </button>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarChange}
                      />
                    </div>
                  </div>
                </div>

                {/* Name fields */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-medium text-slate-700">
                      First Name
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-900 shadow-sm outline-none focus:border-slate-900 focus:bg-white focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-medium text-slate-700">
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-900 shadow-sm outline-none focus:border-slate-900 focus:bg-white focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-medium text-slate-700">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    readOnly
                    className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-900 shadow-sm outline-none focus:border-slate-900 focus:bg-white focus:ring-1 focus:ring-slate-900"
                  />
                </div>

                {/* Bio */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-medium text-slate-700">
                    Bio
                  </label>
                  <textarea
                    rows={4}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-900 shadow-sm outline-none focus:border-slate-900 focus:bg-white focus:ring-1 focus:ring-slate-900"
                  />
                </div>

                {/* Bottom divider and actions */}
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <div className="flex justify-end gap-3.5">
                    <button
                      type="button"
                      disabled={saving}
                      className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-4 text-[13px] font-medium text-white shadow-[0_10px_25px_rgba(15,23,42,0.35)] hover:bg-slate-800 disabled:opacity-60"
                    >
                      {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </form>
            </section>
            )}

            {activeTab === 'Security' && (
              <section className="max-w-xl rounded-2xl border border-slate-100 bg-white px-4 py-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:px-6 sm:py-6 lg:px-8 lg:py-7">
                <h2 className="text-[15px] font-semibold leading-snug text-slate-900">
                  Security
                </h2>

                {securityError && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
                    {securityError}
                  </div>
                )}
                {securitySuccess && (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">
                    {securitySuccess}
                  </div>
                )}

                <form onSubmit={handleChangePassword} className="mt-5 space-y-5">
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-medium text-slate-700">
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-900 shadow-sm outline-none focus:border-slate-900 focus:bg-white focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-medium text-slate-700">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-900 shadow-sm outline-none focus:border-slate-900 focus:bg-white focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-medium text-slate-700">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-900 shadow-sm outline-none focus:border-slate-900 focus:bg-white focus:ring-1 focus:ring-slate-900"
                    />
                  </div>

                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <div className="flex justify-end gap-3.5">
                      <button
                        type="button"
                        disabled={securitySaving}
                        onClick={() => {
                          setCurrentPassword('');
                          setNewPassword('');
                          setConfirmPassword('');
                          setSecurityError('');
                          setSecuritySuccess('');
                        }}
                        className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={securitySaving}
                        className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-4 text-[13px] font-medium text-white shadow-[0_10px_25px_rgba(15,23,42,0.35)] hover:bg-slate-800 disabled:opacity-60"
                      >
                        {securitySaving ? 'Saving…' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                </form>
              </section>
            )}

            {activeTab === 'Appearance' && (
              <section className="max-w-xl rounded-2xl border border-slate-100 bg-white px-4 py-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:px-6 sm:py-6 lg:px-8 lg:py-7">
                <h2 className="text-[15px] font-semibold leading-snug text-slate-900">
                  Theme
                </h2>
                <p className="mt-1.5 text-[12px] text-slate-500">
                  Choose how Growzillas looks on this device.
                </p>

                <div className="mt-5">
                  <div className="inline-flex rounded-xl border border-slate-100 bg-slate-50 p-1 text-[12px] font-medium text-slate-600 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                    <button
                      type="button"
                      onClick={() => handleThemeChange('light')}
                      className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 transition ${
                        theme === 'light'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <span className="h-2 w-2 rounded-full bg-amber-300" />
                      <span>Light</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleThemeChange('dark')}
                      className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 transition ${
                        theme === 'dark'
                          ? 'bg-slate-900 text-slate-50 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <span className="h-2 w-2 rounded-full bg-slate-700" />
                      <span>Dark</span>
                    </button>
                  </div>
                </div>
              </section>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

