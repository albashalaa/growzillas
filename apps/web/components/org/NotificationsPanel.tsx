'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import type { NotificationItem } from '@/lib/notifications';
import {
  Bell,
  CheckCircle2,
  Clock3,
  MessageCircle,
  MessageSquare,
  UserPlus,
} from 'lucide-react';

interface NotificationsPanelProps {
  orgId: string;
  onClose: () => void;
}

export function NotificationsPanel({ orgId, onClose }: NotificationsPanelProps) {
  const router = useRouter();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [markingAll, setMarkingAll] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const getNotificationIcon = (type: string) => {
    const normalized = (type ?? '').toUpperCase();

    // Backend currently emits COMMENT_MENTION, TASK_ASSIGNED, SUBTASK_ASSIGNED.
    // Still handle the broader UI-requested set safely for any unknown types.
    if (normalized.includes('MENTION')) return MessageSquare;
    if (normalized === 'TASK_ASSIGNED' || normalized === 'SUBTASK_ASSIGNED')
      return CheckCircle2;
    if (normalized.includes('COMMENT')) return MessageCircle;
    if (normalized.includes('DUE_SOON') || normalized.includes('DUE'))
      return Clock3;
    if (normalized.includes('MEMBER') && normalized.includes('JOIN'))
      return UserPlus;

    // Meaningful fallback icon (no placeholder '!').
    return Bell;
  };

  const getNotificationTitle = (n: NotificationItem) => {
    const actor = (n.actorDisplayName && n.actorDisplayName.trim()) || 'Someone';
    const task = n.taskTitle || 'a task';
    const type = (n.type ?? '').toUpperCase();

    if (type === 'COMMENT_MENTION') return `${actor} mentioned you in ${task}`;
    if (type === 'TASK_ASSIGNED') return `${actor} assigned you to ${task}`;
    if (type === 'SUBTASK_ASSIGNED') return `${actor} assigned you to ${task}`;
    if (type === 'TASK_COMMENTED') return `${actor} commented on ${task}`;
    if (type === 'TASK_DUE_SOON') return `${task} is due soon`;

    return `${actor} updated ${task}`;
  };

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

  useEffect(() => {
    const handleFocus = () => {
      void loadNotifications();
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [orgId]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      if (!panel.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

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
    onClose();
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
    <div className="fixed inset-y-0 left-0 z-[9990] flex w-full pointer-events-none lg:left-64 lg:w-auto">
      <div
        ref={panelRef}
        className="pointer-events-auto flex h-full w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.20)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <svg
                  width={16}
                  height={16}
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M8 2.25C6.482 2.25 5.25 3.482 5.25 5V5.5C5.25 6.052 5.002 6.58 4.572 6.932L3.66 7.692C3.246 8.031 3 8.554 3 9.105V10.25C3 10.664 3.336 11 3.75 11H12.25C12.664 11 13 10.664 13 10.25V9.105C13 8.554 12.754 8.031 12.34 7.692L11.428 6.932C10.998 6.58 10.75 6.052 10.75 5.5V5C10.75 3.482 9.518 2.25 8 2.25Z"
                    stroke="#64748b"
                    strokeWidth="1.3"
                  />
                  <path
                    d="M6.25 11.5C6.25 12.467 7.034 13.25 8 13.25C8.966 13.25 9.75 12.467 9.75 11.5"
                    stroke="#64748b"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <h1 className="text-sm font-semibold text-slate-900">
                Notifications
              </h1>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Recent activity</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close notifications"
          >
            <svg
              width={14}
              height={14}
              viewBox="0 0 14 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4 4l6 6M10 4L4 10"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Subheader: unread + Mark all as read */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <span className="text-[11px] text-slate-500">
            {notifications.filter((n) => !n.isRead).length} unread
          </span>
          {notifications.some((n) => !n.isRead) && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={markingAll}
              className="text-[11px] font-medium text-slate-500 hover:text-slate-900 disabled:opacity-60"
            >
              {markingAll ? 'Marking…' : 'Mark all as read'}
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-[12px] text-slate-500">Loading…</p>
          ) : notifications.length === 0 ? (
            <p className="text-[12px] text-slate-500">No notifications yet</p>
          ) : (
            <ul className="space-y-3">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleOpenNotification(n)}
                    className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
                      n.isRead
                        ? 'border-slate-100 bg-white hover:border-slate-200'
                        : 'border-sky-100 bg-sky-50 hover:border-sky-200'
                    } ${n.taskId ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <div
                      className={`mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-xl text-[13px] ${
                        n.isRead
                          ? 'bg-slate-100 text-slate-500'
                          : 'bg-sky-100 text-sky-600'
                      }`}
                    >
                      {(() => {
                        const Icon = getNotificationIcon(n.type);
                        return <Icon size={16} />;
                      })()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-[13px] ${
                            n.isRead
                              ? 'font-medium text-slate-800'
                              : 'font-semibold text-slate-900'
                          }`}
                        >
                          {getNotificationTitle(n)}
                        </p>
                        <span className="whitespace-nowrap text-[11px] text-slate-400">
                          {new Date(n.createdAt).toLocaleTimeString(undefined, {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {n.commentBody && (
                        <p className="mt-1 text-[12px] text-slate-500">
                          {n.commentBody.length > 140
                            ? `${n.commentBody.slice(0, 137)}…`
                            : n.commentBody}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

