'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import type { NotificationItem } from '@/lib/notifications';

export default function OrgNotificationsPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = async () => {
    try {
      const data = await apiFetch('/notifications', {
        headers: { 'x-org-id': orgId },
        cache: 'no-store',
      });
      setNotifications(Array.isArray(data) ? (data as NotificationItem[]) : []);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load notifications');
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // Refresh notifications when the window regains focus (e.g. after new mentions)
  useEffect(() => {
    const handleFocus = () => {
      void loadNotifications();
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [orgId]);

  const handleOpenNotification = async (n: NotificationItem) => {
    if (!n.taskId) return;

    try {
      if (!n.isRead) {
        await apiFetch(`/notifications/${n.id}/read`, {
          method: 'PATCH',
          headers: { 'x-org-id': orgId },
        });
        setNotifications((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)),
        );
      }
    } catch {
      // ignore read error, still navigate
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('notifications-updated'));
    }

    router.push(`/org/${orgId}/tasks?taskId=${n.taskId}`);
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await apiFetch('/notifications/read-all', {
        method: 'PATCH',
        headers: { 'x-org-id': orgId },
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (err: any) {
      alert(err.message || 'Failed to mark all as read');
    } finally {
      setMarkingAll(false);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('notifications-updated'));
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#fff',
        fontFamily: "'Montserrat', sans-serif",
      }}
    >
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
        <h1
          style={{
            fontSize: '24px',
            marginBottom: '16px',
            color: '#111',
          }}
        >
          Notifications
        </h1>

        {error && (
          <div
            style={{
              padding: '10px',
              border: '1px solid #000',
              marginBottom: '16px',
              color: '#111',
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
          }}
        >
          <span style={{ fontSize: '13px', color: '#555' }}>
            {notifications.filter((n) => !n.isRead).length} unread
          </span>
          {notifications.some((n) => !n.isRead) && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={markingAll}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                border: '1px solid #000',
                backgroundColor: '#fff',
                color: '#000',
                cursor: markingAll ? 'not-allowed' : 'pointer',
              }}
            >
              {markingAll ? 'Marking…' : 'Mark all as read'}
            </button>
          )}
        </div>

        {loading ? (
          <p style={{ fontSize: '13px', color: '#555' }}>Loading…</p>
        ) : notifications.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#555' }}>No notifications yet</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {notifications.map((n) => (
              <li
                key={n.id}
                onClick={() => handleOpenNotification(n)}
                style={{
                  padding: '10px 12px',
                  border: '1px solid #000',
                  borderRadius: '4px',
                  marginBottom: '8px',
                  backgroundColor: n.isRead ? '#fff' : '#f5f5f5',
                  cursor: n.taskId ? 'pointer' : 'default',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: '2px',
                  }}
                >
                  {!n.isRead && (
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: '#000',
                        marginRight: '6px',
                      }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: '13px',
                      color: '#111',
                      fontWeight: n.isRead ? 400 : 600,
                    }}
                  >
                    {(n.actorDisplayName && n.actorDisplayName.trim()) || 'Someone'} mentioned you in{' '}
                    {n.taskTitle || 'a task'}
                  </span>
                </div>
                {n.commentBody && (
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#555',
                      marginBottom: '2px',
                    }}
                  >
                    {n.commentBody.length > 140
                      ? `${n.commentBody.slice(0, 137)}…`
                      : n.commentBody}
                  </div>
                )}
                <div
                  style={{
                    fontSize: '11px',
                    color: '#777',
                  }}
                >
                  {new Date(n.createdAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

