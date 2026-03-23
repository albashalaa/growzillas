'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { DndContext, DragEndEvent, useDroppable, useDraggable } from '@dnd-kit/core';
import { useAuth } from '../../../../../contexts/AuthContext';
import { apiFetch } from '../../../../../lib/api';
import { mapOrgMember } from '../../../../../lib/map-org-member';
import { TaskDrawer, type TaskDrawerTask } from '../../../../../components/tasks/TaskDrawer';

interface Project {
  id: string;
  name: string;
  description?: string;
}

interface ProjectSection {
  id: string;
  name: string;
  order: number;
}

interface TaskAssignee {
  id: string;
  email: string;
}

interface OrgMember {
  id: string;
  email: string | null;
}

interface Task {
  id: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  projectId: string;
  sectionId: string;
  parentId?: string | null;
  section?: {
    id: string;
    name: string;
    order?: number;
  } | null;
  assignees: TaskAssignee[];
  createdAt: string;
  updatedAt: string;
}

interface Story {
  id: string;
  type: 'COMMENT' | 'ACTIVITY';
  body?: string | null;
  metadata?: any | null;
  createdAt: string;
  createdBy?: {
    id: string;
    email: string;
  } | null;
}

const FALLBACK_SECTIONS: ProjectSection[] = [
  { id: 'backlog', name: 'Backlog', order: 0 },
  { id: 'in-progress', name: 'In Progress', order: 1 },
  { id: 'review', name: 'Review', order: 2 },
  { id: 'done', name: 'Done', order: 3 },
];

type FilterDue = 'all' | 'overdue' | 'today' | 'next7' | 'noDue';

function filterTasks(
  tasks: Task[],
  filterAssigneeUserId: string | 'all',
  filterDue: FilterDue,
): Task[] {
  return tasks.filter((task) => {
    if (filterAssigneeUserId !== 'all') {
      const hasAssignee = task.assignees?.some(
        (a) => a.id === filterAssigneeUserId,
      );
      if (!hasAssignee) return false;
    }

    if (filterDue === 'all') return true;

    const due = task.dueDate ? new Date(task.dueDate) : null;
    if (filterDue === 'noDue') return due == null;

    if (!due) return false;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const endOfNext7 = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);

    switch (filterDue) {
      case 'overdue':
        return due.getTime() < startOfToday.getTime();
      case 'today':
        return due.getTime() >= startOfToday.getTime() && due.getTime() <= endOfToday.getTime();
      case 'next7':
        return due.getTime() >= startOfToday.getTime() && due.getTime() <= endOfNext7.getTime();
      default:
        return true;
    }
  });
}

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();

  const orgId = params.orgId as string;
  const projectId = params.projectId as string;

  const [project, setProject] = useState<Project | null>(null);
  const [sections, setSections] = useState<ProjectSection[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);

  const [tab, setTab] = useState<'board' | 'list'>('board');
  const [error, setError] = useState('');
  const [tasksError, setTasksError] = useState('');
  const [loadingData, setLoadingData] = useState(true);

  // Inline create state
  const [newTitle, setNewTitle] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);

  // Modal state; stack used when opening a subtask from the drawer so we can go "Back to parent"
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const taskStackRef = useRef<Task[]>([]);

  // Filters
  const [filterAssigneeUserId, setFilterAssigneeUserId] = useState<string | 'all'>('all');
  const [filterDue, setFilterDue] = useState<FilterDue>('all');

  const filteredTasks = useMemo(
    () => filterTasks(tasks, filterAssigneeUserId, filterDue),
    [tasks, filterAssigneeUserId, filterDue],
  );

  // Derive current view from search param
  useEffect(() => {
    const view = searchParams.get('view');
    if (view === 'list' || view === 'board') {
      setTab(view);
    }
  }, [searchParams]);

  // Redirect if no auth
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const effectiveSections: ProjectSection[] =
    sections && sections.length > 0
      ? [...sections].sort((a, b) => a.order - b.order)
      : FALLBACK_SECTIONS;

  const reloadTasks = async () => {
    try {
      const data = await apiFetch(`/tasks?projectId=${projectId}`, {
        headers: { 'x-org-id': orgId },
      });
      setTasks(data as Task[]);
      setTasksError('');
    } catch (err: any) {
      setTasksError(err.message || 'Failed to load tasks');
    }
  };

  // Initial load
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [projectData, sectionsData, tasksData, membersData] =
          await Promise.all([
            apiFetch(`/projects/${projectId}`, {
              headers: { 'x-org-id': orgId },
            }),
            apiFetch(`/projects/${projectId}/sections`, {
              headers: { 'x-org-id': orgId },
            }),
            apiFetch(`/tasks?projectId=${projectId}`, {
              headers: { 'x-org-id': orgId },
            }),
            apiFetch(`/orgs/${orgId}/members`),
          ]);

        setProject(projectData as Project);
        setSections(sectionsData as ProjectSection[]);
        setTasks(tasksData as Task[]);
        setMembers((membersData as any[]).map((m) => mapOrgMember(m)));

        const initialTaskId = searchParams.get('taskId');
        if (initialTaskId) {
          const initialTask = (tasksData as Task[]).find(
            (t) => t.id === initialTaskId,
          );
          if (initialTask) {
            openTaskModal(initialTask);
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load project');
      } finally {
        setLoadingData(false);
      }
    };

    if (user) {
      void fetchData();
    }
  }, [user, projectId, orgId, searchParams]);

  const openTaskModal = (task: Task) => {
    setActiveTask(task);
  };

  const closeTaskModal = () => {
    taskStackRef.current = [];
    setActiveTask(null);
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreatingTask(true);
    try {
      await apiFetch('/tasks', {
        method: 'POST',
        headers: { 'x-org-id': orgId },
        body: JSON.stringify({
          projectId,
          title: newTitle.trim(),
          dueDate: newDueDate || undefined,
          assigneeUserId: newAssigneeId || undefined,
        }),
      });
      setNewTitle('');
      setNewDueDate('');
      setNewAssigneeId('');
      await reloadTasks();
    } catch (err: any) {
      alert(err.message || 'Failed to create task');
    } finally {
      setCreatingTask(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const confirmed = window.confirm('Delete this task?');
    if (!confirmed) return;
    try {
      await apiFetch(`/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { 'x-org-id': orgId },
      });
      await reloadTasks();
    } catch (err: any) {
      alert(err.message || 'Failed to delete task');
    }
  };

  const handleModalDelete = async () => {
    if (!activeTask) return;
    await handleDeleteTask(activeTask.id);
    closeTaskModal();
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const taskId = event.active.id as string;
    const overSectionId = event.over?.id as string | undefined;
    if (!taskId || !overSectionId) return;

    try {
      await apiFetch(`/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'x-org-id': orgId },
        body: JSON.stringify({ sectionId: overSectionId }),
      });
      await reloadTasks();
    } catch (err: any) {
      alert(err.message || 'Failed to move task');
    }
  };

  const handleEditProjectMeta = async () => {
    if (!project) return;
    const name = window.prompt('Project name', project.name);
    if (name === null) return;
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const description = window.prompt(
      'Project description (optional)',
      project.description ?? '',
    );
    if (description === null) return;

    try {
      const updated = await apiFetch(`/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'x-org-id': orgId },
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim() || undefined,
        }),
      });
      setProject(updated as Project);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to update project');
    }
  };

  const handleDeleteProject = async () => {
    if (!project) return;
    const confirmed = window.confirm(
      `Delete project "${project.name}"? This will archive it.`,
    );
    if (!confirmed) return;

    try {
      await apiFetch(`/projects/${projectId}`, {
        method: 'DELETE',
        headers: { 'x-org-id': orgId },
      });
      router.push(`/org/${orgId}/projects`);
    } catch (err: any) {
      setError(err.message || 'Failed to delete project');
    }
  };

  if (loading || loadingData) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fff',
          color: '#000',
        }}
      >
        Loading project...
      </div>
    );
  }

  if (!user) return null;

  const effectiveTasksBySection = (sectionId: string) =>
    filteredTasks.filter((t) => t.sectionId === sectionId || t.section?.id === sectionId);

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
          padding: '20px clamp(12px, 3vw, 20px)',
          overflowX: 'hidden',
        }}
      >
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <button
            onClick={() => router.push(`/org/${orgId}/projects`)}
            style={{
              marginBottom: '16px',
              padding: '6px 12px',
              backgroundColor: '#fff',
              color: '#000',
              border: '1px solid #000',
              cursor: 'pointer',
            }}
          >
            ← Back to projects
          </button>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: 10,
              marginBottom: '20px',
            }}
          >
            <div>
              <h1 style={{ fontSize: '24px', marginBottom: '4px', color: '#000' }}>
                {project?.name || 'Project'}
              </h1>
              {project?.description && (
                <p style={{ margin: 0, fontSize: '14px', color: '#555' }}>
                  {project.description}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={handleEditProjectMeta}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #000',
                  backgroundColor: '#fff',
                  color: '#000',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                Edit project
              </button>
              <button
                onClick={handleDeleteProject}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #000',
                  backgroundColor: '#000',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                Delete project
              </button>
            </div>
          </div>

          {error && (
            <div
              style={{
                padding: '10px',
                border: '1px solid #000',
                marginBottom: '15px',
                color: '#000',
              }}
            >
              {error}
            </div>
          )}

          {/* Filters */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '16px',
            }}
          >
            <span style={{ fontSize: '13px', color: '#000', marginRight: '4px' }}>
              Filters
            </span>
            <select
              value={filterAssigneeUserId}
              onChange={(e) => setFilterAssigneeUserId(e.target.value)}
              style={{
                padding: '6px 8px',
                border: '1px solid #000',
                fontSize: '13px',
                color: '#111',
                backgroundColor: '#fff',
              }}
            >
              <option value="all">All assignees</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.email}
                </option>
              ))}
            </select>
            <select
              value={filterDue}
              onChange={(e) => setFilterDue(e.target.value as FilterDue)}
              style={{
                padding: '6px 8px',
                border: '1px solid #000',
                fontSize: '13px',
                color: '#111',
                backgroundColor: '#fff',
              }}
            >
              <option value="all">All due dates</option>
              <option value="overdue">Overdue</option>
              <option value="today">Today</option>
              <option value="next7">Next 7 days</option>
              <option value="noDue">No due date</option>
            </select>
          </div>

          <div
            style={{
              display: 'inline-flex',
              border: '1px solid #000',
              marginBottom: '20px',
              maxWidth: '100%',
              overflowX: 'auto',
            }}
          >
            <button
              onClick={() =>
                router.push(`/org/${orgId}/projects/${projectId}?view=board`)
              }
              style={{
                padding: '8px 16px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: tab === 'board' ? '#000' : '#fff',
                color: tab === 'board' ? '#fff' : '#000',
              }}
            >
              Board
            </button>
            <button
              onClick={() =>
                router.push(`/org/${orgId}/projects/${projectId}?view=list`)
              }
              style={{
                padding: '8px 16px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: tab === 'list' ? '#000' : '#fff',
                color: tab === 'list' ? '#fff' : '#000',
                borderLeft: '1px solid #000',
              }}
            >
              List
            </button>
          </div>

          {tab === 'board' ? (
            <DndContext onDragEnd={handleDragEnd}>
              <div
                style={{
                  display: 'flex',
                  gap: '16px',
                  overflowX: 'auto',
                  paddingBottom: 8,
                }}
              >
                {effectiveSections.map((section) => (
                  <DroppableColumn
                    key={section.id}
                    section={section}
                    tasks={effectiveTasksBySection(section.id)}
                    onCardClick={openTaskModal}
                    onDelete={handleDeleteTask}
                  />
                ))}
              </div>
            </DndContext>
          ) : (
            <ListView
              sections={effectiveSections}
              tasks={filteredTasks}
              members={members}
              newTitle={newTitle}
              newDueDate={newDueDate}
              newAssigneeId={newAssigneeId}
              creating={creatingTask}
              onCreate={handleAddTask}
              setNewTitle={setNewTitle}
              setNewDueDate={setNewDueDate}
              setNewAssigneeId={setNewAssigneeId}
              onRowClick={openTaskModal}
              onChangeSection={async (taskId, sectionId) => {
                await apiFetch(`/tasks/${taskId}`, {
                  method: 'PATCH',
                  headers: { 'x-org-id': orgId },
                  body: JSON.stringify({ sectionId }),
                });
                await reloadTasks();
              }}
              onChangeDueDate={async (taskId, value) => {
                await apiFetch(`/tasks/${taskId}`, {
                  method: 'PATCH',
                  headers: { 'x-org-id': orgId },
                  body: JSON.stringify({ dueDate: value || '' }),
                });
                await reloadTasks();
              }}
              onDelete={handleDeleteTask}
              tasksError={tasksError}
            />
          )}
        </div>
      </div>

      {activeTask && (
        <TaskDrawer
          orgId={orgId}
          task={activeTask}
          onClose={closeTaskModal}
          onUpdated={async (updated) => {
            await reloadTasks();
            setActiveTask((prev) =>
              prev && prev.id === updated.id ? { ...prev, ...updated } as Task : prev,
            );
          }}
          onDeleted={async () => {
            await reloadTasks();
          }}
          onOpenTask={(t) => {
            taskStackRef.current = [activeTask, ...taskStackRef.current];
            setActiveTask(t as Task);
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

function DroppableColumn({
  section,
  tasks,
  onCardClick,
  onDelete,
}: {
  section: ProjectSection;
  tasks: Task[];
  onCardClick: (task: Task) => void;
  onDelete: (taskId: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id: section.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        border: '1px solid #000',
        padding: '12px',
        minHeight: '150px',
        flex: '0 0 min(260px, 82vw)',
      }}
    >
      <div
        style={{
          fontWeight: 600,
          marginBottom: '8px',
          color: '#000',
        }}
      >
        {section.name}
      </div>
      {tasks.length === 0 ? (
        <div style={{ fontSize: '12px', color: '#555' }}>No tasks yet</div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            fontSize: '13px',
            color: '#000',
          }}
        >
          {tasks.map((task) => (
            <DraggableCard
              key={task.id}
              task={task}
              onClick={() => onCardClick(task)}
              onDelete={() => onDelete(task.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function DraggableCard({
  task,
  onClick,
  onDelete,
}: {
  task: Task;
  onClick: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: task.id,
  });

  const style: React.CSSProperties = {
    border: '1px solid #000',
    padding: '6px 8px',
    marginBottom: '6px',
    backgroundColor: '#fff',
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
  };

  return (
    <li ref={setNodeRef} style={style}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2px',
        }}
      >
        <div
          onClick={onClick}
          style={{
            flex: 1,
            cursor: 'pointer',
          }}
        >
          {task.title}
          {task.parentId && (
            <div style={{ fontSize: '10px', color: '#555' }}>Subtask</div>
          )}
        </div>
        <span
          {...listeners}
          {...attributes}
          style={{
            marginLeft: '6px',
            cursor: 'grab',
            fontSize: '12px',
            color: '#000',
            userSelect: 'none',
          }}
        >
          ::
        </span>
      </div>
      {task.dueDate && (
        <div style={{ fontSize: '11px', color: '#555' }}>
          Due: {new Date(task.dueDate).toLocaleDateString()}
        </div>
      )}
      <button
        type="button"
        onClick={onDelete}
        style={{
          marginTop: '6px',
          minHeight: '34px',
          padding: '6px 10px',
          border: '1px solid #000',
          backgroundColor: '#fff',
          color: '#000',
          fontSize: '11px',
          cursor: 'pointer',
        }}
      >
        Delete
      </button>
    </li>
  );
}

function ListView({
  sections,
  tasks,
  members,
  newTitle,
  newDueDate,
  newAssigneeId,
  creating,
  onCreate,
  setNewTitle,
  setNewDueDate,
  setNewAssigneeId,
  onRowClick,
  onChangeSection,
  onChangeDueDate,
  onDelete,
  tasksError,
}: {
  sections: ProjectSection[];
  tasks: Task[];
  members: OrgMember[];
  newTitle: string;
  newDueDate: string;
  newAssigneeId: string;
  creating: boolean;
  onCreate: (e: React.FormEvent) => void;
  setNewTitle: (v: string) => void;
  setNewDueDate: (v: string) => void;
  setNewAssigneeId: (v: string) => void;
  onRowClick: (task: Task) => void;
  onChangeSection: (taskId: string, sectionId: string) => Promise<void>;
  onChangeDueDate: (taskId: string, value: string) => Promise<void>;
  onDelete: (taskId: string) => void;
  tasksError: string;
}) {
  // Group tasks by parent/child for nested display
  const topLevelTasks = tasks.filter((t) => !t.parentId);

  const subtasksByParent: Record<string, Task[]> = {};
  tasks.forEach((t) => {
    if (t.parentId) {
      if (!subtasksByParent[t.parentId]) {
        subtasksByParent[t.parentId] = [];
      }
      subtasksByParent[t.parentId].push(t);
    }
  });

  const renderRow = (task: Task, isSubtask: boolean) => {
    const dueDateStr = task.dueDate
      ? new Date(task.dueDate).toISOString().slice(0, 10)
      : '';
    return (
      <tr key={task.id}>
        <td
          style={{
            ...tdStyle,
            paddingLeft: isSubtask ? 24 : tdStyle.padding,
            fontSize: isSubtask ? '12px' : tdStyle.fontSize,
          }}
          onClick={() => onRowClick(task)}
        >
          {isSubtask ? '↳ ' : ''}
          {task.title}
        </td>
        <td style={tdStyle}>
          <select
            value={task.sectionId || task.section?.id || ''}
            onChange={(e) => onChangeSection(task.id, e.target.value)}
            style={smallInputStyle}
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </td>
        <td style={tdStyle}>
          <input
            type="date"
            value={dueDateStr}
            onChange={(e) => onChangeDueDate(task.id, e.target.value)}
            style={smallInputStyle}
          />
        </td>
        <td style={tdStyle}>
          <div>
            {task.assignees.length > 0
              ? task.assignees.map((a) => a.email).join(', ')
              : '—'}
          </div>
          <button
            type="button"
            onClick={() => onDelete(task.id)}
            style={{
              marginTop: '6px',
              padding: '4px 8px',
              border: '1px solid #000',
              backgroundColor: '#fff',
              color: '#000',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </td>
      </tr>
    );
  };

  return (
    <div>
      {tasksError && (
        <div
          style={{
            padding: '8px',
            border: '1px solid #000',
            marginBottom: '12px',
            color: '#000',
          }}
        >
          {tasksError}
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          minWidth: '860px',
          borderCollapse: 'collapse',
          border: '1px solid #000',
        }}
      >
        <thead>
          <tr>
            <th style={thStyle}>Title</th>
            <th style={thStyle}>Section</th>
            <th style={thStyle}>Due date</th>
            <th style={thStyle}>Assignees</th>
          </tr>
        </thead>
        <tbody>
          {/* inline create row */}
          <tr>
            <td colSpan={4} style={{ padding: '8px', borderBottom: '1px solid #000' }}>
              <form
                onSubmit={onCreate}
                style={{
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <input
                  type="text"
                  placeholder="Add a task..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  style={inputStyle}
                />
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
                <button
                  type="submit"
                  disabled={creating}
                  style={{
                    minHeight: '34px',
                    padding: '6px 12px',
                    backgroundColor: '#000',
                    color: '#fff',
                    border: 'none',
                    cursor: creating ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                  }}
                >
                  {creating ? 'Adding...' : 'Add'}
                </button>
              </form>
            </td>
          </tr>

          {topLevelTasks.map((task) => (
            <React.Fragment key={task.id}>
              {renderRow(task, false)}
              {(subtasksByParent[task.id] ?? []).map((st) => renderRow(st, true))}
            </React.Fragment>
          ))}

          {tasks.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: '10px', textAlign: 'center', color: '#555' }}>
                No tasks yet. Use the row above to add your first task.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function TaskModal({
  task,
  sections,
  members,
  title,
  dueDate,
  sectionId,
  assigneeId,
  saving,
  setTitle,
  setDueDate,
  setSectionId,
  setAssigneeId,
  onClose,
  onSave,
  onDelete,
  stories,
  storiesLoading,
  onAddComment,
}: {
  task: Task;
  sections: ProjectSection[];
  members: OrgMember[];
  title: string;
  dueDate: string;
  sectionId: string;
  assigneeId: string;
  saving: boolean;
  setTitle: (v: string) => void;
  setDueDate: (v: string) => void;
  setSectionId: (v: string) => void;
  setAssigneeId: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  stories: Story[];
  storiesLoading: boolean;
  onAddComment: (taskId: string, body: string) => Promise<void>;
}) {
  const [commentBody, setCommentBody] = useState('');
  const [posting, setPosting] = useState(false);

  const handlePost = async () => {
    const body = commentBody.trim();
    if (!body) return;
    setPosting(true);
    try {
      await onAddComment(task.id, body);
      setCommentBody('');
    } catch (err: any) {
      alert(err.message || 'Failed to post comment');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.3)',
        display: 'flex',
        justifyContent: 'flex-end',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '320px',
          maxWidth: '100%',
          backgroundColor: '#fff',
          borderLeft: '1px solid #000',
          padding: '16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginBottom: '12px', color: '#000', fontSize: '18px' }}>
          Task details
        </h2>
        <label style={labelStyle}>
          Title
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Due date
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Section
          <select
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            style={inputStyle}
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          Assignee
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            style={inputStyle}
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.email}
              </option>
            ))}
          </select>
        </label>

        {/* Activity */}
        <div style={{ marginTop: '16px' }}>
          <h3 style={{ fontSize: '14px', marginBottom: '8px', color: '#000' }}>
            Activity
          </h3>
          {storiesLoading ? (
            <div style={{ fontSize: '12px', color: '#555' }}>Loading…</div>
          ) : (
            <div
              style={{
                maxHeight: '120px',
                overflowY: 'auto',
                border: '1px solid #000',
                padding: '8px',
                marginBottom: '12px',
              }}
            >
              {stories.filter((s) => s.type === 'ACTIVITY').length === 0 ? (
                <div style={{ fontSize: '12px', color: '#555' }}>
                  No activity yet.
                </div>
              ) : (
                stories
                  .filter((s) => s.type === 'ACTIVITY')
                  .map((s) => (
                    <div
                      key={s.id}
                      style={{
                        fontSize: '12px',
                        color: '#000',
                        marginBottom: '6px',
                      }}
                    >
                      <div>
                        {s.metadata?.action || 'Activity'} ·{' '}
                        {new Date(s.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))
              )}
            </div>
          )}
        </div>

        {/* Comments */}
        <div>
          <h3 style={{ fontSize: '14px', marginBottom: '8px', color: '#000' }}>
            Comments
          </h3>
          <div
            style={{
              maxHeight: '160px',
              overflowY: 'auto',
              border: '1px solid #000',
              padding: '8px',
              marginBottom: '8px',
            }}
          >
            {stories.filter((s) => s.type === 'COMMENT').length === 0 ? (
              <div style={{ fontSize: '12px', color: '#555' }}>
                No comments yet.
              </div>
            ) : (
              stories
                .filter((s) => s.type === 'COMMENT')
                .map((s) => (
                  <div
                    key={s.id}
                    style={{
                      fontSize: '12px',
                      color: '#000',
                      marginBottom: '8px',
                    }}
                  >
                    <div style={{ marginBottom: '2px' }}>
                      <strong>{s.createdBy?.email ?? 'Unknown'}</strong> ·{' '}
                      {new Date(s.createdAt).toLocaleString()}
                    </div>
                    <div>{s.body}</div>
                  </div>
                ))
            )}
          </div>
          <textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Write a comment..."
            style={{
              width: '100%',
              minHeight: '60px',
              padding: '6px 8px',
              border: '1px solid #000',
              backgroundColor: '#fff',
              color: '#000',
              marginBottom: '6px',
            }}
          />
          <button
            type="button"
            onClick={handlePost}
            disabled={posting || !commentBody.trim()}
            style={{
              padding: '6px 12px',
              border: '1px solid #000',
              backgroundColor: posting ? '#666' : '#000',
              color: '#fff',
              cursor: posting || !commentBody.trim() ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              marginBottom: '12px',
            }}
          >
            {posting ? 'Posting…' : 'Post'}
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '16px',
          }}
        >
          <button
            type="button"
            onClick={onDelete}
            style={{
              padding: '6px 12px',
              border: '1px solid #000',
              backgroundColor: '#fff',
              color: '#000',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Delete
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            style={{
              padding: '6px 12px',
              border: '1px solid #000',
              backgroundColor: '#000',
              color: '#fff',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '13px',
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px',
  borderBottom: '1px solid #000',
  color: '#000',
};

const tdStyle: React.CSSProperties = {
  padding: '8px',
  borderBottom: '1px solid #000',
  color: '#000',
  fontSize: '13px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid #000',
  backgroundColor: '#fff',
  color: '#000',
  marginTop: '4px',
};

const smallInputStyle: React.CSSProperties = {
  padding: '6px 8px',
  border: '1px solid #000',
  backgroundColor: '#fff',
  color: '#000',
  minWidth: '140px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '8px',
  fontSize: '13px',
  color: '#000',
};

