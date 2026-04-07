'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { DndContext, DragEndEvent, useDroppable, useDraggable } from '@dnd-kit/core';
import { useAuth } from '../../../../../contexts/AuthContext';
import { apiFetch } from '../../../../../lib/api';
import { mapOrgMember } from '../../../../../lib/map-org-member';
import { TaskDrawer, type TaskDrawerTask } from '../../../../../components/tasks/TaskDrawer';
import { Plus, X } from 'lucide-react';

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
  displayName?: string | null;
  avatarUrl?: string | null;
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
  reviewer?: TaskAssignee | null;
  createdAt: string;
  updatedAt: string;
}

interface AutomationRule {
  id: string;
  name: string;
  description?: string | null;
  triggerType: string;
  conditions?: Array<{
    field: string;
    operator: string;
    value: string | number | boolean | null;
  }>;
  actions?: Array<{
    type: string;
    config: Record<string, string | number | boolean | null>;
  }>;
  isActive: boolean;
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

  const [tab, setTab] = useState<'board' | 'list' | 'automations'>('board');
  const [error, setError] = useState('');
  const [tasksError, setTasksError] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([]);
  const [loadingAutomations, setLoadingAutomations] = useState(false);
  const [automationsError, setAutomationsError] = useState('');
  const [togglingRuleIds, setTogglingRuleIds] = useState<Record<string, boolean>>({});

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
  const isAdmin = user?.role === 'ADMIN';

  // Derive current view from search param
  useEffect(() => {
    const view = searchParams.get('view');
    if (view === 'list' || view === 'board' || view === 'automations') {
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

  const loadAutomationRules = async () => {
    setLoadingAutomations(true);
    try {
      const data = await apiFetch(`/automations?projectId=${projectId}`, {
        headers: { 'x-org-id': orgId },
      });
      setAutomationRules(data as AutomationRule[]);
      setAutomationsError('');
    } catch (err: any) {
      setAutomationsError(err.message || 'Failed to load automations');
    } finally {
      setLoadingAutomations(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    if (tab !== 'automations') return;
    void loadAutomationRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user, orgId, projectId]);

  const handleToggleAutomationRule = async (rule: AutomationRule) => {
    const nextIsActive = !rule.isActive;
    setTogglingRuleIds((prev) => ({ ...prev, [rule.id]: true }));
    setAutomationsError('');
    setAutomationRules((prev) =>
      prev.map((item) =>
        item.id === rule.id ? { ...item, isActive: nextIsActive } : item,
      ),
    );

    try {
      await apiFetch(`/automations/${rule.id}/toggle`, {
        method: 'POST',
        headers: { 'x-org-id': orgId },
        body: JSON.stringify({ isActive: nextIsActive }),
      });
    } catch (err: any) {
      setAutomationRules((prev) =>
        prev.map((item) =>
          item.id === rule.id ? { ...item, isActive: rule.isActive } : item,
        ),
      );
      setAutomationsError(err.message || 'Failed to toggle automation');
    } finally {
      setTogglingRuleIds((prev) => {
        const next = { ...prev };
        delete next[rule.id];
        return next;
      });
    }
  };

  const handleCreateAutomationRule = async (payload: {
    name: string;
    description?: string | null;
    triggerType: string;
    conditions: Array<{ field: string; operator: string; value: string | number | boolean | null }>;
    actions: Array<{ type: string; config: Record<string, string | number | boolean | null> }>;
  }) => {
    const body = {
      ...payload,
      projectId,
    };

    // Let the modal render backend validation errors; reload the list only on success.
    await apiFetch('/automations', {
      method: 'POST',
      headers: { 'x-org-id': orgId },
      body: JSON.stringify(body),
    });

    await loadAutomationRules();
  };

  const handleUpdateAutomationRule = async (
    ruleId: string,
    payload: {
      name: string;
      description?: string | null;
      triggerType: string;
      conditions: Array<{
        field: string;
        operator: string;
        value: string | number | boolean | null;
      }>;
      actions: Array<{
        type: string;
        config: Record<string, string | number | boolean | null>;
      }>;
    },
  ) => {
    await apiFetch(`/automations/${ruleId}`, {
      method: 'PATCH',
      headers: { 'x-org-id': orgId },
      body: JSON.stringify(payload),
    });
    await loadAutomationRules();
  };

  const handleDeleteAutomationRule = async (ruleId: string) => {
    await apiFetch(`/automations/${ruleId}`, {
      method: 'DELETE',
      headers: { 'x-org-id': orgId },
    });
    setAutomationRules((prev) => prev.filter((r) => r.id !== ruleId));
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
      setError(err.message || 'Failed to create task');
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
      setError(err.message || 'Failed to delete task');
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
      setError(err.message || 'Failed to move task');
    }
  };

  const handleEditProjectMeta = () => {
    if (!project) return;
    router.push(`/org/${orgId}/projects?editProjectId=${projectId}`);
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
              marginBottom: '16px',
            }}
          >
            <div style={{ minWidth: 0 }}>
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
              <h1
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  marginBottom: 2,
                  color: '#111827',
                }}
              >
                {project?.name || 'Project'}
              </h1>
              <p
                style={{
                  fontSize: 12,
                  color: '#6b7280',
                  margin: 0,
                }}
              >
                {project?.description || 'Tasks and automations for this project.'}
              </p>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                justifyContent: 'flex-end',
                width: '100%',
              }}
            >
              <button
                type="button"
                onClick={handleEditProjectMeta}
                style={{
                  borderRadius: 999,
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#ffffff',
                  padding: '6px 12px',
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#374151',
                  boxShadow: '0 1px 2px rgba(15,23,42,0.05)',
                  cursor: 'pointer',
                }}
              >
                Edit project
              </button>
              <button
                type="button"
                onClick={handleDeleteProject}
                style={{
                  borderRadius: 999,
                  border: '1px solid #fecaca',
                  backgroundColor: '#fee2e2',
                  padding: '6px 12px',
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#b91c1c',
                  cursor: 'pointer',
                }}
              >
                Delete project
              </button>
            </div>
          </div>

          {error && (
            <div
              style={{
                marginBottom: 12,
                padding: 10,
                borderRadius: 8,
                border: '1px solid #fecaca',
                backgroundColor: '#fef2f2',
                color: '#b91c1c',
                fontSize: 12,
              }}
            >
              {error}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              marginBottom: 16,
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
              {tab !== 'automations' && (
                <>
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
                      value={filterAssigneeUserId}
                      onChange={(e) => setFilterAssigneeUserId(e.target.value)}
                      style={{
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        fontSize: 11,
                        color: '#111827',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="all">All</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.email}
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
                      minWidth: 170,
                    }}
                  >
                    <span style={{ color: '#6b7280' }}>Due</span>
                    <select
                      value={filterDue}
                      onChange={(e) => setFilterDue(e.target.value as FilterDue)}
                      style={{
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        fontSize: 11,
                        color: '#111827',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="all">All dates</option>
                      <option value="overdue">Overdue</option>
                      <option value="today">Today</option>
                      <option value="next7">Next 7 days</option>
                      <option value="noDue">No due date</option>
                    </select>
                  </div>
                </>
              )}
            </div>

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
                type="button"
                onClick={() =>
                  router.push(`/org/${orgId}/projects/${projectId}?view=board`)
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 56,
                  height: 30,
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0 10px',
                  fontSize: 12,
                  fontWeight: 500,
                  backgroundColor: tab === 'board' ? '#ffffff' : 'transparent',
                  color: tab === 'board' ? '#111827' : '#6b7280',
                  boxShadow:
                    tab === 'board' ? '0 1px 3px rgba(15,23,42,0.18)' : 'none',
                }}
              >
                Board
              </button>
              <button
                type="button"
                onClick={() =>
                  router.push(`/org/${orgId}/projects/${projectId}?view=list`)
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 52,
                  height: 30,
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0 10px',
                  fontSize: 12,
                  fontWeight: 500,
                  marginLeft: 3,
                  backgroundColor: tab === 'list' ? '#ffffff' : 'transparent',
                  color: tab === 'list' ? '#111827' : '#6b7280',
                  boxShadow:
                    tab === 'list' ? '0 1px 3px rgba(15,23,42,0.18)' : 'none',
                }}
              >
                List
              </button>
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/org/${orgId}/projects/${projectId}?view=automations`,
                  )
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 96,
                  height: 30,
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0 10px',
                  fontSize: 12,
                  fontWeight: 500,
                  marginLeft: 3,
                  backgroundColor:
                    tab === 'automations' ? '#ffffff' : 'transparent',
                  color: tab === 'automations' ? '#111827' : '#6b7280',
                  boxShadow:
                    tab === 'automations'
                      ? '0 1px 3px rgba(15,23,42,0.18)'
                      : 'none',
                }}
              >
                Automations
              </button>
            </div>
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
          ) : tab === 'list' ? (
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
          ) : (
            <AutomationsListView
              rules={automationRules}
              loading={loadingAutomations}
              error={automationsError}
              isAdmin={isAdmin}
              togglingRuleIds={togglingRuleIds}
              onToggle={handleToggleAutomationRule}
              sections={effectiveSections}
              members={members}
              projectId={projectId}
              projectName={project?.name ?? ''}
              onCreateRule={handleCreateAutomationRule}
              onUpdateRule={handleUpdateAutomationRule}
              onDeleteRule={handleDeleteAutomationRule}
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
      data-testid={`board-column-${section.id}`}
      style={{
        flex: '0 0 min(280px, 82vw)',
        borderRadius: 16,
        backgroundColor: '#f9fafb',
        padding: '14px 12px 12px',
        minHeight: 280,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              height: 6,
              width: 6,
              borderRadius: '999px',
              backgroundColor: '#0ea5e9',
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#6b7280',
            }}
          >
            {section.name}
          </span>
          <span
            style={{
              marginLeft: 4,
              fontSize: 10,
              color: '#9ca3af',
            }}
          >
            {tasks.length}
          </span>
        </div>
      </div>
      {tasks.length === 0 ? (
        <div
          style={{
            marginTop: 6,
            padding: '12px 10px',
            borderRadius: 14,
            border: '1px dashed #d1d5db',
            backgroundColor: '#f9fafb',
            fontSize: 11,
            color: '#6b7280',
          }}
        >
          No tasks yet
        </div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            fontSize: 13,
            color: '#111827',
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
    borderRadius: 16,
    border: '1px solid #e5e7eb',
    padding: '10px 11px',
    marginBottom: 8,
    backgroundColor: '#ffffff',
    boxShadow: '0 10px 25px rgba(15,23,42,0.06)',
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
  };

  return (
    <li ref={setNodeRef} data-testid={`board-task-${task.id}`} style={style}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
        }}
      >
        <div
          onClick={onClick}
          style={{
            flex: 1,
            cursor: 'pointer',
          }}
        >
          {task.parentId ? (
            <>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#6b7280',
                  lineHeight: 1.3,
                  overflowWrap: 'anywhere',
                }}
              >
                Subtask
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 13,
                  fontWeight: 600,
                  lineHeight: 1.3,
                  overflowWrap: 'anywhere',
                }}
              >
                ↳ {task.title}
              </div>
            </>
          ) : (
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                lineHeight: 1.3,
                overflowWrap: 'anywhere',
              }}
            >
              {task.title}
            </div>
          )}
        </div>
        <span
          {...listeners}
          {...attributes}
          style={{
            marginLeft: 6,
            cursor: 'grab',
            fontSize: 12,
            color: '#9ca3af',
            userSelect: 'none',
          }}
        >
          ::
        </span>
      </div>
      {task.dueDate && (
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
          Due: {new Date(task.dueDate).toLocaleDateString()}
        </div>
      )}
      <button
        type="button"
        onClick={onDelete}
        style={{
          marginTop: 8,
          borderRadius: 999,
          border: '1px solid #fee2e2',
          backgroundColor: '#fff1f2',
          color: '#b91c1c',
          fontSize: 11,
          padding: '4px 10px',
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
    <div style={{ marginTop: 12 }}>
      {tasksError && (
        <div
          style={{
            padding: 10,
            borderRadius: 8,
            border: '1px solid #fecaca',
            backgroundColor: '#fef2f2',
            color: '#b91c1c',
            fontSize: 12,
            marginBottom: 12,
          }}
        >
          {tasksError}
        </div>
      )}
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
              minWidth: 860,
              borderCollapse: 'separate',
              borderSpacing: 0,
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
                <td
                  colSpan={4}
                  style={{
                    padding: 10,
                    borderBottom: '1px solid #f3f4f6',
                    backgroundColor: '#f9fafb',
                  }}
                >
                  <form
                    onSubmit={onCreate}
                    style={{
                      display: 'flex',
                      gap: 8,
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
                        minHeight: 34,
                        padding: '6px 12px',
                        borderRadius: 999,
                        border: 'none',
                        backgroundColor: '#0f172a',
                        color: '#ffffff',
                        cursor: creating ? 'not-allowed' : 'pointer',
                        fontSize: 13,
                        fontWeight: 600,
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
                  <td
                    colSpan={4}
                    style={{
                      padding: 12,
                      textAlign: 'center',
                      color: '#6b7280',
                      fontSize: 12,
                    }}
                  >
                    No tasks yet. Use the row above to add your first task.
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

function AutomationsListView({
  rules,
  loading,
  error,
  isAdmin,
  togglingRuleIds,
  onToggle,
  sections,
  members,
  projectId,
  projectName,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
}: {
  rules: AutomationRule[];
  loading: boolean;
  error: string;
  isAdmin: boolean;
  togglingRuleIds: Record<string, boolean>;
  onToggle: (rule: AutomationRule) => void;
  sections: ProjectSection[];
  members: OrgMember[];
  projectId: string;
  projectName: string;
  onCreateRule: (payload: {
    name: string;
    description?: string | null;
    triggerType: string;
    conditions: Array<{
      field: string;
      operator: string;
      value: string | number | boolean | null;
    }>;
    actions: Array<{
      type: string;
      config: Record<string, string | number | boolean | null>;
    }>;
  }) => Promise<void>;
  onUpdateRule: (
    ruleId: string,
    payload: {
      name: string;
      description?: string | null;
      triggerType: string;
      conditions: Array<{
        field: string;
        operator: string;
        value: string | number | boolean | null;
      }>;
      actions: Array<{
        type: string;
        config: Record<string, string | number | boolean | null>;
      }>;
    },
  ) => Promise<void>;
  onDeleteRule: (ruleId: string) => Promise<void>;
}) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [confirmDeleteRuleId, setConfirmDeleteRuleId] = useState<string | null>(null);
  const [deletingRuleIds, setDeletingRuleIds] = useState<Record<string, boolean>>({});
  const [localError, setLocalError] = useState('');

  if (loading) {
    return (
      <>
        {isAdmin ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button
              type="button"
              data-testid="automations-create-rule"
              onClick={() => setIsCreateOpen(true)}
              style={{
                minHeight: 34,
                padding: '6px 12px',
                borderRadius: 999,
                border: '1px solid #e5e7eb',
                backgroundColor: '#ffffff',
                color: '#374151',
                fontSize: 13,
                fontWeight: 500,
                boxShadow: '0 1px 2px rgba(15,23,42,0.05)',
                cursor: 'pointer',
              }}
            >
              Create Rule
            </button>
          </div>
        ) : null}
        <div style={{ color: '#6b7280', fontSize: 13 }}>Loading automations...</div>
      </>
    );
  }

  return (
    <>
      {isAdmin ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button
            type="button"
            data-testid="automations-create-rule"
            onClick={() => setIsCreateOpen(true)}
            style={{
              minHeight: 34,
              padding: '6px 12px',
              borderRadius: 999,
              border: '1px solid #e5e7eb',
              backgroundColor: '#ffffff',
              color: '#374151',
              fontSize: 13,
              fontWeight: 500,
              boxShadow: '0 1px 2px rgba(15,23,42,0.05)',
              cursor: 'pointer',
            }}
          >
            Create Rule
          </button>
        </div>
      ) : null}

      {error || localError ? (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 8,
            border: '1px solid #fecaca',
            backgroundColor: '#fef2f2',
            color: '#b91c1c',
            fontSize: 12,
          }}
        >
          {error || localError}
        </div>
      ) : null}

      {rules.length === 0 && !error ? (
        <div
          style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 12,
            border: '1px dashed #d1d5db',
            backgroundColor: '#f9fafb',
            color: '#6b7280',
            fontSize: 13,
            textAlign: 'center',
          }}
        >
          No automations yet. Create your first rule to get started.
        </div>
      ) : null}

      {rules.length > 0 ? (
        <div
          style={{
            marginTop: 8,
            borderRadius: 18,
            border: '1px solid #e5e7eb',
            backgroundColor: '#ffffff',
            boxShadow: '0 18px 40px rgba(15,23,42,0.06)',
            padding: 10,
          }}
        >
          {rules.map((rule) => {
            const isToggling = !!togglingRuleIds[rule.id];
            return (
              <div
                key={rule.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                  padding: '10px 12px',
                  borderRadius: 14,
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#ffffff',
                  marginBottom: 6,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: '#111827',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {rule.name}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: '#6b7280',
                      marginTop: 2,
                    }}
                  >
                    Trigger: <span style={{ fontWeight: 500 }}>{rule.triggerType}</span>
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    style={{
                      padding: '4px 8px',
                      borderRadius: 999,
                      border: '1px solid ' + (rule.isActive ? '#22c55e' : '#e5e7eb'),
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      backgroundColor: rule.isActive ? '#dcfce7' : '#f9fafb',
                      color: rule.isActive ? '#166534' : '#6b7280',
                    }}
                  >
                    {rule.isActive ? 'ON' : 'OFF'}
                  </span>
                  {isAdmin ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onToggle(rule)}
                        disabled={isToggling}
                        style={{
                          minHeight: 30,
                          padding: '6px 10px',
                          borderRadius: 999,
                          border: '1px solid #e5e7eb',
                          backgroundColor: '#ffffff',
                          color: '#374151',
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: isToggling ? 'not-allowed' : 'pointer',
                          boxShadow: '0 1px 2px rgba(15,23,42,0.05)',
                        }}
                      >
                        {isToggling
                          ? 'Saving...'
                          : rule.isActive
                            ? 'Turn off'
                            : 'Turn on'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDeleteRuleId(null);
                          setEditingRule(rule);
                        }}
                        style={{
                          minHeight: 30,
                          padding: '6px 10px',
                          borderRadius: 999,
                          border: '1px solid #e5e7eb',
                          backgroundColor: '#ffffff',
                          color: '#374151',
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: 'pointer',
                          boxShadow: '0 1px 2px rgba(15,23,42,0.05)',
                        }}
                      >
                        Edit
                      </button>
                      {confirmDeleteRuleId === rule.id ? (
                        <>
                          <button
                            type="button"
                            onClick={async () => {
                              setDeletingRuleIds((prev) => ({ ...prev, [rule.id]: true }));
                              try {
                                await onDeleteRule(rule.id);
                                setConfirmDeleteRuleId(null);
                                setLocalError('');
                              } catch (err: any) {
                                setLocalError(err.message || 'Failed to delete automation');
                              } finally {
                                setDeletingRuleIds((prev) => {
                                  const next = { ...prev };
                                  delete next[rule.id];
                                  return next;
                                });
                              }
                            }}
                            disabled={!!deletingRuleIds[rule.id]}
                            style={{
                              minHeight: 30,
                              padding: '6px 10px',
                              borderRadius: 999,
                              border: '1px solid #fecaca',
                              backgroundColor: '#fff1f2',
                              color: '#b91c1c',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: deletingRuleIds[rule.id] ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {deletingRuleIds[rule.id] ? 'Deleting...' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteRuleId(null)}
                            disabled={!!deletingRuleIds[rule.id]}
                            style={{
                              minHeight: 30,
                              padding: '6px 10px',
                              borderRadius: 999,
                              border: '1px solid #e5e7eb',
                              backgroundColor: '#ffffff',
                              color: '#374151',
                              fontSize: 12,
                              fontWeight: 500,
                              cursor: deletingRuleIds[rule.id] ? 'not-allowed' : 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRule(null);
                            setConfirmDeleteRuleId(rule.id);
                          }}
                          style={{
                            minHeight: 30,
                            padding: '6px 10px',
                            borderRadius: 999,
                            border: '1px solid #fecaca',
                            backgroundColor: '#fff1f2',
                            color: '#b91c1c',
                            fontSize: 12,
                            fontWeight: 500,
                            cursor: 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {(isCreateOpen || editingRule) ? (
        <CreateAutomationRuleDrawer
          mode={editingRule ? 'edit' : 'create'}
          initialRule={editingRule ?? undefined}
          sections={sections}
          members={members}
          projectId={projectId}
          projectName={projectName}
          onClose={() => {
            setIsCreateOpen(false);
            setEditingRule(null);
          }}
          onSubmitRule={async (payload) => {
            if (editingRule) {
              await onUpdateRule(editingRule.id, payload);
            } else {
              await onCreateRule(payload);
            }
          }}
        />
      ) : null}
    </>
  );
}

function CreateAutomationRuleDrawer({
  mode,
  initialRule,
  sections,
  members,
  projectId,
  projectName,
  onClose,
  onSubmitRule,
}: {
  mode: 'create' | 'edit';
  initialRule?: AutomationRule;
  sections: ProjectSection[];
  members: OrgMember[];
  projectId: string;
  projectName: string;
  onClose: () => void;
  onSubmitRule: (payload: {
    name: string;
    description?: string | null;
    triggerType: string;
    conditions: Array<{
      field: string;
      operator: string;
      value: string | number | boolean | null;
    }>;
    actions: Array<{
      type: string;
      config: Record<string, string | number | boolean | null>;
    }>;
  }) => Promise<void>;
}) {
  const TRIGGERS = [
    'TASK_CREATED',
    'TASK_SECTION_CHANGED',
    'TASK_ASSIGNED',
    'COMMENT_CREATED',
  ] as const;

  const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

  type ConditionField =
    | 'task.sectionId'
    | 'task.priority'
    | 'task.assigneeId'
    | 'task.projectId'
    | 'after.sectionId'
    | 'before.sectionId';
  type ConditionOperator = 'equals' | 'not_equals';

  type AutomationActionType =
    | 'ASSIGN_USER'
    | 'MOVE_TO_SECTION'
    | 'SET_PRIORITY'
    | 'SEND_NOTIFICATION'
    | 'SET_REVIEWER';

  type ConditionDraft = {
    id: string;
    field: ConditionField;
    operator: ConditionOperator;
    value: string;
  };

  type ActionDraft = {
    id: string;
    type: AutomationActionType;
    config: Record<string, string>;
  };

  function normalizeConditionOperator(op: string | undefined): ConditionOperator {
    return op === 'not_equals' ? 'not_equals' : 'equals';
  }

  const [submitting, setSubmitting] = useState(false);
  const [backendError, setBackendError] = useState('');

  const [name, setName] = useState(initialRule?.name ?? '');
  const [description, setDescription] = useState(initialRule?.description ?? '');
  const [triggerType, setTriggerType] = useState<string>(initialRule?.triggerType ?? '');

  const [conditions, setConditions] = useState<ConditionDraft[]>(
    (initialRule?.conditions ?? []).map((c) => ({
      id: `cond-${Math.random().toString(36).slice(2, 9)}`,
      field: c.field as ConditionField,
      operator: normalizeConditionOperator(c.operator),
      value: c.value === null ? '' : String(c.value ?? ''),
    })),
  );
  const [actions, setActions] = useState<ActionDraft[]>(() => {
    const fromRule = (initialRule?.actions ?? []).map((a) => ({
      id: `action-${Math.random().toString(36).slice(2, 9)}`,
      type: a.type as AutomationActionType,
      config: Object.fromEntries(
        Object.entries(a.config ?? {}).map(([k, v]) => [k, v === null ? '' : String(v)]),
      ),
    }));
    if (fromRule.length > 0) return fromRule;
    return [
      {
        id: `action-${Math.random().toString(36).slice(2, 9)}`,
        type: 'ASSIGN_USER',
        config: { userId: '' },
      },
    ];
  });

  useEffect(() => {
    if (!initialRule) return;
    setName(initialRule.name ?? '');
    setDescription(initialRule.description ?? '');
    setTriggerType(initialRule.triggerType ?? '');
    setConditions(
      (initialRule.conditions ?? []).map((c) => ({
        id: `cond-${Math.random().toString(36).slice(2, 9)}`,
        field: c.field as ConditionField,
        operator: normalizeConditionOperator(c.operator),
        value: c.value === null ? '' : String(c.value ?? ''),
      })),
    );
    setActions(
      (initialRule.actions ?? []).map((a) => ({
        id: `action-${Math.random().toString(36).slice(2, 9)}`,
        type: a.type as AutomationActionType,
        config: Object.fromEntries(
          Object.entries(a.config ?? {}).map(([k, v]) => [k, v === null ? '' : String(v)]),
        ),
      })),
    );
  }, [initialRule]);

  useEffect(() => {
    if (actions.length > 0) return;
    setActions([
      {
        id: `action-${Math.random().toString(36).slice(2, 9)}`,
        type: 'ASSIGN_USER',
        config: { userId: '' },
      },
    ]);
  }, [actions.length]);

  const [nameError, setNameError] = useState('');
  const [triggerTypeError, setTriggerTypeError] = useState('');
  const [actionsError, setActionsError] = useState('');
  const [conditionErrorsById, setConditionErrorsById] = useState<Record<string, string>>({});
  const [actionErrorsById, setActionErrorsById] = useState<Record<string, string>>({});

  const close = () => {
    if (submitting) return;
    onClose();
  };

  const getValueLabel = (field: ConditionField) => {
    if (field === 'task.sectionId') return 'Section';
    if (field === 'after.sectionId') return 'After section';
    if (field === 'before.sectionId') return 'Before section';
    if (field === 'task.priority') return 'Priority';
    if (field === 'task.assigneeId') return 'Assignee';
    return 'Project';
  };

  const conditionFieldOptions: Array<{ value: ConditionField; label: string }> =
    triggerType === 'TASK_SECTION_CHANGED'
      ? [
          { value: 'after.sectionId', label: 'after.sectionId' },
          { value: 'before.sectionId', label: 'before.sectionId' },
          { value: 'task.sectionId', label: 'task.sectionId' },
          { value: 'task.priority', label: 'task.priority' },
          { value: 'task.assigneeId', label: 'task.assigneeId' },
          { value: 'task.projectId', label: 'task.projectId' },
        ]
      : [
          { value: 'task.sectionId', label: 'task.sectionId' },
          { value: 'task.priority', label: 'task.priority' },
          { value: 'task.assigneeId', label: 'task.assigneeId' },
          { value: 'task.projectId', label: 'task.projectId' },
          { value: 'after.sectionId', label: 'after.sectionId' },
          { value: 'before.sectionId', label: 'before.sectionId' },
        ];

  const validate = () => {
    const nextConditionErrors: Record<string, string> = {};
    const nextActionErrors: Record<string, string> = {};

    let ok = true;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Name is required');
      ok = false;
    } else {
      setNameError('');
    }

    if (!triggerType) {
      setTriggerTypeError('Trigger type is required');
      ok = false;
    } else {
      setTriggerTypeError('');
    }

    if (!actions || actions.length < 1) {
      setActionsError('At least one action is required');
      ok = false;
    } else {
      setActionsError('');
    }

    for (const c of conditions) {
      if (!String(c.value ?? '').trim()) {
        nextConditionErrors[c.id] = 'Value is required';
        ok = false;
      }
    }
    for (const a of actions) {
      if (a.type === 'ASSIGN_USER' || a.type === 'SET_REVIEWER') {
        const userId = String(a.config.userId ?? '').trim();
        if (!userId) {
          nextActionErrors[a.id] = 'User is required';
          ok = false;
        }
      } else if (a.type === 'MOVE_TO_SECTION') {
        const sectionId = String(a.config.sectionId ?? '').trim();
        if (!sectionId) {
          nextActionErrors[a.id] = 'Section is required';
          ok = false;
        }
      } else if (a.type === 'SET_PRIORITY') {
        const priority = String(a.config.priority ?? '').trim();
        if (!priority) {
          nextActionErrors[a.id] = 'Priority is required';
          ok = false;
        }
      } else if (a.type === 'SEND_NOTIFICATION') {
        const target = String(a.config.target ?? '').trim();
        if (!target) {
          nextActionErrors[a.id] = 'Notification target is required';
          ok = false;
          continue;
        }
        if (target === 'USER') {
          const userId = String(a.config.userId ?? '').trim();
          if (!userId) {
            nextActionErrors[a.id] = 'User is required when target is USER';
            ok = false;
          }
        }
      }
    }

    setConditionErrorsById(nextConditionErrors);
    setActionErrorsById(nextActionErrors);
    return ok;
  };

  const buildConditionsPayload = () => {
    return conditions.map((c) => ({
      field: c.field,
      operator: c.operator,
      value: c.value,
    }));
  };

  const buildActionsPayload = () => {
    return actions.map((a): {
      type: string;
      config: Record<string, string | number | boolean | null>;
    } => {
      if (a.type === 'ASSIGN_USER') {
        return { type: a.type, config: { userId: a.config.userId ?? '' } };
      }
      if (a.type === 'MOVE_TO_SECTION') {
        return { type: a.type, config: { sectionId: a.config.sectionId ?? '' } };
      }
      if (a.type === 'SET_PRIORITY') {
        return { type: a.type, config: { priority: a.config.priority ?? '' } };
      }
      if (a.type === 'SEND_NOTIFICATION') {
        const payload: Record<string, string | number | boolean | null> = {
          target: a.config.target ?? '',
        };
        if (a.config.userId) {
          payload.userId = a.config.userId;
        }
        const notifyRaw = String(a.config.notifyActor ?? '').toLowerCase();
        if (notifyRaw === 'true' || notifyRaw === '1') {
          payload.notifyActor = true;
        }
        return { type: a.type, config: payload };
      }
      return { type: a.type, config: { userId: a.config.userId ?? '' } };
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBackendError('');

    if (!validate()) return;

    setSubmitting(true);
    try {
      await onSubmitRule({
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
        triggerType,
        conditions: buildConditionsPayload(),
        actions: buildActionsPayload(),
      });

      onClose();
    } catch (err: any) {
      setBackendError(
        err?.message ||
          err?.error?.message ||
          (mode === 'edit'
            ? 'Failed to update automation rule'
            : 'Failed to create automation rule'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangeConditionField = (id: string, nextField: ConditionField) => {
    setConditions((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const nextValue =
          nextField === 'task.projectId'
            ? projectId
            : '';
        return { ...c, field: nextField, value: nextValue };
      }),
    );
    setConditionErrorsById((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleChangeActionType = (id: string, nextType: AutomationActionType) => {
    setActions((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        if (nextType === 'ASSIGN_USER') return { ...a, type: nextType, config: { userId: '' } };
        if (nextType === 'MOVE_TO_SECTION') return { ...a, type: nextType, config: { sectionId: '' } };
        if (nextType === 'SET_PRIORITY') return { ...a, type: nextType, config: { priority: '' } };
        if (nextType === 'SEND_NOTIFICATION')
          return { ...a, type: nextType, config: { target: 'USER', userId: '', notifyActor: 'false' } };
        return { ...a, type: nextType, config: { userId: '' } };
      }),
    );
    setActionErrorsById((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const fieldLabelClass =
    'mb-1 block text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-400';
  const sectionHeadingClass =
    'text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-400';
  const projectInputClass =
    'h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-900 outline-none transition focus:border-slate-300';
  const projectTextareaClass =
    'w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-900 outline-none transition focus:border-slate-300';
  const workflowCardClass = 'rounded-2xl border border-slate-100 bg-slate-50 p-4';
  const projectRemoveIconButtonClass =
    'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 transition hover:bg-slate-50 hover:text-slate-600';
  const projectOutlineButtonClass =
    'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50';

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 px-4"
      onClick={close}
    >
      <div
        className="max-h-[90vh] w-full max-w-[640px] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
          <div className="min-w-0">
            <h2 className="text-[20px] font-semibold text-slate-900 sm:text-[24px]">
              {mode === 'edit' ? 'Edit Rule' : 'Create Rule'}
            </h2>
            <p className="mt-1 text-[13px] text-slate-500">
              Project-scoped rule for{' '}
              <span className="font-medium text-slate-700">{projectName || 'this project'}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={submit} className="px-4 pb-4 pt-3 sm:px-5">
          {backendError ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">
              {backendError}
            </div>
          ) : null}

          <div className="space-y-3">
            <div>
              <label htmlFor="automation-rule-name" className={fieldLabelClass}>
                Name
              </label>
              <input
                id="automation-rule-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError('');
                }}
                className={projectInputClass}
              />
              {nameError ? <div className="mt-1 text-[12px] text-red-600">{nameError}</div> : null}
            </div>

            <div>
              <label htmlFor="automation-rule-description" className={fieldLabelClass}>
                Description{' '}
                <span className="font-normal normal-case tracking-normal text-slate-400">
                  (optional)
                </span>
              </label>
              <textarea
                id="automation-rule-description"
                value={description}
                rows={3}
                onChange={(e) => setDescription(e.target.value)}
                className={projectTextareaClass}
              />
            </div>

            <div>
              <label htmlFor="automation-rule-trigger" className={fieldLabelClass}>
                Trigger Type
              </label>
              <select
                id="automation-rule-trigger"
                value={triggerType}
                onChange={(e) => {
                  setTriggerType(e.target.value);
                  if (triggerTypeError) setTriggerTypeError('');
                }}
                className={projectInputClass}
              >
                <option value="">Select trigger</option>
                {TRIGGERS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {triggerTypeError ? (
                <div className="mt-1 text-[12px] text-red-600">{triggerTypeError}</div>
              ) : null}
            </div>
          </div>

          <div className="mt-4 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between gap-2">
              <span className={sectionHeadingClass}>Conditions (AND)</span>
              <button
                type="button"
                onClick={() => {
                  const id = `cond-${Math.random().toString(36).slice(2, 9)}`;
                  const defaultField: ConditionField =
                    triggerType === 'TASK_SECTION_CHANGED'
                      ? 'after.sectionId'
                      : 'task.sectionId';
                  setConditions((prev) => [
                    ...prev,
                    { id, field: defaultField, operator: 'equals', value: '' },
                  ]);
                }}
                className={projectOutlineButtonClass}
              >
                <Plus size={14} className="text-slate-500" />
                Add condition
              </button>
            </div>

            <div className="mt-3 grid gap-3">
              {conditions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-center text-[12px] text-slate-500">
                  No conditions
                </div>
              ) : null}

                  {conditions.map((c) => {
                    const valueError = conditionErrorsById[c.id];
                    const valueIsProject = c.field === 'task.projectId';
                    return (
                      <div key={c.id} className={workflowCardClass}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className={fieldLabelClass}>Condition</div>

                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <select
                                value={c.field}
                                onChange={(e) =>
                                  handleChangeConditionField(c.id, e.target.value as ConditionField)
                                }
                                className={projectInputClass}
                              >
                                {conditionFieldOptions.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={c.operator}
                                onChange={(e) => {
                                  const nextOp = e.target.value as ConditionOperator;
                                  setConditions((prev) =>
                                    prev.map((x) =>
                                      x.id === c.id ? { ...x, operator: nextOp } : x,
                                    ),
                                  );
                                }}
                                className={projectInputClass}
                              >
                                <option value="equals">is</option>
                                <option value="not_equals">is not</option>
                              </select>
                            </div>

                            <div className="space-y-2">
                              {c.field === 'task.sectionId' ||
                              c.field === 'after.sectionId' ||
                              c.field === 'before.sectionId' ? (
                                <select
                                  value={c.value}
                                  onChange={(e) => {
                                    const next = e.target.value;
                                    setConditions((prev) =>
                                      prev.map((x) => (x.id === c.id ? { ...x, value: next } : x)),
                                    );
                                    setConditionErrorsById((prev) => {
                                      if (!(c.id in prev)) return prev;
                                      const n = { ...prev };
                                      delete n[c.id];
                                      return n;
                                    });
                                  }}
                                  className={projectInputClass}
                                >
                                  <option value="">Select section</option>
                                  {sections.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name}
                                    </option>
                                  ))}
                                </select>
                              ) : null}

                              {c.field === 'task.priority' ? (
                                <select
                                  value={c.value}
                                  onChange={(e) => {
                                    const next = e.target.value;
                                    setConditions((prev) =>
                                      prev.map((x) => (x.id === c.id ? { ...x, value: next } : x)),
                                    );
                                    setConditionErrorsById((prev) => {
                                      if (!(c.id in prev)) return prev;
                                      const n = { ...prev };
                                      delete n[c.id];
                                      return n;
                                    });
                                  }}
                                  className={projectInputClass}
                                >
                                  <option value="">Select priority</option>
                                  {PRIORITIES.map((p) => (
                                    <option key={p} value={p}>
                                      {p}
                                    </option>
                                  ))}
                                </select>
                              ) : null}

                              {c.field === 'task.assigneeId' ? (
                                <select
                                  value={c.value}
                                  onChange={(e) => {
                                    const next = e.target.value;
                                    setConditions((prev) =>
                                      prev.map((x) => (x.id === c.id ? { ...x, value: next } : x)),
                                    );
                                    setConditionErrorsById((prev) => {
                                      if (!(c.id in prev)) return prev;
                                      const n = { ...prev };
                                      delete n[c.id];
                                      return n;
                                    });
                                  }}
                                  className={projectInputClass}
                                >
                                  <option value="">Select assignee</option>
                                  {members.map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.email ?? 'Unknown user'}
                                    </option>
                                  ))}
                                </select>
                              ) : null}

                              {valueIsProject ? (
                                <select
                                  value={c.value || projectId}
                                  onChange={(e) => {
                                    const next = e.target.value;
                                    setConditions((prev) =>
                                      prev.map((x) => (x.id === c.id ? { ...x, value: next } : x)),
                                    );
                                    setConditionErrorsById((prev) => {
                                      if (!(c.id in prev)) return prev;
                                      const n = { ...prev };
                                      delete n[c.id];
                                      return n;
                                    });
                                  }}
                                  className={projectInputClass}
                                >
                                  <option value={projectId}>{projectName || 'Project'}</option>
                                </select>
                              ) : null}

                              {valueError ? (
                                <div className="text-[12px] text-red-600">{valueError}</div>
                              ) : null}
                            </div>

                            <div className="border-t border-slate-100 pt-2 text-[12px] text-slate-500">
                              {getValueLabel(c.field)}: {String(c.value ?? '') || '—'}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setConditions((prev) => prev.filter((x) => x.id !== c.id))
                            }
                            className={projectRemoveIconButtonClass}
                            aria-label="Remove condition"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between gap-2">
                  <span className={sectionHeadingClass}>Actions</span>
                  <button
                    type="button"
                    onClick={() => {
                      const id = `action-${Math.random().toString(36).slice(2, 9)}`;
                      setActions((prev) => [
                        ...prev,
                        { id, type: 'ASSIGN_USER', config: { userId: '' } },
                      ]);
                    }}
                    className={projectOutlineButtonClass}
                  >
                    <Plus size={14} className="text-slate-500" />
                    Add action
                  </button>
                </div>

                {actionsError ? (
                  <div className="mt-2 text-[12px] text-red-600">{actionsError}</div>
                ) : null}

                <div className="mt-3 grid gap-3">
                  {actions.map((a) => {
                    const actionError = actionErrorsById[a.id];
                    return (
                      <div key={a.id} className={workflowCardClass}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className={fieldLabelClass}>Action</div>

                            <select
                              value={a.type}
                              onChange={(e) =>
                                handleChangeActionType(a.id, e.target.value as AutomationActionType)
                              }
                              className={projectInputClass}
                            >
                              <option value="ASSIGN_USER">ASSIGN_USER</option>
                              <option value="MOVE_TO_SECTION">MOVE_TO_SECTION</option>
                              <option value="SET_PRIORITY">SET_PRIORITY</option>
                              <option value="SEND_NOTIFICATION">SEND_NOTIFICATION</option>
                              <option value="SET_REVIEWER">SET_REVIEWER</option>
                            </select>

                            {a.type === 'ASSIGN_USER' ? (
                              <select
                                value={a.config.userId ?? ''}
                                onChange={(e) => {
                                  const userId = e.target.value;
                                  setActions((prev) =>
                                    prev.map((x) =>
                                      x.id === a.id ? { ...x, config: { ...x.config, userId } } : x,
                                    ),
                                  );
                                  setActionErrorsById((prev) => {
                                    if (!(a.id in prev)) return prev;
                                    const n = { ...prev };
                                    delete n[a.id];
                                    return n;
                                  });
                                }}
                                className={projectInputClass}
                              >
                                <option value="">Select user</option>
                                {members.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.email ?? 'Unknown user'}
                                  </option>
                                ))}
                              </select>
                            ) : null}

                            {a.type === 'SET_REVIEWER' ? (
                              <select
                                value={a.config.userId ?? ''}
                                onChange={(e) => {
                                  const userId = e.target.value;
                                  setActions((prev) =>
                                    prev.map((x) =>
                                      x.id === a.id ? { ...x, config: { ...x.config, userId } } : x,
                                    ),
                                  );
                                  setActionErrorsById((prev) => {
                                    if (!(a.id in prev)) return prev;
                                    const n = { ...prev };
                                    delete n[a.id];
                                    return n;
                                  });
                                }}
                                className={projectInputClass}
                              >
                                <option value="">Select reviewer</option>
                                {members.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.email ?? 'Unknown user'}
                                  </option>
                                ))}
                              </select>
                            ) : null}

                            {a.type === 'MOVE_TO_SECTION' ? (
                              <select
                                value={a.config.sectionId ?? ''}
                                onChange={(e) => {
                                  const sectionId = e.target.value;
                                  setActions((prev) =>
                                    prev.map((x) =>
                                      x.id === a.id ? { ...x, config: { ...x.config, sectionId } } : x,
                                    ),
                                  );
                                  setActionErrorsById((prev) => {
                                    if (!(a.id in prev)) return prev;
                                    const n = { ...prev };
                                    delete n[a.id];
                                    return n;
                                  });
                                }}
                                className={projectInputClass}
                              >
                                <option value="">Select section</option>
                                {sections.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                            ) : null}

                            {a.type === 'SET_PRIORITY' ? (
                              <select
                                value={a.config.priority ?? ''}
                                onChange={(e) => {
                                  const priority = e.target.value;
                                  setActions((prev) =>
                                    prev.map((x) =>
                                      x.id === a.id ? { ...x, config: { ...x.config, priority } } : x,
                                    ),
                                  );
                                  setActionErrorsById((prev) => {
                                    if (!(a.id in prev)) return prev;
                                    const n = { ...prev };
                                    delete n[a.id];
                                    return n;
                                  });
                                }}
                                className={projectInputClass}
                              >
                                <option value="">Select priority</option>
                                {PRIORITIES.map((p) => (
                                  <option key={p} value={p}>
                                    {p}
                                  </option>
                                ))}
                              </select>
                            ) : null}

                            {a.type === 'SEND_NOTIFICATION' ? (
                              <div className="space-y-3">
                                <select
                                  value={a.config.target ?? 'USER'}
                                  onChange={(e) => {
                                    const target = e.target.value;
                                    setActions((prev) =>
                                      prev.map((x) => {
                                        if (x.id !== a.id) return x;
                                        const nextConfig: Record<string, string> = { ...x.config, target };
                                        if (target !== 'USER') {
                                          delete nextConfig.userId;
                                        } else {
                                          nextConfig.userId = nextConfig.userId ?? '';
                                        }
                                        return { ...x, config: nextConfig };
                                      }),
                                    );
                                    setActionErrorsById((prev) => {
                                      if (!(a.id in prev)) return prev;
                                      const n = { ...prev };
                                      delete n[a.id];
                                      return n;
                                    });
                                  }}
                                  className={projectInputClass}
                                >
                                  <option value="USER">USER</option>
                                  <option value="ASSIGNEE">ASSIGNEE</option>
                                  <option value="REVIEWER">REVIEWER</option>
                                </select>

                                {a.config.target === 'USER' ? (
                                  <select
                                    value={a.config.userId ?? ''}
                                    onChange={(e) => {
                                      const userId = e.target.value;
                                      setActions((prev) =>
                                        prev.map((x) =>
                                          x.id === a.id
                                            ? { ...x, config: { ...x.config, userId } }
                                            : x,
                                        ),
                                      );
                                      setActionErrorsById((prev) => {
                                        if (!(a.id in prev)) return prev;
                                        const n = { ...prev };
                                        delete n[a.id];
                                        return n;
                                      });
                                    }}
                                    className={projectInputClass}
                                  >
                                    <option value="">Select user</option>
                                    {members.map((m) => (
                                      <option key={m.id} value={m.id}>
                                        {m.email ?? 'Unknown user'}
                                      </option>
                                    ))}
                                  </select>
                                ) : null}

                                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-100 bg-white p-3">
                                  <input
                                    type="checkbox"
                                    checked={
                                      String(a.config.notifyActor ?? '').toLowerCase() === 'true' ||
                                      a.config.notifyActor === '1'
                                    }
                                    onChange={(e) => {
                                      const v = e.target.checked ? 'true' : 'false';
                                      setActions((prev) =>
                                        prev.map((x) =>
                                          x.id === a.id
                                            ? { ...x, config: { ...x.config, notifyActor: v } }
                                            : x,
                                        ),
                                      );
                                    }}
                                    className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
                                  />
                                  <span className="min-w-0">
                                    <span className="block text-[13px] font-medium text-slate-800">
                                      Notify even if triggered by the same user
                                    </span>
                                    <span className="mt-1 block text-[12px] leading-snug text-slate-500">
                                      Turn on for review flows where you set yourself as reviewer and still want a
                                      notification.
                                    </span>
                                  </span>
                                </label>
                              </div>
                            ) : null}

                            {actionError ? (
                              <div className="text-[12px] text-red-600">{actionError}</div>
                            ) : null}

                            <div className="border-t border-slate-100 pt-2 text-[12px] text-slate-500">
                              Type: {a.type}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setActions((prev) => prev.filter((x) => x.id !== a.id))}
                            className={projectRemoveIconButtonClass}
                            aria-label="Remove action"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 border-t border-slate-200" />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  disabled={submitting}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-slate-500 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-slate-600 disabled:opacity-50"
                >
                  {submitting
                    ? mode === 'edit'
                      ? 'Saving…'
                      : 'Creating…'
                    : mode === 'edit'
                      ? 'Save Changes'
                      : 'Create Rule'}
                </button>
              </div>
            </form>
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

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  backgroundColor: '#f9fafb',
  color: '#111827',
  fontSize: 13,
};

const smallInputStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  backgroundColor: '#ffffff',
  color: '#111827',
  minWidth: 140,
  fontSize: 12,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 8,
  fontSize: 13,
  color: '#111827',
};

