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
}

type HomeNotificationItem = NotificationItem & {
  projectId: string | null;
  createdBy?: { email?: string } | null;
  createdById?: string;
  metadata?: { action?: string };
};

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
  const [activeTask, setActiveTask] = useState<HomeTask | null>(null);
  const taskStackRef = useRef<HomeTask[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      try {
        const [tasksData, projectsData, notifData] = await Promise.all([
          apiFetch('/tasks/my', { headers: { 'x-org-id': orgId } }),
          apiFetch('/projects', { headers: { 'x-org-id': orgId } }).catch(() => []),
          apiFetch('/notifications', { headers: { 'x-org-id': orgId } }).catch(() => []),
        ]);
        setMyTasks((tasksData as HomeTask[]) ?? []);
        setProjects(Array.isArray(projectsData) ? (projectsData as Project[]) : []);
        setNotifications(
          Array.isArray(notifData) ? (notifData as HomeNotificationItem[]) : [],
        );
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

  const sectionCardStyle: React.CSSProperties = {
    border: '1px solid #000',
    padding: '16px',
    backgroundColor: '#fff',
    marginBottom: '16px',
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: 600,
    marginBottom: '12px',
    color: '#111',
  };

  const taskRowStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '8px 0',
    borderBottom: '1px solid #eee',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    border: 'none',
    fontFamily: 'inherit',
    fontSize: '14px',
    color: '#111',
  };

  return (
    <div style={{ padding: '40px 24px', fontFamily: "'Montserrat', sans-serif" }}>
      <h1 style={{ fontSize: '24px', marginBottom: '8px', color: '#111' }}>Home</h1>
      <p style={{ marginBottom: '24px', color: '#555' }}>
        Welcome. Here's your urgent work and overview.
      </p>

      {loading ? (
        <p style={{ color: '#555' }}>Loading…</p>
      ) : (
        <>
          {/* Row 1: Overdue | Due Today */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '24px',
              marginBottom: '24px',
            }}
          >
            <div style={sectionCardStyle}>
              <h2 style={sectionTitleStyle}>Overdue</h2>
              {overdue.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#555' }}>None</p>
              ) : (
                overdue.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    style={taskRowStyle}
                    onClick={() => openTask(t)}
                  >
                    <span style={{ display: 'block', fontWeight: 500 }}>{t.title}</span>
                    <span style={{ fontSize: '12px', color: '#555' }}>
                      {t.dueDate
                        ? new Date(t.dueDate).toLocaleDateString()
                        : ''}
                    </span>
                    <span
                      style={{
                        display: 'inline-block',
                        marginTop: '4px',
                        padding: '2px 6px',
                        fontSize: '11px',
                        backgroundColor: '#c00',
                        color: '#fff',
                      }}
                    >
                      Overdue
                    </span>
                  </button>
                ))
              )}
            </div>
            <div style={sectionCardStyle}>
              <h2 style={sectionTitleStyle}>Due Today</h2>
              {dueToday.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#555' }}>None</p>
              ) : (
                dueToday.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    style={taskRowStyle}
                    onClick={() => openTask(t)}
                  >
                    <span style={{ display: 'block', fontWeight: 500 }}>{t.title}</span>
                    <span style={{ fontSize: '12px', color: '#555' }}>
                      {t.dueDate
                        ? new Date(t.dueDate).toLocaleDateString()
                        : ''}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Row 2: Upcoming | My Tasks Overview */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '24px',
              marginBottom: '24px',
            }}
          >
            <div style={sectionCardStyle}>
              <h2 style={sectionTitleStyle}>Upcoming</h2>
              {upcoming.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#555' }}>None</p>
              ) : (
                upcoming.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    style={taskRowStyle}
                    onClick={() => openTask(t)}
                  >
                    <span style={{ display: 'block', fontWeight: 500 }}>{t.title}</span>
                    <span style={{ fontSize: '12px', color: '#555' }}>
                      {t.dueDate
                        ? new Date(t.dueDate).toLocaleDateString()
                        : ''}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div style={sectionCardStyle}>
              <h2 style={sectionTitleStyle}>My Tasks Overview</h2>
              <p style={{ fontSize: '13px', color: '#555', marginBottom: '12px' }}>
                {myTasks.length} task{myTasks.length !== 1 ? 's' : ''} assigned to you
              </p>
              <button
                type="button"
                onClick={() => router.push(`/org/${orgId}/my-tasks`)}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #000',
                  backgroundColor: '#000',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Go to My Tasks
              </button>
            </div>
          </div>

          {/* Row 3: Recent Activity */}
          <div style={{ ...sectionCardStyle, marginBottom: '24px' }}>
            <h2 style={sectionTitleStyle}>Recent Activity</h2>
            {recentActivity.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#555' }}>No recent activity</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {recentActivity.map((n) => (
                  <li
                    key={n.id}
                    style={{
                      padding: '6px 0',
                      borderBottom: '1px solid #eee',
                      fontSize: '13px',
                      color: '#111',
                    }}
                  >
                    {n.taskTitle && (
                      <span style={{ fontWeight: 500 }}>{n.taskTitle}</span>
                    )}
                    {n.createdBy?.email && (
                      <span style={{ color: '#555', marginLeft: '4px' }}>
                        · {n.createdBy.email}
                      </span>
                    )}
                    <span style={{ color: '#555', marginLeft: '4px', fontSize: '12px' }}>
                      {new Date(n.createdAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Row 4: Projects */}
          <div style={sectionCardStyle}>
            <h2 style={sectionTitleStyle}>Projects</h2>
            {projects.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#555' }}>No projects</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {projects.slice(0, 8).map((p) => (
                  <li key={p.id} style={{ marginBottom: '8px' }}>
                    <button
                      type="button"
                      onClick={() => router.push(`/org/${orgId}/projects/${p.id}`)}
                      style={{
                        ...taskRowStyle,
                        borderBottom: 'none',
                        padding: '4px 0',
                      }}
                    >
                      {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => router.push(`/org/${orgId}/projects`)}
              style={{
                marginTop: '8px',
                padding: '6px 12px',
                border: '1px solid #000',
                backgroundColor: '#fff',
                color: '#111',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              View all projects
            </button>
          </div>

          {/* Quick Actions */}
          <div style={{ marginTop: '24px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: '14px', color: '#555', marginRight: '8px' }}>
              Quick Actions:
            </span>
            <button
              type="button"
              onClick={() => router.push(`/org/${orgId}/my-tasks`)}
              style={{
                padding: '6px 12px',
                border: '1px solid #000',
                backgroundColor: '#fff',
                color: '#111',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              My Tasks
            </button>
            <button
              type="button"
              onClick={() => router.push(`/org/${orgId}/tasks`)}
              style={{
                padding: '6px 12px',
                border: '1px solid #000',
                backgroundColor: '#fff',
                color: '#111',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Tasks
            </button>
            <button
              type="button"
              onClick={() => router.push(`/org/${orgId}/projects`)}
              style={{
                padding: '6px 12px',
                border: '1px solid #000',
                backgroundColor: '#fff',
                color: '#111',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Projects
            </button>
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
          onUpdated={async () => {
            const data = await apiFetch('/tasks/my', { headers: { 'x-org-id': orgId } });
            setMyTasks((data as HomeTask[]) ?? []);
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
