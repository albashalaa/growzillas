'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import type { NotificationItem } from '@/lib/notifications';
import { TaskDrawer, type TaskDrawerTask } from '@/components/tasks/TaskDrawer';
import { useAuth } from '@/contexts/AuthContext';

interface HomeTask {
  id: string;
  title: string;
  dueDate?: string | null;
  projectId: string;
  sectionId: string;
  parentId?: string | null;
  assignees: Array<{ id: string; email: string }>;
  projectName?: string;
  sectionName?: string;
}

interface Project {
  id: string;
  name: string;
  status?: string | null;
}

type HomeNotificationItem = NotificationItem & {
  projectId: string | null;
  createdBy?: { email?: string } | null;
  createdById?: string;
  metadata?: { action?: string };
};

interface DashboardStats {
  completedTasks: number;
  completedTasksChange: number;
  activeProjects: number;
  activeProjectsChange: number;
  upcomingDeadlines: number;
  teamMembers: number;
}

function ProjectStatusBadge({ status }: { status: string }) {
  const normalized = status || 'Onboarding';
  const key = normalized.toLowerCase();

  let bg = '#dbeafe';
  let text = '#1d4ed8';
  if (key === 'established') {
    bg = '#dcfce7';
    text = '#16a34a';
  } else if (key === 'on hold') {
    bg = '#fef3c7';
    text = '#d97706';
  } else if (key === 'terminated') {
    bg = '#fee2e2';
    text = '#dc2626';
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        padding: '4px 10px',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        backgroundColor: bg,
        color: text,
      }}
    >
      {normalized}
    </span>
  );
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function OrgHomePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const orgId = params.orgId as string;

  const [myTasks, setMyTasks] = useState<HomeTask[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [notifications, setNotifications] = useState<HomeNotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activeTask, setActiveTask] = useState<HomeTask | null>(null);
  const taskStackRef = useRef<HomeTask[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      try {
        const [tasksData, projectsData, notifData, statsData] = await Promise.all([
          apiFetch('/tasks/my', { headers: { 'x-org-id': orgId } }),
          apiFetch('/projects', { headers: { 'x-org-id': orgId } }).catch(() => []),
          apiFetch('/notifications', { headers: { 'x-org-id': orgId } }).catch(() => []),
          apiFetch('/dashboard/stats', { headers: { 'x-org-id': orgId } }).catch(
            () => null,
          ),
        ]);
        setMyTasks((tasksData as HomeTask[]) ?? []);
        setProjects(Array.isArray(projectsData) ? (projectsData as Project[]) : []);
        setNotifications(
          Array.isArray(notifData) ? (notifData as HomeNotificationItem[]) : [],
        );
        if (statsData) {
          setStats(statsData as DashboardStats);
        }
      } catch {
        setMyTasks([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [orgId, user]);

  const today = useMemo(() => startOfToday(), []);

  const { overdue, dueToday, upcoming } = useMemo(() => {
    const overdue: HomeTask[] = [];
    const dueToday: HomeTask[] = [];
    const upcoming: HomeTask[] = [];

    for (const t of myTasks) {
      const due = t.dueDate ? new Date(t.dueDate) : null;
      const sectionName = (t as HomeTask).sectionName ?? '';
      if (!due) continue;

      const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());

      if (dueStart < today) {
        if (sectionName !== 'Done') overdue.push(t);
      } else if (isSameDay(dueStart, today)) {
        dueToday.push(t);
      } else {
        upcoming.push(t);
      }
    }

    overdue.sort((a, b) => (new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()));
    upcoming.sort((a, b) => (new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()));

    return {
      overdue: overdue.slice(0, 5),
      dueToday: dueToday.slice(0, 5),
      upcoming: upcoming.slice(0, 5),
    };
  }, [myTasks, today]);

  const recentActivity = useMemo(() => {
    const mine =
      user && user.id
        ? notifications.filter((n) => n.createdById === user.id)
        : notifications;
    return mine.slice(0, 5);
  }, [notifications, user]);

  const openTask = (task: HomeTask) => {
    setActiveTask(task);
  };

  return (
    <div className="mx-auto max-w-6xl min-w-0">
        {/* Top bar */}
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {user?.firstName
                ? `Good Morning, ${user.firstName} 👋`
                : 'Good Morning 👋'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Here&apos;s what&apos;s happening in your workspace today.
            </p>
          </div>
          <div className="flex items-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
              {today.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <>
            {/* Stats row */}
            <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Tasks Completed</span>
                  {stats && (
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        stats.completedTasksChange >= 0
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-rose-50 text-rose-600'
                      }`}
                    >
                      {stats.completedTasksChange >= 0 ? '+' : ''}
                      {stats.completedTasksChange}%
                    </span>
                  )}
                </div>
                <p className="mt-4 text-2xl font-semibold text-slate-900">
                  {stats ? stats.completedTasks : 0}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Active Projects</span>
                  {stats && (
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        stats.activeProjectsChange >= 0
                          ? 'bg-sky-50 text-sky-600'
                          : 'bg-rose-50 text-rose-600'
                      }`}
                    >
                      {stats.activeProjectsChange >= 0 ? '+' : ''}
                      {stats.activeProjectsChange}
                    </span>
                  )}
                </div>
                <p className="mt-4 text-2xl font-semibold text-slate-900">
                  {stats ? stats.activeProjects : projects.length}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Upcoming Deadlines</span>
                  <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                    Next 48h
                  </span>
                </div>
                <p className="mt-4 text-2xl font-semibold text-slate-900">
                  {stats ? stats.upcomingDeadlines : dueToday.length + upcoming.length}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Team Members</span>
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                    Active
                  </span>
                </div>
                <p className="mt-4 text-2xl font-semibold text-slate-900">
                  {stats ? stats.teamMembers : 0}
                </p>
              </div>
            </div>

            {/* Main content: Recent Tasks & Active Projects */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Recent Tasks */}
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Recent Tasks
                  </h2>
                  <button
                    type="button"
                    onClick={() => router.push(`/org/${orgId}/my-tasks`)}
                    className="text-xs font-medium text-slate-500 hover:text-slate-900"
                  >
                    View all
                  </button>
                </div>
                {myTasks.length === 0 ? (
                  <p className="text-xs text-slate-500">No tasks yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {myTasks.slice(0, 5).map((t) => (
                      <li key={t.id} className="py-3">
                        <button
                          type="button"
                          onClick={() => openTask(t)}
                          className="flex w-full min-w-0 items-center justify-between gap-2 text-left"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className="mt-0.5 h-2 w-2 rounded-full bg-amber-400"
                              aria-hidden
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-900">
                                {t.title}
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                {t.projectName ?? 'Internal Docs'}
                              </p>
                            </div>
                          </div>
                          <span className="max-w-[40%] truncate rounded-full border border-slate-200 px-3 py-1 text-[10px] font-semibold uppercase text-slate-600">
                            {(t.sectionName ?? 'Todo').toUpperCase()}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Active Projects */}
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Active Projects
                  </h2>
                  <button
                    type="button"
                    onClick={() => router.push(`/org/${orgId}/projects`)}
                    className="text-xs font-medium text-slate-500 hover:text-slate-900"
                  >
                    View all
                  </button>
                </div>
                {projects.length === 0 ? (
                  <p className="text-xs text-slate-500">No projects yet.</p>
                ) : (
                  <div className="space-y-4">
                    {projects.slice(0, 3).map((p) => {
                      return (
                        <div
                          key={p.id}
                          role="button"
                          tabIndex={0}
                          onClick={() =>
                            router.push(
                              `/org/${orgId}/tasks?projectId=${p.id}&view=board`,
                            )
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              router.push(
                                `/org/${orgId}/tasks?projectId=${p.id}&view=board`,
                              );
                            }
                          }}
                          className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 cursor-pointer transition hover:bg-slate-100 focus:outline-none"
                        >
                          <p className="truncate text-sm font-medium text-slate-900">
                            {p.name}
                          </p>
                          <div className="mt-2">
                            <div className="mb-1 text-[10px] font-medium text-slate-400">
                              STATUS
                            </div>
                            <ProjectStatusBadge
                              status={(p.status ?? 'Onboarding') as string}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {activeTask && (
          <TaskDrawer
            orgId={orgId}
            task={{
              ...activeTask,
              projectName: activeTask.projectName ?? '',
              sectionName: activeTask.sectionName ?? '',
            } as HomeTask}
            parentTaskTitle={
              taskStackRef.current.length > 0
                ? taskStackRef.current[0].title
                : undefined
            }
            onClose={() => {
              taskStackRef.current = [];
              setActiveTask(null);
            }}
            onUpdated={async (updated: TaskDrawerTask) => {
              const data = await apiFetch('/tasks/my', { headers: { 'x-org-id': orgId } });
              setMyTasks((data as HomeTask[]) ?? []);
              setActiveTask((prev) =>
                prev && prev.id === updated.id
                  ? { ...prev, ...updated, projectName: prev.projectName, sectionName: (updated as any).section?.name ?? prev.sectionName } as HomeTask
                  : prev,
              );
            }}
            onDeleted={async () => {
              const data = await apiFetch('/tasks/my', { headers: { 'x-org-id': orgId } });
              setMyTasks((data as HomeTask[]) ?? []);
              setActiveTask(null);
            }}
            onOpenTask={(t: TaskDrawerTask) => {
              taskStackRef.current = [activeTask!, ...taskStackRef.current];
              setActiveTask({
                ...t,
                projectName: (t as HomeTask).projectName ?? '',
                sectionName: (t as HomeTask).sectionName ?? '',
              } as HomeTask);
            }}
            onBackToParent={() => {
              const prev = taskStackRef.current.shift();
              if (prev) setActiveTask(prev);
            }}
          />
        )}
      </div>
  );
}
