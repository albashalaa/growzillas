'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import {
  Bell,
  ClipboardList,
  Grid2X2,
  LayoutDashboard,
  Settings,
  Users,
} from 'lucide-react';

interface OrgSidebarProps {
  onOpenNotifications?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function OrgSidebar({
  onOpenNotifications,
  isMobileOpen = false,
  onCloseMobile,
}: OrgSidebarProps) {
  const params = useParams();
  const pathname = usePathname();
  const { user } = useAuth();
  const orgId = params?.orgId as string | undefined;

  const [unreadCount, setUnreadCount] = useState<number | null>(null);

  const fetchUnreadCount = async () => {
    if (!orgId) return;
    try {
      const data = await apiFetch('/notifications/unread-count', {
        headers: { 'x-org-id': orgId },
      });
      const count =
        data && typeof (data as any).unreadCount === 'number'
          ? (data as any).unreadCount
          : 0;
      setUnreadCount(count);
    } catch {
      setUnreadCount(null);
    }
  };

  useEffect(() => {
    void fetchUnreadCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  useEffect(() => {
    const handler = () => {
      void fetchUnreadCount();
    };
    window.addEventListener('focus', handler);
    window.addEventListener('notifications-updated', handler as EventListener);
    return () => {
      window.removeEventListener('focus', handler);
      window.removeEventListener(
        'notifications-updated',
        handler as EventListener,
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  if (!orgId) return null;

  const base = `/org/${orgId}`;
  const isActive = (path: string) =>
    pathname === path || (path !== base && pathname?.startsWith(path + '/'));

  const mainMenuItems = [
    { label: 'Dashboard', href: `${base}/home`, icon: LayoutDashboard },
    { label: 'My Tasks', href: `${base}/my-tasks`, icon: ClipboardList },
    { label: 'Tasks', href: `${base}/tasks`, icon: Grid2X2 },
    { label: 'Projects', href: `${base}/projects`, icon: LayoutDashboard },
    { label: 'Members', href: `${base}/members`, icon: Users },
    {
      label:
        unreadCount && unreadCount > 0
          ? `Notifications (${unreadCount})`
          : 'Notifications',
      href: `${base}/notifications`,
      icon: Bell,
    },
    { label: 'Settings', href: `${base}/settings`, icon: Settings },
  ];

  const userInitials = (() => {
    if (!user) return '?';
    const source =
      user.displayName ||
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.email ||
      '';
    const initials = source
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0]?.toUpperCase() || '')
      .slice(0, 2)
      .join('');
    return initials || '?';
  })();

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-black/30 transition-opacity lg:hidden ${
          isMobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onCloseMobile}
        aria-hidden={!isMobileOpen}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-white px-5 py-6 transition-transform lg:static lg:z-auto lg:min-h-screen lg:translate-x-0 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
      {/* Brand row */}
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-xs font-semibold text-white shadow-sm">
          G
        </div>
        <span className="text-sm font-semibold text-slate-900">Growzillas</span>
      </div>

      {/* Main menu */}
      <div>
        <p className="mb-3 text-[11px] font-semibold tracking-[0.16em] text-slate-400">
          MAIN MENU
        </p>
        <nav className="space-y-1">
          {mainMenuItems.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            const isNotificationsItem = item.label.startsWith('Notifications');

            if (isNotificationsItem && onOpenNotifications) {
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => {
                    onOpenNotifications?.();
                    onCloseMobile?.();
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    active
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-lg text-[13px] ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                    aria-hidden
                  >
                    <Icon size={16} strokeWidth={2} />
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onCloseMobile}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
                  active
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-lg text-[13px] ${
                    active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'
                  }`}
                  aria-hidden
                >
                  <Icon size={16} strokeWidth={2} />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom area */}
      <div className="mt-auto flex items-center justify-between pt-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
            {userInitials}
          </div>
        </div>
      </div>
      </aside>
    </>
  );
}
