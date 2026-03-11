'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { DndContext, DragEndEvent, useDroppable, useDraggable } from '@dnd-kit/core';
import { apiFetch } from '../../lib/api';
import { TaskDrawer, type TaskDrawerTask } from './TaskDrawer';
import { useAuth } from '../../contexts/AuthContext';
import { mapOrgMember } from '../../lib/map-org-member';

type ViewMode = 'board' | 'list';

const GLOBAL_SECTIONS = ['Backlog', 'In Progress', 'Review', 'Done'] as const;
type GlobalSection = (typeof GLOBAL_SECTIONS)[number] | 'Other';

interface WorkspaceTask extends TaskDrawerTask {
  projectName: string;
  sectionName: string;
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
  email: string;
}

export function OrgTasksWorkspace({ mode }: { mode: 'all' | 'mine' }) {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const orgId = params.orgId as string;

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

  const [newTitle, setNewTitle] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState('');
  const [newSectionId, setNewSectionId] = useState('');
  const [creating, setCreating] = useState(false);
  const [initialTaskHandled, setInitialTaskHandled] = useState(false);

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
    if (initialTaskHandled) return;
    const taskIdFromQuery = searchParams.get('taskId');
    if (!taskIdFromQuery || tasks.length === 0) return;
    const found = tasks.find((t) => t.id === taskIdFromQuery);
    if (!found) return;
    setActiveTask(found);
    setInitialTaskHandled(true);
  }, [searchParams, tasks, initialTaskHandled]);

  const basePath = mode === 'mine' ? '/my-tasks' : '/tasks';

  const setViewAndUrl = (next: ViewMode) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set('view', next);
    router.push(`/org/${orgId}${basePath}?${sp.toString()}`);
    setView(next);
  };

  const loadTasks = async () => {
    try {
      if (mode === 'mine') {
        const data = await apiFetch('/tasks/my', {
          headers: { 'x-org-id': orgId },
        });
        setTasks(data as WorkspaceTask[]);
      } else {
        const projectsData = await apiFetch('/projects', {
          headers: { 'x-org-id': orgId },
        });
        const projectsList = projectsData as Project[];
        setProjects(projectsList);

        const tasksArrays = await Promise.all(
          projectsList.map((p) =>
            apiFetch(`/tasks?projectId=${p.id}`, {
              headers: { 'x-org-id': orgId },
            }),
          ),
        );

        const allTasks: WorkspaceTask[] = [];
        for (let i = 0; i < projectsList.length; i++) {
          const project = projectsList[i];
          const list = (tasksArrays[i] ?? []) as Array<{
            id: string;
            title: string;
            dueDate?: string | null;
            projectId: string;
            parentId?: string | null;
            section?: { id: string; name: string } | null;
            assignees: Array<{ id: string; email: string }>;
          }>;
          for (const t of list) {
            allTasks.push({
              id: t.id,
              title: t.title,
              dueDate: t.dueDate ?? null,
              projectId: t.projectId,
              sectionId: t.section?.id ?? '',
              parentId: t.parentId ?? null,
              assignees: t.assignees ?? [],
              projectName: project.name,
              sectionName: t.section?.name ?? '',
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

      if (projectsList.length > 0 && !newProjectId) {
        setNewProjectId(projectsList[0].id);
      }
      if (user && !newAssigneeId && mode === 'mine') {
        setNewAssigneeId(user.id);
      }
    } catch (err: any) {
      setError((prev) => prev || err.message || 'Failed to load metadata');
    }
  };

  useEffect(() => {
    void loadTasks();
    void loadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, mode]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newProjectId) return;
    setCreating(true);
    try {
      await apiFetch('/tasks', {
        method: 'POST',
        headers: { 'x-org-id': orgId },
        body: JSON.stringify({
          projectId: newProjectId,
          title: newTitle.trim(),
          dueDate: newDueDate || undefined,
          assigneeUserId: newAssigneeId || undefined,
          sectionId: newSectionId || undefined,
        }),
      });
      setNewTitle('');
      setNewDueDate('');
      setNewSectionId('');
      setCreating(false);
      await loadTasks();
    } catch (err: any) {
      setCreating(false);
      alert(err.message || 'Failed to create task');
    }
  };

  const handleTaskUpdated = (updated: TaskDrawerTask) => {
    const isAssignedToCurrentUser =
      mode === 'mine' &&
      !!user &&
      (updated.assignees ?? []).some((a) => a.id === user.id);

    setTasks((prev) => {
      if (mode === 'mine' && !isAssignedToCurrentUser) {
        // Task (or subtask) no longer belongs in "My Tasks"
        return prev.filter((t) => t.id !== updated.id);
      }

      const projectSections = sectionsByProject[updated.projectId] ?? [];
      const section = projectSections.find((s) => s.id === updated.sectionId);
      return prev.map((t) =>
        t.id === updated.id
          ? {
              ...t,
              title: updated.title,
              dueDate: updated.dueDate ?? null,
              sectionId: updated.sectionId,
              sectionName: section?.name ?? t.sectionName,
              assignees: updated.assignees ?? t.assignees,
              parentId: updated.parentId ?? t.parentId,
            }
          : t,
      );
    });

    setActiveTask((prev) => {
      if (!prev || prev.id !== updated.id) return prev;

      if (mode === 'mine' && !isAssignedToCurrentUser) {
        // Close drawer if the task disappears from "My Tasks"
        return null;
      }

      const projectSections = sectionsByProject[updated.projectId] ?? [];
      const section = projectSections.find((s) => s.id === updated.sectionId);
      return {
        ...prev,
        title: updated.title,
        dueDate: updated.dueDate ?? null,
        sectionId: updated.sectionId,
        sectionName: section?.name ?? prev.sectionName,
        assignees: updated.assignees ?? prev.assignees,
        parentId: updated.parentId ?? prev.parentId,
      };
    });
  };

  const tasksByGlobalSection = useMemo(() => {
    const result: Record<GlobalSection, WorkspaceTask[]> = {
      Backlog: [],
      'In Progress': [],
      Review: [],
      Done: [],
      Other: [],
    };
    for (const t of tasks) {
      const name = t.sectionName || '';
      const match = GLOBAL_SECTIONS.find((g) => g === name) ?? 'Other';
      result[match].push(t);
    }
    return result;
  }, [tasks]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const taskId = event.active.id as string;
    const columnId = event.over?.id as GlobalSection | undefined;
    if (!taskId || !columnId || columnId === 'Other') return;

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

  const title = mode === 'mine' ? 'My Tasks' : 'Tasks';

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
          backgroundColor: '#fff',
          fontFamily: "'Montserrat', sans-serif",
        }}
      >
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <h1
            style={{
              fontSize: '24px',
              marginBottom: '16px',
              color: '#111',
            }}
          >
            {title}
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
              display: 'inline-flex',
              border: '1px solid #000',
              marginBottom: '20px',
            }}
          >
            <button
              onClick={() => setViewAndUrl('board')}
              style={{
                padding: '8px 16px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: view === 'board' ? '#000' : '#fff',
                color: view === 'board' ? '#fff' : '#111',
              }}
            >
              Board
            </button>
            <button
              onClick={() => setViewAndUrl('list')}
              style={{
                padding: '8px 16px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: view === 'list' ? '#000' : '#fff',
                color: view === 'list' ? '#fff' : '#111',
                borderLeft: '1px solid #000',
              }}
            >
              List
            </button>
          </div>

          <form
            onSubmit={handleCreate}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              alignItems: 'center',
              marginBottom: '20px',
            }}
          >
            <input
              type="text"
              placeholder="Add a task..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              style={inputStyle}
            />
            <select
              value={newProjectId}
              onChange={(e) => {
                setNewProjectId(e.target.value);
                setNewSectionId('');
              }}
              style={smallInputStyle}
            >
              <option value="">Select project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              style={smallInputStyle}
            />
            <select
              value={newAssigneeId}
              onChange={(e) => setNewAssigneeId(e.target.value)}
              style={smallInputStyle}
            >
              <option value="">Assignee (optional)</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.email}
                </option>
              ))}
            </select>
            <select
              value={newSectionId}
              onChange={(e) => setNewSectionId(e.target.value)}
              style={smallInputStyle}
              disabled={!newProjectId}
            >
              <option value="">Section (auto)</option>
              {(sectionsByProject[newProjectId] ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={creating || !newTitle.trim() || !newProjectId}
              style={{
                padding: '6px 12px',
                backgroundColor: '#000',
                color: '#fff',
                border: 'none',
                cursor:
                  creating || !newTitle.trim() || !newProjectId
                    ? 'not-allowed'
                    : 'pointer',
                fontSize: '13px',
              }}
            >
              {creating ? 'Adding...' : 'Add'}
            </button>
          </form>

          {view === 'list' ? (
            <TasksListView tasks={tasks} onRowClick={setActiveTask} />
          ) : (
            <DndContext onDragEnd={handleDragEnd}>
              <TasksBoardView
                tasksBySection={tasksByGlobalSection}
                onCardClick={setActiveTask}
              />
            </DndContext>
          )}
        </div>
      </div>

      {activeTask && (
        <TaskDrawer
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
  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        border: '1px solid #000',
      }}
    >
      <thead>
        <tr>
          <th style={thStyle}>Title</th>
          <th style={thStyle}>Project</th>
          <th style={thStyle}>Section</th>
          <th style={thStyle}>Due date</th>
          <th style={thStyle}>Assignee</th>
        </tr>
      </thead>
      <tbody>
        {renderNestedTaskRows(tasks, onRowClick)}

        {tasks.length === 0 && (
          <tr>
            <td
              colSpan={5}
              style={{
                padding: '10px',
                textAlign: 'center',
                color: '#555',
              }}
            >
              No tasks yet.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function TasksBoardView({
  tasksBySection,
  onCardClick,
}: {
  tasksBySection: Record<GlobalSection, WorkspaceTask[]>;
  onCardClick: (task: WorkspaceTask) => void;
}) {
  const columns: GlobalSection[] = [
    'Backlog',
    'In Progress',
    'Review',
    'Done',
    'Other',
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
        gap: '16px',
      }}
    >
      {columns.map((col) => (
        <TasksBoardColumn
          key={col}
          id={col}
          title={col}
          tasks={tasksBySection[col]}
          onCardClick={onCardClick}
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
}: {
  id: GlobalSection;
  title: string;
  tasks: WorkspaceTask[];
  onCardClick: (task: WorkspaceTask) => void;
}) {
  const { setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        border: '1px solid #000',
        padding: '12px',
        minHeight: '150px',
      }}
    >
      <div
        style={{
          fontWeight: 600,
          marginBottom: '8px',
          color: '#111',
        }}
      >
        {title}
      </div>
      {tasks.length === 0 ? (
        <div style={{ fontSize: '12px', color: '#555' }}>No tasks</div>
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
    border: '1px solid #000',
    padding: '6px 8px',
    marginBottom: '6px',
    backgroundColor: '#fff',
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
  };

  const handlePointerDown: React.PointerEventHandler<HTMLLIElement> = (event) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    didDragRef.current = false;
    listeners.onPointerDown?.(event);
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
    listeners.onPointerMove?.(event);
  };

  const handlePointerUp: React.PointerEventHandler<HTMLLIElement> = (event) => {
    listeners.onPointerUp?.(event);

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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2px',
        }}
      >
        <div style={{ flex: 1, cursor: 'pointer', color: '#111' }}>
          {task.parentId ? '↳ ' : ''}
          {task.title}
          <div style={{ fontSize: '11px', color: '#555', marginTop: 2 }}>
            {task.projectName || task.projectId}
          </div>
        </div>
      </div>
      {task.dueDate && (
        <div style={{ fontSize: '11px', color: '#555' }}>
          Due: {new Date(task.dueDate).toLocaleDateString()}
        </div>
      )}
    </li>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px',
  borderBottom: '1px solid #000',
  color: '#111',
};

const tdStyle: React.CSSProperties = {
  padding: '8px',
  borderBottom: '1px solid #000',
  color: '#111',
  fontSize: '13px',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: '180px',
  padding: '6px 8px',
  border: '1px solid #000',
  fontSize: '13px',
  color: '#111',
};

const smallInputStyle: React.CSSProperties = {
  padding: '6px 8px',
  border: '1px solid #000',
  fontSize: '13px',
  color: '#111',
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

  const renderRow = (task: WorkspaceTask, isSubtask: boolean) => (
    <tr
      key={task.id}
      onClick={() => onRowClick(task)}
      style={{ cursor: 'pointer' }}
    >
      <td
        style={{
          ...tdStyle,
          paddingLeft: isSubtask ? 24 : (tdStyle.padding as number | undefined),
          fontSize: isSubtask ? '12px' : tdStyle.fontSize,
        }}
      >
        {isSubtask ? '↳ ' : ''}
        {task.title}
      </td>
      <td style={tdStyle}>{task.projectName || task.projectId}</td>
      <td style={tdStyle}>{task.sectionName || task.sectionId}</td>
      <td style={tdStyle}>
        {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '—'}
      </td>
      <td style={tdStyle}>
        {(task.assignees?.length ?? 0) > 0
          ? (task.assignees ?? []).map((a) => a.email).join(', ')
          : '—'}
      </td>
    </tr>
  );

  return topLevelTasks.map((task) => (
    <React.Fragment key={task.id}>
      {renderRow(task, false)}
      {(subtasksByParent[task.id] ?? []).map((st) => renderRow(st, true))}
    </React.Fragment>
  ));
}

