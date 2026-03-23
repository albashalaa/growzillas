'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { DndContext, DragEndEvent, useDroppable, useDraggable } from '@dnd-kit/core';
import { apiFetch } from '../../lib/api';
import { TaskDrawer, type TaskDrawerTask } from './TaskDrawer';
import { useAuth } from '../../contexts/AuthContext';
import { mapOrgMember } from '../../lib/map-org-member';
import { UserAvatar } from '../ui/UserAvatar';
import { PrimaryActionButton } from '../ui/PrimaryActionButton';
import { CalendarDays, CheckCircle2, Clock3 } from 'lucide-react';

type ViewMode = 'board' | 'list';

const GLOBAL_SECTIONS = ['Backlog', 'In Progress', 'Review', 'Done'] as const;
type GlobalSection = (typeof GLOBAL_SECTIONS)[number];

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

interface WorkspaceTask extends TaskDrawerTask {
  projectName: string;
  sectionName: string;
  project?: {
    id: string;
    name: string;
  } | null;
}

interface Project {
  id: string;
  name: string;
}

interface ProjectSection {
  id: string;
  name: string;
  order: number;
}

interface OrgMember {
  id: string;
  email: string | null;
  displayName?: string | null;
}

export function OrgTasksWorkspace({ mode }: { mode: 'all' | 'mine' }) {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const orgId = params.orgId as string;
  const filterProjectId = searchParams.get('projectId') ?? undefined;
  const filterAssigneeId = searchParams.get('assigneeId') ?? undefined;
  const filterStatus = searchParams.get('status') ?? undefined;

  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTask, setActiveTask] = useState<WorkspaceTask | null>(null);
  const taskStackRef = useRef<WorkspaceTask[]>([]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [sectionsByProject, setSectionsByProject] = useState<
    Record<string, ProjectSection[]>
  >({});
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [showProjectPickForCreate, setShowProjectPickForCreate] = useState(false);
  const [createProjectId, setCreateProjectId] = useState('');
  const [pendingCreateColumn, setPendingCreateColumn] = useState<GlobalSection | null>(null);

  const handledTaskIdRef = useRef<string | null>(null);

  const initialView = ((): ViewMode => {
    const v = searchParams.get('view');
    return v === 'list' || v === 'board' ? (v as ViewMode) : 'board';
  })();
  const [view, setView] = useState<ViewMode>(initialView);

  useEffect(() => {
    const v = searchParams.get('view');
    if (v === 'list' || v === 'board') {
      setView(v as ViewMode);
    }
  }, [searchParams]);

  // Open a specific task from query string (e.g. ?taskId=...)
  useEffect(() => {
    const taskIdFromQuery = searchParams.get('taskId');
    if (!taskIdFromQuery || tasks.length === 0) return;
    if (handledTaskIdRef.current === taskIdFromQuery) return;
    const found = tasks.find((t) => t.id === taskIdFromQuery);
    if (!found) return;
    setActiveTask(found);
    handledTaskIdRef.current = taskIdFromQuery;
  }, [searchParams, tasks]);

  const basePath = mode === 'mine' ? '/my-tasks' : '/tasks';

  const setViewAndUrl = (next: ViewMode) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set('view', next);
    router.push(`/org/${orgId}${basePath}?${sp.toString()}`);
    setView(next);
  };

  const setProjectFilterAndUrl = (projectId: string | undefined) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (projectId) {
      sp.set('projectId', projectId);
    } else {
      sp.delete('projectId');
    }
    router.push(`/org/${orgId}${basePath}?${sp.toString()}`);
  };

  const setAssigneeFilterAndUrl = (assigneeId: string | undefined) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (assigneeId) {
      sp.set('assigneeId', assigneeId);
    } else {
      sp.delete('assigneeId');
    }
    router.push(`/org/${orgId}${basePath}?${sp.toString()}`);
  };

  const setStatusFilterAndUrl = (status: string | undefined) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (status) {
      sp.set('status', status);
    } else {
      sp.delete('status');
    }
    router.push(`/org/${orgId}${basePath}?${sp.toString()}`);
  };

  const clearFiltersAndUrl = () => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete('projectId');
    sp.delete('assigneeId');
    sp.delete('status');
    router.push(`/org/${orgId}${basePath}?${sp.toString()}`);
  };

  const loadTasks = async () => {
    try {
      if (mode === 'mine') {
        const data = await apiFetch('/tasks/my', {
          headers: { 'x-org-id': orgId },
        });
        const normalized = (data as any[]).map((t) => ({
          ...t,
          projectName: t.projectName ?? t.project?.name ?? '',
        })) as WorkspaceTask[];
        setTasks(normalized);
      } else {
        const projectsData = await apiFetch('/projects', {
          headers: { 'x-org-id': orgId },
        });
        const projectsList = projectsData as Project[];
        setProjects(projectsList);

        const targetProjects = filterProjectId
          ? projectsList.filter((p) => p.id === filterProjectId)
          : projectsList;

        const tasksArrays = await Promise.all(
          targetProjects.map((p) =>
            apiFetch(`/tasks?projectId=${p.id}`, {
              headers: { 'x-org-id': orgId },
            }),
          ),
        );

        const allTasks: WorkspaceTask[] = [];
        for (let i = 0; i < targetProjects.length; i++) {
          const project = targetProjects[i];
          const list = (tasksArrays[i] ?? []) as Array<{
            id: string;
            title: string;
            priority?: string | null;
            dueDate?: string | null;
            projectId: string;
            project?: { id: string; name: string } | null;
            parentId?: string | null;
            section?: { id: string; name: string } | null;
            assignees: Array<{
              id: string;
              email: string;
              displayName?: string | null;
              avatarUrl?: string | null;
            }>;
          }>;
          for (const t of list) {
            allTasks.push({
              id: t.id,
              title: t.title,
              priority: t.priority ?? null,
              dueDate: t.dueDate ?? null,
              projectId: t.projectId,
              sectionId: t.section?.id ?? '',
              parentId: t.parentId ?? null,
              assignees: t.assignees ?? [],
              projectName: t.project?.name ?? project.name,
              sectionName: t.section?.name ?? '',
              project: t.project ?? { id: project.id, name: project.name },
            });
          }
        }
        setTasks(allTasks);
      }
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  const loadMeta = async () => {
    try {
      const [projectsData, membersData] = await Promise.all([
        apiFetch('/projects', { headers: { 'x-org-id': orgId } }),
        apiFetch(`/orgs/${orgId}/members`, { headers: { 'x-org-id': orgId } }),
      ]);

      const projectsList = projectsData as Project[];
      setProjects(projectsList);

      const sectionsEntries = await Promise.all(
        projectsList.map(async (p) => {
          const secs = await apiFetch(`/projects/${p.id}/sections`);
          return [p.id, secs as ProjectSection[]] as const;
        }),
      );
      const sectionsMap: Record<string, ProjectSection[]> = {};
      for (const [pid, secs] of sectionsEntries) {
        sectionsMap[pid] = secs;
      }
      setSectionsByProject(sectionsMap);

      setMembers((membersData as any[]).map((m) => mapOrgMember(m)));
    } catch (err: any) {
      setError((prev) => prev || err.message || 'Failed to load metadata');
    }
  };

  useEffect(() => {
    void loadTasks();
    void loadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, mode, filterProjectId]);

  // Keep project sections + tasks in sync after Create/Edit Project.
  useEffect(() => {
    const handler = (event: Event) => {
      const ce = event as CustomEvent<{ projectId?: string }>;
      const updatedProjectId = ce.detail?.projectId;
      if (!updatedProjectId) return;

      // If we're currently viewing a specific project, only refresh when it matches.
      if (filterProjectId && updatedProjectId !== filterProjectId) return;

      void loadMeta();
      void loadTasks();
    };

    window.addEventListener('project:sections-updated', handler);
    return () => window.removeEventListener('project:sections-updated', handler);
  }, [orgId, mode, filterProjectId]);

  const handleTaskUpdated = (updated: TaskDrawerTask) => {
    const isAssignedToCurrentUser =
      mode === 'mine' &&
      !!user &&
      (updated.assignees ?? []).some((a) => a.id === user.id);

    const projectSections = sectionsByProject[updated.projectId] ?? [];
    const section = projectSections.find((s) => s.id === updated.sectionId);
    const project = projects.find((p) => p.id === updated.projectId);

    setTasks((prev) => {
      if (mode === 'mine' && !isAssignedToCurrentUser) {
        return prev.filter((t) => t.id !== updated.id);
      }

      const exists = prev.some((t) => t.id === updated.id);
      if (exists) {
        return prev.map((t) =>
          t.id === updated.id
            ? {
                ...t,
                title: updated.title,
                description: updated.description ?? t.description,
                priority: updated.priority ?? t.priority,
                dueDate: updated.dueDate ?? null,
                sectionId: updated.sectionId,
                sectionName: section?.name ?? t.sectionName,
                assignees: updated.assignees ?? t.assignees,
                parentId: updated.parentId ?? t.parentId,
              }
            : t,
        );
      }

      // New task (e.g., newly created subtask) — add to list
      if (mode === 'mine' && !isAssignedToCurrentUser) return prev;
      return [
        ...prev,
        {
          id: updated.id,
          title: updated.title,
          description: updated.description ?? null,
          priority: updated.priority ?? null,
          dueDate: updated.dueDate ?? null,
          projectId: updated.projectId,
          sectionId: updated.sectionId,
          parentId: updated.parentId ?? null,
          assignees: updated.assignees ?? [],
          projectName: project?.name ?? '',
          sectionName: section?.name ?? '',
        },
      ];
    });

    setActiveTask((prev) => {
      if (!prev || prev.id !== updated.id) return prev;

      const merged = {
        ...prev,
        title: updated.title,
        description: updated.description ?? prev.description,
        priority: updated.priority ?? prev.priority,
        dueDate: updated.dueDate ?? null,
        sectionId: updated.sectionId,
        sectionName: section?.name ?? prev.sectionName,
        assignees: updated.assignees ?? prev.assignees,
        parentId: updated.parentId ?? prev.parentId,
      } as WorkspaceTask;

      if (mode === 'mine' && !isAssignedToCurrentUser) {
        return merged;
      }

      return merged;
    });
  };

  const createTaskInProject = async (
    projectId: string,
    initialColumn?: string | null,
  ) => {
    try {
      const projectSections = sectionsByProject[projectId] ?? [];
      const initialSectionId = initialColumn
        ? projectSections.find((s) => s.name === initialColumn)?.id
        : undefined;

      const created = await apiFetch('/tasks', {
        method: 'POST',
        headers: { 'x-org-id': orgId },
        body: JSON.stringify({
          projectId,
          title: 'Untitled task',
          priority: 'MEDIUM',
          sectionId: initialSectionId || undefined,
        }),
      });
      const res = created as any;
      const project = projects.find((p) => p.id === res.projectId);
      const sections = sectionsByProject[res.projectId] ?? [];
      const section = sections.find((s) => s.id === res.sectionId);

      const newTask: WorkspaceTask = {
        id: res.id,
        title: res.title,
        description: res.description ?? null,
        priority: res.priority ?? 'MEDIUM',
        dueDate: res.dueDate ?? null,
        projectId: res.projectId,
        sectionId: res.sectionId,
        parentId: res.parentId ?? null,
        assignees: res.assignees ?? [],
        projectName: project?.name ?? '',
        sectionName: section?.name ?? '',
      };

      setTasks((prev) => [...prev, newTask]);
      setActiveTask(newTask);
    } catch (err: any) {
      alert(err.message || 'Failed to create task');
    }
  };

  const handleAddTask = async (initialColumn?: string | null) => {
    // Project-filtered/project-context: project is preselected automatically.
    if (filterProjectId) {
      await createTaskInProject(filterProjectId, initialColumn ?? null);
      return;
    }

    // Global Tasks context: project selection is required.
    if (projects.length === 0) {
      alert('No project available. Create a project first.');
      return;
    }

    setPendingCreateColumn((initialColumn as GlobalSection | null) ?? null);
    setCreateProjectId('');
    setShowProjectPickForCreate(true);
  };

  const tasksByGlobalSection = useMemo(() => {
    const result: Record<GlobalSection, WorkspaceTask[]> = {
      Backlog: [],
      'In Progress': [],
      Review: [],
      Done: [],
    };
    for (const t of tasks) {
      const name = t.sectionName || '';
      const match = GLOBAL_SECTIONS.find((g) => g === name) ?? 'Backlog';
      result[match].push(t);
    }
    return result;
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesProject = !filterProjectId || task.projectId === filterProjectId;
      const matchesAssignee =
        !filterAssigneeId ||
        (task.assignees ?? []).some((assignee) => assignee.id === filterAssigneeId);
      const taskStatus = task.sectionName?.trim();
      const matchesStatus = !filterStatus || (taskStatus && taskStatus === filterStatus);
      return !!matchesProject && !!matchesAssignee && !!matchesStatus;
    });
  }, [tasks, filterProjectId, filterAssigneeId, filterStatus]);

  const filteredTasksByGlobalSection = useMemo(() => {
    const result: Record<GlobalSection, WorkspaceTask[]> = {
      Backlog: [],
      'In Progress': [],
      Review: [],
      Done: [],
    };
    for (const t of filteredTasks) {
      const name = t.sectionName || '';
      const match = GLOBAL_SECTIONS.find((g) => g === name) ?? 'Backlog';
      result[match].push(t);
    }
    return result;
  }, [filteredTasks]);

  const projectSectionsOrdered = useMemo(() => {
    if (!filterProjectId) return [];
    const secs = sectionsByProject[filterProjectId] ?? [];
    return [...secs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [filterProjectId, sectionsByProject]);

  const filteredTasksByProjectSection = useMemo(() => {
    if (!filterProjectId) return {} as Record<string, WorkspaceTask[]>;

    const columns = projectSectionsOrdered.map((s) => s.name);
    const result: Record<string, WorkspaceTask[]> = {};
    for (const c of columns) result[c] = [];

    for (const t of filteredTasks) {
      const key = t.sectionName?.trim() ?? '';
      if (key && result[key]) {
        result[key].push(t);
      } else if (columns.length > 0) {
        // Defensive: if tasks have a stale/missing section name, keep them visible.
        result[columns[0]]?.push(t);
      }
    }

    return result;
  }, [filterProjectId, filteredTasks, projectSectionsOrdered]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const taskId = event.active.id as string;
    const columnId = event.over?.id as string | undefined;
    if (!taskId || !columnId) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const sections = sectionsByProject[task.projectId] ?? [];
    const targetSection = sections.find((s) => s.name === columnId);
    if (!targetSection) {
      alert(`This project doesn't have a '${columnId}' section`);
      return;
    }

    try {
      await apiFetch(`/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'x-org-id': orgId },
        body: JSON.stringify({ sectionId: targetSection.id }),
      });

      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? {
                ...t,
                sectionId: targetSection.id,
                sectionName: targetSection.name,
              }
            : t,
        ),
      );
    } catch (err: any) {
      alert(err.message || 'Failed to move task');
    }
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fff',
          color: '#111',
        }}
      >
        Loading tasks...
      </div>
    );
  }

  const filterProject = filterProjectId
    ? projects.find((p) => p.id === filterProjectId)
    : undefined;
  const title = filterProject
    ? filterProject.name
    : mode === 'mine'
      ? 'My Tasks'
      : 'Tasks';
  const subtitle = filterProject
    ? 'Tasks for this project.'
    : 'Tasks assigned to you across all projects.';

  return (
    <>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#f9fafb',
          fontFamily: "'Montserrat', sans-serif",
          overflowX: 'hidden',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '16px clamp(12px, 3vw, 24px) 24px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: '12px',
            }}
          >
            <div style={{ minWidth: 0 }}>
              {filterProject && (
                <button
                  type="button"
                  onClick={() => router.push(`/org/${orgId}/projects`)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    marginBottom: 6,
                    padding: 0,
                    border: 'none',
                    background: 'none',
                    fontSize: 12,
                    color: '#6b7280',
                    cursor: 'pointer',
                  }}
                >
                  ← Back to Projects
                </button>
              )}
              <h1
                style={{
                  fontSize: '20px',
                  fontWeight: 600,
                  marginBottom: '2px',
                  color: '#111827',
                }}
              >
                {title}
              </h1>
              <p
                style={{
                  fontSize: '12px',
                  color: '#6b7280',
                }}
              >
                {subtitle}
              </p>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
                justifyContent: 'flex-end',
                width: '100%',
              }}
            >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#ffffff',
                  fontSize: 11,
                  boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
                  minWidth: 150,
                }}
              >
                <span style={{ color: '#6b7280' }}>Project</span>
                <select
                  value={filterProjectId ?? ''}
                  onChange={(e) => setProjectFilterAndUrl(e.target.value || undefined)}
                  style={{
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    fontSize: 11,
                    color: '#111827',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">All</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#ffffff',
                  fontSize: 11,
                  boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
                  minWidth: 150,
                }}
              >
                <span style={{ color: '#6b7280' }}>Assignee</span>
                <select
                  value={filterAssigneeId ?? ''}
                  onChange={(e) => setAssigneeFilterAndUrl(e.target.value || undefined)}
                  style={{
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    fontSize: 11,
                    color: '#111827',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">All</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName || m.email || 'Unknown user'}
                    </option>
                  ))}
                </select>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#ffffff',
                  fontSize: 11,
                  boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
                  minWidth: 145,
                }}
              >
                <span style={{ color: '#6b7280' }}>Status</span>
                <select
                  value={filterStatus ?? ''}
                  onChange={(e) => setStatusFilterAndUrl(e.target.value || undefined)}
                  style={{
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    fontSize: 11,
                    color: '#111827',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">All</option>
                  {(() => {
                    const baseOptions: string[] = filterProjectId
                      ? projectSectionsOrdered.map((s) => s.name)
                      : (GLOBAL_SECTIONS as unknown as string[]);

                    // Preserve current selection even if it was renamed/deleted.
                    const options =
                      filterProjectId &&
                      filterStatus &&
                      !baseOptions.includes(filterStatus)
                        ? [...baseOptions, filterStatus]
                        : baseOptions;

                    return options.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ));
                  })()}
                </select>
              </div>
              {(filterProjectId || filterAssigneeId || filterStatus) && (
                <button
                  type="button"
                  onClick={clearFiltersAndUrl}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    fontSize: 11,
                    color: '#6b7280',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* View toggle */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                borderRadius: 14,
                border: '1px solid #e5e7eb',
                backgroundColor: '#f9fafb',
                padding: 3,
                boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
              }}
            >
              <button
                onClick={() => setViewAndUrl('board')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 30,
                  height: 30,
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  backgroundColor: view === 'board' ? '#ffffff' : 'transparent',
                  color: '#111827',
                  boxShadow:
                    view === 'board'
                      ? '0 1px 3px rgba(15,23,42,0.18)'
                      : 'none',
                }}
              >
                <svg
                  width={16}
                  height={16}
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect x="3" y="3" width="4" height="4" rx="1" fill="#0f172a" />
                  <rect x="9" y="3" width="4" height="4" rx="1" fill="#0f172a" />
                  <rect x="3" y="9" width="4" height="4" rx="1" fill="#0f172a" />
                  <rect x="9" y="9" width="4" height="4" rx="1" fill="#0f172a" />
                </svg>
              </button>
              <button
                onClick={() => setViewAndUrl('list')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 30,
                  height: 30,
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  marginLeft: 3,
                  backgroundColor: view === 'list' ? '#ffffff' : 'transparent',
                  color: view === 'list' ? '#111827' : '#6b7280',
                  boxShadow:
                    view === 'list'
                      ? '0 1px 3px rgba(15,23,42,0.18)'
                      : 'none',
                }}
              >
                <svg
                  width={16}
                  height={16}
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect
                    x="3"
                    y="4"
                    width="10"
                    height="1.4"
                    rx="0.7"
                    fill={view === 'list' ? '#111827' : '#6b7280'}
                  />
                  <rect
                    x="3"
                    y="7.8"
                    width="10"
                    height="1.4"
                    rx="0.7"
                    fill={view === 'list' ? '#111827' : '#6b7280'}
                  />
                  <rect
                    x="3"
                    y="11.6"
                    width="7"
                    height="1.4"
                    rx="0.7"
                    fill={view === 'list' ? '#111827' : '#6b7280'}
                  />
                </svg>
              </button>
            </div>

            {/* Divider */}
            <div
              style={{
                width: 1,
                height: 30,
                marginLeft: 2,
                marginRight: 2,
                backgroundColor: '#e5e7eb',
              }}
            />

            {/* Add Task button — creates task then opens normal drawer */}
            <PrimaryActionButton label="Add Task" onClick={handleAddTask} />
            </div>
          </div>

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

          {view === 'list' ? (
            <TasksListView tasks={filteredTasks} onRowClick={setActiveTask} />
          ) : (
            <DndContext onDragEnd={handleDragEnd}>
              <TasksBoardView
                columns={
                  filterProjectId
                    ? projectSectionsOrdered.map((s) => s.name)
                    : (GLOBAL_SECTIONS as unknown as string[])
                }
                tasksBySection={
                  (filterProjectId
                    ? filteredTasksByProjectSection
                    : filteredTasksByGlobalSection) as Record<
                    string,
                    WorkspaceTask[]
                  >
                }
                onCardClick={setActiveTask}
                onAddTaskForColumn={(column) => void handleAddTask(column)}
              />
            </DndContext>
          )}
        </div>
      </div>

      {activeTask && (
        <TaskDrawer
          key={activeTask.id}
          orgId={orgId}
          task={activeTask}
          parentTaskTitle={
            taskStackRef.current.length > 0
              ? taskStackRef.current[0].title
              : undefined
          }
          onClose={() => {
            taskStackRef.current = [];
            setActiveTask(null);
          }}
          onUpdated={handleTaskUpdated}
          onDeleted={async () => {
            await loadTasks();
          }}
          onOpenTask={(t) => {
            taskStackRef.current = [activeTask, ...taskStackRef.current];
            setActiveTask({
              ...t,
              projectName: (t as WorkspaceTask).projectName ?? '',
              sectionName: (t as WorkspaceTask).sectionName ?? '',
            } as WorkspaceTask);
          }}
          onBackToParent={() => {
            const prev = taskStackRef.current.shift();
            if (prev) setActiveTask(prev);
          }}
        />
      )}

      {showProjectPickForCreate && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15,23,42,0.28)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 80,
            padding: 16,
          }}
          onClick={() => {
            setShowProjectPickForCreate(false);
            setPendingCreateColumn(null);
            setCreateProjectId('');
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 420,
              borderRadius: 16,
              border: '1px solid #e5e7eb',
              backgroundColor: '#ffffff',
              boxShadow: '0 20px 50px rgba(15,23,42,0.18)',
              padding: 18,
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 600,
                color: '#111827',
              }}
            >
              Choose Project
            </h3>
            <p
              style={{
                marginTop: 6,
                marginBottom: 12,
                fontSize: 12,
                color: '#6b7280',
              }}
            >
              Select the project/client this task belongs to.
            </p>
            <div style={{ marginBottom: 14 }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#6b7280',
                }}
              >
                Project
              </label>
              <select
                value={createProjectId}
                onChange={(e) => setCreateProjectId(e.target.value)}
                style={{
                  width: '100%',
                  height: 38,
                  borderRadius: 10,
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#fff',
                  padding: '0 10px',
                  fontSize: 13,
                  color: '#111827',
                  outline: 'none',
                }}
              >
                <option value="">Select a project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setShowProjectPickForCreate(false);
                  setPendingCreateColumn(null);
                  setCreateProjectId('');
                }}
                style={{
                  borderRadius: 10,
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#fff',
                  color: '#374151',
                  fontSize: 12,
                  fontWeight: 600,
                  minHeight: 36,
                  padding: '8px 12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!createProjectId}
                onClick={async () => {
                  if (!createProjectId) return;
                  const col = pendingCreateColumn;
                  setShowProjectPickForCreate(false);
                  setPendingCreateColumn(null);
                  setCreateProjectId('');
                  await createTaskInProject(createProjectId, col);
                }}
                style={{
                  borderRadius: 10,
                  border: 'none',
                  backgroundColor: createProjectId ? '#0f172a' : '#cbd5e1',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  minHeight: 36,
                  padding: '8px 12px',
                  cursor: createProjectId ? 'pointer' : 'not-allowed',
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}

function TasksListView({
  tasks,
  onRowClick,
}: {
  tasks: WorkspaceTask[];
  onRowClick: (task: WorkspaceTask) => void;
}) {
  const today = startOfToday();

  const completedCount = tasks.filter(
    (t) => (t.sectionName ?? t.sectionId ?? '') === 'Done',
  ).length;
  const todoCount = tasks.length - completedCount;
  const dueTodayCount = tasks.filter((t) => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    return isSameDay(d, today);
  }).length;

  return (
    <div style={{ marginTop: 12 }}>
      {/* Summary cards row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 16,
          marginBottom: 18,
        }}
      >
        {[
          {
            label: 'TO DO',
            value: todoCount,
            color: '#3b82f6',
            icon: Clock3,
          },
          {
            label: 'DUE TODAY',
            value: dueTodayCount,
            color: '#f97316',
            icon: CalendarDays,
          },
          {
            label: 'COMPLETED',
            value: completedCount,
            color: '#22c55e',
            icon: CheckCircle2,
          },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              borderRadius: 16,
              border: '1px solid #e5e7eb',
              backgroundColor: '#ffffff',
              boxShadow: '0 10px 30px rgba(15,23,42,0.06)',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 12,
                  backgroundColor: `${card.color}14`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <card.icon
                  size={16}
                  strokeWidth={2}
                  color={card.color}
                />
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: '#6b7280',
                }}
              >
                {card.label}
              </span>
            </div>
            <span
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: '#111827',
              }}
            >
              {card.value}
            </span>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div
        style={{
          borderRadius: 18,
          border: '1px solid #e5e7eb',
          backgroundColor: '#ffffff',
          boxShadow: '0 18px 40px rgba(15,23,42,0.06)',
          overflow: 'hidden',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            minWidth: 760,
            borderCollapse: 'separate',
            borderSpacing: 0,
          }}
        >
          <thead>
            <tr>
              <th style={thStyle}>TASK NAME</th>
              <th style={thStyle}>PROJECT</th>
              <th style={thStyle}>STATUS</th>
              <th style={thStyle}>PRIORITY</th>
              <th style={thStyle}>ASSIGNEES</th>
            </tr>
          </thead>
          <tbody>
            {renderNestedTaskRows(tasks, onRowClick)}

            {tasks.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: '12px 16px',
                    textAlign: 'center',
                    color: '#6b7280',
                    fontSize: 12,
                  }}
                >
                  No tasks yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

function TasksBoardView({
  columns,
  tasksBySection,
  onCardClick,
  onAddTaskForColumn,
}: {
  columns: string[];
  tasksBySection: Record<string, WorkspaceTask[]>;
  onCardClick: (task: WorkspaceTask) => void;
  onAddTaskForColumn: (column: string) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '20px',
        alignItems: 'flex-start',
        paddingTop: '4px',
        overflowX: 'auto',
        paddingBottom: '8px',
      }}
    >
      {columns.map((col) => (
        <TasksBoardColumn
          key={col}
          id={col}
          title={col}
          tasks={tasksBySection[col]}
          onCardClick={onCardClick}
          onAddTask={() => onAddTaskForColumn(col)}
        />
      ))}
    </div>
  );
}

function TasksBoardColumn({
  id,
  title,
  tasks,
  onCardClick,
  onAddTask,
}: {
  id: string;
  title: string;
  tasks: WorkspaceTask[];
  onCardClick: (task: WorkspaceTask) => void;
  onAddTask: () => void;
}) {
  const { setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        flex: '0 0 min(280px, 82vw)',
        borderRadius: '16px',
        backgroundColor: '#f9fafb',
        padding: '14px 12px 12px',
        minHeight: '280px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className={`h-1.5 w-1.5 rounded-full ${getStatusDotClass(title)}`} />
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#6b7280',
            }}
          >
            {title}
          </span>
          <span
            style={{
              marginLeft: 4,
              fontSize: '10px',
              color: '#9ca3af',
            }}
          >
            {tasks.length}
          </span>
        </div>
        <button
          type="button"
          style={{
            border: 'none',
            background: 'transparent',
            fontSize: '16px',
            color: '#9ca3af',
            cursor: 'default',
          }}
        >
          ···
        </button>
      </div>
      {tasks.length === 0 ? (
        <button
          type="button"
          onClick={onAddTask}
          style={{
            width: '100%',
            marginTop: 6,
            padding: '12px 10px',
            borderRadius: '14px',
            border: '1px dashed #d1d5db',
            backgroundColor: '#f9fafb',
            fontSize: '11px',
            color: '#6b7280',
            cursor: 'pointer',
          }}
        >
          + Add Task
        </button>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            fontSize: '13px',
            color: '#111',
          }}
        >
          {tasks.map((task) => (
            <TasksBoardCard
              key={task.id}
              task={task}
              onClick={() => onCardClick(task)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Badge helpers – colors match TaskDrawer dropdowns exactly ── */

const PRIORITY_CLASSES: Record<string, string> = {
  LOW: 'bg-sky-50 text-sky-600',
  MEDIUM: 'bg-amber-50 text-amber-700',
  HIGH: 'bg-emerald-50 text-emerald-700',
  URGENT: 'bg-rose-50 text-rose-600',
};

function PriorityBadge({ priority }: { priority: string }) {
  const cls = PRIORITY_CLASSES[priority] ?? PRIORITY_CLASSES.MEDIUM;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${cls}`}
    >
      {priority}
    </span>
  );
}

function getStatusDotClass(name: string | undefined) {
  const n = (name || '').toLowerCase();
  if (n.includes('backlog')) return 'bg-slate-400';
  if (n.includes('todo') || n === 'to do') return 'bg-sky-500';
  if (n.includes('progress')) return 'bg-amber-400';
  if (n.includes('review')) return 'bg-purple-500';
  if (n.includes('done')) return 'bg-emerald-500';
  return 'bg-slate-300';
}

function StatusBadge({ name }: { name: string }) {
  const dot = getStatusDotClass(name);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {name}
    </span>
  );
}

function TasksBoardCard({
  task,
  onClick,
}: {
  task: WorkspaceTask;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: task.id,
  });

  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const didDragRef = useRef(false);
  const DRAG_THRESHOLD_PX = 6;

  const style: React.CSSProperties = {
    borderRadius: '16px',
    border: '1px solid #e5e7eb',
    padding: '10px 11px',
    marginBottom: '8px',
    backgroundColor: '#ffffff',
    boxShadow: '0 10px 25px rgba(15,23,42,0.06)',
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
  };

  const handlePointerDown: React.PointerEventHandler<HTMLLIElement> = (event) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    didDragRef.current = false;
    listeners?.onPointerDown?.(event);
  };

  const handlePointerMove: React.PointerEventHandler<HTMLLIElement> = (event) => {
    if (pointerStartRef.current && !didDragRef.current) {
      const dx = event.clientX - pointerStartRef.current.x;
      const dy = event.clientY - pointerStartRef.current.y;
      if (
        Math.abs(dx) > DRAG_THRESHOLD_PX ||
        Math.abs(dy) > DRAG_THRESHOLD_PX
      ) {
        didDragRef.current = true;
      }
    }
    listeners?.onPointerMove?.(event);
  };

  const handlePointerUp: React.PointerEventHandler<HTMLLIElement> = (event) => {
    listeners?.onPointerUp?.(event);

    const wasDrag = didDragRef.current;
    pointerStartRef.current = null;
    didDragRef.current = false;

    if (!wasDrag) {
      onClick();
    }
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {(task.projectName || task.project?.name) && (
        <div
          style={{
            fontSize: '11px',
            color: '#6b7280',
            marginBottom: 4,
            overflowWrap: 'anywhere',
          }}
        >
          {task.projectName || task.project?.name}
        </div>
      )}
      <div style={{ cursor: 'pointer', color: '#111827', marginBottom: 4 }}>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 600,
            lineHeight: 1.3,
            overflowWrap: 'anywhere',
          }}
        >
          {task.parentId ? '↳ ' : ''}
          {task.title}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 6,
          fontSize: '10px',
          color: '#9ca3af',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {task.priority && <PriorityBadge priority={task.priority} />}
        </div>
        {(task.assignees?.length ?? 0) > 0 && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {task.assignees.slice(0, 3).map((a, i) => {
              return (
                <UserAvatar
                  key={a.id}
                  avatarUrl={a.avatarUrl}
                  displayName={a.displayName}
                  email={a.email}
                  size={20}
                  title={a.displayName ?? a.email ?? ''}
                  style={{
                    backgroundColor: '#e5e7eb',
                    marginLeft: i > 0 ? -4 : 0,
                    border: '1.5px solid #fff',
                  }}
                  fallbackTextClassName="text-[9px] font-semibold text-slate-500"
                />
              );
            })}
          </div>
        )}
      </div>
    </li>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 16px',
  borderBottom: '1px solid #e5e7eb',
  color: '#6b7280',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 16px',
  borderBottom: '1px solid #f3f4f6',
  color: '#111827',
  fontSize: 13,
  backgroundColor: '#ffffff',
};

// Shared helper to render nested parent/subtask rows in list view.
// This encapsulates the grouping + indentation logic so TasksListView
// stays simple and behavior remains consistent across Tasks and My Tasks.
function renderNestedTaskRows(
  tasks: WorkspaceTask[],
  onRowClick: (task: WorkspaceTask) => void,
) {
  // Group tasks by parent/child for nested display, similar to project page list view
  const topLevelTasks = tasks.filter((t) => !t.parentId);

  const subtasksByParent: Record<string, WorkspaceTask[]> = {};
  tasks.forEach((t) => {
    if (t.parentId) {
      if (!subtasksByParent[t.parentId]) {
        subtasksByParent[t.parentId] = [];
      }
      subtasksByParent[t.parentId].push(t);
    }
  });

  const renderSubtaskHint = (task: WorkspaceTask) =>
    task.parentId ? (
      <div
        style={{
          marginTop: 2,
          fontSize: 11,
          color: '#9ca3af',
        }}
      >
        Subtask
      </div>
    ) : null;

  const renderRowWithHint = (task: WorkspaceTask, isSubtask: boolean) => (
    <tr key={task.id} onClick={() => onRowClick(task)} style={{ cursor: 'pointer' }}>
      <td
        style={{
          ...tdStyle,
          paddingLeft: isSubtask ? 32 : (tdStyle.padding as number | undefined),
          fontSize: isSubtask ? 12 : tdStyle.fontSize,
        }}
      >
        <div>
          <div
            style={{
              fontWeight: isSubtask ? 500 : 600,
              fontSize: isSubtask ? 12 : 13,
              color: isSubtask ? '#4b5563' : '#111827',
            }}
          >
            {task.title}
          </div>
          {renderSubtaskHint(task)}
        </div>
      </td>
      <td style={tdStyle}>
        {task.projectName || task.project?.name ? (
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            {task.projectName || task.project?.name}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: '#9ca3af' }}>—</span>
        )}
      </td>
      <td style={tdStyle}>
        {task.sectionName ? (
          <StatusBadge name={task.sectionName} />
        ) : (
          <span style={{ fontSize: 11, color: '#9ca3af' }}>—</span>
        )}
      </td>
      <td style={tdStyle}>
        {task.priority ? (
          <PriorityBadge priority={task.priority} />
        ) : (
          <span style={{ fontSize: 11, color: '#9ca3af' }}>—</span>
        )}
      </td>
      <td style={tdStyle}>
        {(task.assignees?.length ?? 0) > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {task.assignees.slice(0, 3).map((a) => {
              return (
                <UserAvatar
                  key={a.id}
                  avatarUrl={a.avatarUrl}
                  displayName={a.displayName}
                  email={a.email}
                  size={24}
                  title={a.displayName ?? a.email ?? ''}
                  style={{ backgroundColor: '#e5e7eb' }}
                  fallbackTextClassName="text-[10px] font-semibold text-slate-500"
                />
              );
            })}
            {task.assignees.length > 3 && (
              <span style={{ fontSize: 11, color: '#9ca3af' }}>
                +{task.assignees.length - 3}
              </span>
            )}
          </div>
        ) : (
          '—'
        )}
      </td>
    </tr>
  );

  return topLevelTasks.map((task) => (
    <React.Fragment key={task.id}>
      {renderRowWithHint(task, false)}
      {(subtasksByParent[task.id] ?? []).map((st) =>
        renderRowWithHint(st, true),
      )}
    </React.Fragment>
  ));
}

