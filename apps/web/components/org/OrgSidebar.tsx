'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '@/lib/api';

const linkStyle = (active: boolean): React.CSSProperties => ({
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '10px 14px',
  marginBottom: '4px',
  border: '1px solid #000',
  backgroundColor: active ? '#000' : '#fff',
  color: active ? '#fff' : '#000',
  cursor: 'pointer',
  fontSize: '14px',
  textDecoration: 'none',
  fontFamily: 'inherit',
});

export function OrgSidebar() {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
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

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <aside
      style={{
        width: '200px',
        flexShrink: 0,
        minHeight: '100vh',
        padding: '24px 16px',
        borderRight: '1px solid #eee',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {user && (
        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              fontSize: '16px',
              fontWeight: 600,
              marginBottom: '8px',
              color: '#000',
            }}
          >
            {/* Organization name placeholder; can be replaced with real org name */}
            Growzillas
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                border: '1px solid #000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              {(() => {
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
              })()}
            </div>
            <div>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#000',
                }}
              >
                {user.displayName ||
                  [user.firstName, user.lastName].filter(Boolean).join(' ') ||
                  user.email}
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: '#555',
                }}
              >
                {user.email}
              </div>
            </div>
          </div>
        </div>
      )}

      <nav style={{ display: 'flex', flexDirection: 'column' }}>
        <Link href={`${base}/home`} style={linkStyle(isActive(`${base}/home`))}>
          Home
        </Link>
        <Link href={`${base}/my-tasks`} style={linkStyle(isActive(`${base}/my-tasks`))}>
          My Tasks
        </Link>
        <Link href={`${base}/tasks`} style={linkStyle(isActive(`${base}/tasks`))}>
          Tasks
        </Link>
        <Link href={`${base}/projects`} style={linkStyle(isActive(`${base}/projects`))}>
          Projects
        </Link>
        <Link href={`${base}/members`} style={linkStyle(isActive(`${base}/members`))}>
          Members
        </Link>
        <Link href={`${base}/notifications`} style={linkStyle(isActive(`${base}/notifications`))}>
          {`Notifications${
            unreadCount && unreadCount > 0 ? ` (${unreadCount})` : ''
          }`}
        </Link>
      </nav>
      <button
        type="button"
        onClick={handleLogout}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          padding: '10px 14px',
          marginTop: 'auto',
          marginBottom: '4px',
          border: '1px solid #000',
          backgroundColor: '#000',
          color: '#fff',
          cursor: 'pointer',
          fontSize: '14px',
          fontFamily: 'inherit',
        }}
      >
        Logout
      </button>
    </aside>
  );
}
