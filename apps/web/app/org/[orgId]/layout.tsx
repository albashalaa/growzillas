'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { OrgSidebar } from '../../../components/org/OrgSidebar';
import { GlobalSearch } from '../../../components/search/GlobalSearch';
import { NotificationsPanel } from '../../../components/org/NotificationsPanel';
import { useAuth } from '../../../contexts/AuthContext';
import { API_BASE_URL } from '../../../lib/api';
import { ChevronDown, Menu } from 'lucide-react';

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;

  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const fullName =
    (user?.firstName || user?.lastName)
      ? `${user?.firstName || ''} ${user?.lastName || ''}`.trim()
      : user?.displayName || user?.email || '';

  const roleLabel = user?.role || '';
  const avatarUrl = user?.avatarUrl;

  useEffect(() => {
    if (!isProfileMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const node = profileMenuRef.current;
      if (node && !node.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isProfileMenuOpen]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push('/login');
    }
  }, [loading, user, router]);

  const handleLogout = () => {
    logout();
    router.push('/login');
    setIsProfileMenuOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-white">
      <OrgSidebar
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        isMobileOpen={isSidebarOpen}
        onCloseMobile={() => setIsSidebarOpen(false)}
      />

      {/* Right side: top navbar + page content */}
      <div className="relative flex min-h-screen min-w-0 flex-1 flex-col bg-slate-50">
        {/* Top navbar */}
        <header className="flex h-14 items-center gap-2 border-b border-slate-100 bg-white px-3 shadow-[0_1px_0_rgba(15,23,42,0.03)] sm:px-5 lg:px-8">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 lg:hidden"
            aria-label="Open sidebar"
          >
            <Menu size={18} />
          </button>
          <GlobalSearch />

          {/* Right-side actions */}
          <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
            {/* User block */}
            <div ref={profileMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsProfileMenuOpen((v) => !v)}
                className="flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 outline-none transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-300 sm:gap-3"
                aria-haspopup="menu"
                aria-expanded={isProfileMenuOpen}
              >
                <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-slate-300 sm:h-9 sm:w-9">
                  {avatarUrl && (
                    <img
                      src={
                        avatarUrl.startsWith('http')
                          ? avatarUrl
                          : `${API_BASE_URL}${avatarUrl}`
                      }
                      alt={fullName || 'Avatar'}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 leading-snug text-left">
                  <div className="truncate text-[12px] font-medium text-slate-900 sm:text-[13px]">
                    {fullName || 'Account'}
                  </div>
                  {roleLabel && (
                    <div className="truncate text-[11px] text-slate-500">{roleLabel}</div>
                  )}
                </div>
                <ChevronDown
                  size={14}
                  className={`ml-0.5 shrink-0 text-slate-400 transition-transform ${
                    isProfileMenuOpen ? 'rotate-180' : 'rotate-0'
                  }`}
                  aria-hidden
                />
              </button>
              {isProfileMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-[calc(100%+8px)] z-40 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.14)]"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      router.push(`/org/${orgId}/settings`);
                    }}
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50"
                  >
                    Settings
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-[13px] text-rose-600 hover:bg-rose-50"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-x-hidden px-3 py-4 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
          {children}
        </main>

        {/* Notifications overlay drawer */}
        {isNotificationsOpen && orgId && (
          <NotificationsPanel
            orgId={orgId}
            onClose={() => setIsNotificationsOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
