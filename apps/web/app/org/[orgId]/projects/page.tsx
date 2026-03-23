'use client';

import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '../../../../lib/api';
import { useAuth } from '../../../../contexts/AuthContext';
import { PrimaryActionButton } from '../../../../components/ui/PrimaryActionButton';
import {
  Check,
  ChevronDown,
  FolderKanban,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  status?: string | null;
}

interface SectionDraft {
  id: string;
  name: string;
}

function createDefaultSections(): SectionDraft[] {
  return ['To Do', 'In Progress', 'Review', 'Done'].map((name) => ({
    id: `${name}-${Math.random().toString(36).slice(2, 9)}`,
    name,
  }));
}

const PROJECT_CATEGORY_OPTIONS = [
  'Design',
  'Development',
  'Marketing',
  'Operations',
  'Sales',
  'Product',
] as const;

const PROJECT_STATUS_OPTIONS = [
  'Onboarding',
  'Established',
  'On Hold',
  'Terminated',
] as const;

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

export default function OrgProjectsPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const orgId = params.orgId as string;

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectModalMode, setProjectModalMode] = useState<'create' | 'edit'>(
    'create',
  );
  const [editingProjectId, setEditingProjectId] = useState<string | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [newProjectCategory, setNewProjectCategory] = useState('Design');
  const [newProjectStatus, setNewProjectStatus] = useState<'Onboarding' | 'Established' | 'Terminated' | 'On Hold'>('Onboarding');
  const [newProjectSections, setNewProjectSections] = useState<SectionDraft[]>(createDefaultSections);
  const [newSectionInput, setNewSectionInput] = useState('');
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(null);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement | null>(null);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const loadProjects = async () => {
    if (!user) return;
    try {
      const data = await apiFetch('/projects', {
        headers: { 'x-org-id': orgId },
      });
      setProjects(data as Project[]);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, user]);

  useEffect(() => {
    if (!isCategoryDropdownOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(event.target as Node)
      ) {
        setIsCategoryDropdownOpen(false);
      }
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCategoryDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isCategoryDropdownOpen]);

  const handleCloseProjectModal = () => {
    if (creating) return;
    setShowProjectModal(false);
    setProjectModalMode('create');
    setEditingProjectId(null);
    setCreateError('');
    resetProjectModalFieldsForCreate();
  };

  const resetProjectModalFieldsForCreate = () => {
    setNewProjectName('');
    setNewProjectDescription('');
    setNewProjectCategory('Design');
    setNewProjectStatus('Onboarding');
    setNewProjectSections(createDefaultSections());
    setNewSectionInput('');
    setIsCategoryDropdownOpen(false);
  };

  const handleOpenCreateModal = () => {
    setOpenMenuId(null);
    setCreateError('');
    resetProjectModalFieldsForCreate();
    setProjectModalMode('create');
    setEditingProjectId(null);
    setShowProjectModal(true);
  };

  const handleOpenEdit = async (p: Project) => {
    setOpenMenuId(null);
    setCreateError('');
    setProjectModalMode('edit');
    setEditingProjectId(p.id);

    setNewProjectName(p.name);
    setNewProjectDescription(p.description ?? '');
    setNewProjectCategory(p.category ?? 'Design');
    setNewProjectStatus(
      (p.status as any) ?? ('Onboarding' as const),
    );
    setNewSectionInput('');
    setIsCategoryDropdownOpen(false);

    // Prefill sections in correct order.
    try {
      const secs = await apiFetch(`/projects/${p.id}/sections`, {
        headers: { 'x-org-id': orgId },
      });
      const ordered = (secs as Array<{ id: string; name: string; order?: number }>).sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0),
      );
      setNewProjectSections(
        ordered.map((s) => ({ id: s.id, name: s.name })),
      );
    } catch (err: any) {
      setCreateError(err.message || 'Failed to load project sections');
      return;
    }

    setShowProjectModal(true);
  };

  const handleSubmitProjectModal = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newProjectName.trim();
    if (!trimmedName) {
      setCreateError('Project name is required.');
      return;
    }

    const cleanedSections = newProjectSections
      .map((section) => section.name.trim())
      .filter((section) => section.length > 0);

    if (cleanedSections.length === 0) {
      setCreateError('At least one section is required.');
      return;
    }

    const uniqueSections = new Set(
      cleanedSections.map((section) => section.toLowerCase()),
    );
    if (uniqueSections.size !== cleanedSections.length) {
      setCreateError('Section names must be unique.');
      return;
    }

    setCreating(true);
    setCreateError('');

    try {
      if (projectModalMode === 'create') {
        const created = await apiFetch('/projects', {
          method: 'POST',
          headers: { 'x-org-id': orgId },
          body: JSON.stringify({
            name: trimmedName,
            description: newProjectDescription.trim() || undefined,
            category: newProjectCategory.trim() || undefined,
            status: newProjectStatus,
            sections: cleanedSections.map((section) => ({ name: section })),
          }),
        });

        const createdProjectId = (created as any)?.id;
        if (createdProjectId) {
          window.dispatchEvent(
            new CustomEvent('project:sections-updated', {
              detail: { projectId: createdProjectId },
            }),
          );
        }
      } else {
        if (!editingProjectId) {
          throw new Error('Missing project id for edit');
        }

        const updated = await apiFetch(`/projects/${editingProjectId}`, {
          method: 'PATCH',
          headers: { 'x-org-id': orgId },
          body: JSON.stringify({
            name: trimmedName,
            description: newProjectDescription.trim() || undefined,
            category: newProjectCategory.trim() || undefined,
            status: newProjectStatus,
            sections: newProjectSections.map((s) => ({
              id: s.id,
              name: s.name.trim(),
            })),
          }),
        });

        const updatedProjectId = (updated as any)?.id ?? editingProjectId;
        if (updatedProjectId) {
          window.dispatchEvent(
            new CustomEvent('project:sections-updated', {
              detail: { projectId: updatedProjectId },
            }),
          );
        }
      }

      setShowProjectModal(false);
      setEditingProjectId(null);
      resetProjectModalFieldsForCreate();
      await loadProjects();
    } catch (err: any) {
      setCreateError(
        err.message ||
          (projectModalMode === 'create'
            ? 'Failed to create project'
            : 'Failed to update project'),
      );
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteProject = async (p: Project) => {
    setOpenMenuId(null);
    const confirmed = window.confirm(
      `Are you sure you want to delete "${p.name}"? This action cannot be undone.`,
    );
    if (!confirmed) return;
    try {
      await apiFetch(`/projects/${p.id}`, { method: 'DELETE', headers: { 'x-org-id': orgId } });
      await loadProjects();
    } catch (err: any) {
      alert(err.message || 'Failed to delete project');
    }
  };

  const handleAddSection = () => {
    const trimmed = newSectionInput.trim();
    if (!trimmed) {
      setNewSectionInput('');
      return;
    }
    if (
      newProjectSections.some(
        (section) => section.name.trim().toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      setCreateError('Section names must be unique.');
      return;
    }
    setCreateError('');
    setNewProjectSections((prev) => [
      ...prev,
      {
        id: `section-${Math.random().toString(36).slice(2, 9)}`,
        name: trimmed,
      },
    ]);
    setNewSectionInput('');
  };

  const handleRemoveSection = (index: number) => {
    setCreateError('');
    setNewProjectSections((prev) => prev.filter((_, i) => i !== index));
  };

  const handleChangeSection = (index: number, value: string) => {
    setCreateError('');
    setNewProjectSections((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, name: value } : item,
      ),
    );
  };

  const handleSectionBlur = (index: number) => {
    setNewProjectSections((prev) => {
      const raw = prev[index]?.name;
      if (raw === undefined) return prev;
      const trimmed = raw.trim();

      // Empty edited rows are removed instead of leaving broken blank rows.
      if (!trimmed) {
        return prev.filter((_, i) => i !== index);
      }

      return prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, name: trimmed } : item,
      );
    });
  };

  const handleDragStartSection = (sectionId: string) => {
    setDraggingSectionId(sectionId);
  };

  const handleDropSection = (targetSectionId: string) => {
    if (!draggingSectionId || draggingSectionId === targetSectionId) {
      setDraggingSectionId(null);
      return;
    }

    setNewProjectSections((prev) => {
      const fromIndex = prev.findIndex((s) => s.id === draggingSectionId);
      const toIndex = prev.findIndex((s) => s.id === targetSectionId);
      if (fromIndex === -1 || toIndex === -1) return prev;

      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });

    setDraggingSectionId(null);
  };

  return (
    <>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
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
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '16px clamp(12px, 3vw, 24px) 28px',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: 18,
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: 21,
                  fontWeight: 600,
                  margin: 0,
                  color: '#111827',
                }}
              >
                Projects
              </h1>
              <p
                style={{
                  marginTop: 4,
                  fontSize: '13px',
                  color: '#6b7280',
                }}
              >
                Manage and track high-level initiatives.
              </p>
            </div>
            <PrimaryActionButton label="New Project" onClick={handleOpenCreateModal} />
          </div>

          {error && (
            <div
              style={{
                marginBottom: '12px',
                padding: '10px',
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

          {/* Search + filters */}
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:px-5">
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <svg
                  width={16}
                  height={16}
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle
                    cx={7.5}
                    cy={7.5}
                    r={3.5}
                    stroke="#9ca3af"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M10.3 10.3L12.5 12.5"
                    stroke="#9ca3af"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-[13px] text-slate-900 outline-none transition focus:border-slate-900 focus:bg-white focus:ring-1 focus:ring-slate-900 placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Projects grid */}
          {loading ? (
            <p style={{ color: '#6b7280', fontSize: 13 }}>Loading…</p>
          ) : projects.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: 13 }}>No projects yet.</p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
                columnGap: 22,
                rowGap: 18,
              }}
            >
              {projects
                .filter((p) => {
                  const q = searchQuery.trim().toLowerCase();
                  if (!q) return true;
                  const nameMatch = p.name.toLowerCase().includes(q);
                  const descMatch = (p.description ?? '').toLowerCase().includes(q);
                  return nameMatch || descMatch;
                })
                .map((p) => {
                const status = (p.status as string | null) ?? 'Onboarding';

                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/org/${orgId}/tasks?projectId=${p.id}&view=board`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') router.push(`/org/${orgId}/tasks?projectId=${p.id}&view=board`);
                    }}
                    style={{
                      textAlign: 'left',
                      borderRadius: 20,
                      border: '1px solid #e5e7eb',
                      backgroundColor: '#ffffff',
                      boxShadow: '0 16px 36px rgba(15,23,42,0.06)',
                      padding: '14px 16px 14px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div
                        className="text-slate-900 dark:text-neutral-100"
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 12,
                          backgroundColor: '#f3f4f6',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <FolderKanban size={16} color="currentColor" />
                      </div>
                      <ProjectCardMenu
                        project={p}
                        isOpen={openMenuId === p.id}
                        onToggle={() => setOpenMenuId(openMenuId === p.id ? null : p.id)}
                        onEdit={() => handleOpenEdit(p)}
                        onDelete={() => handleDeleteProject(p)}
                        onClose={() => setOpenMenuId(null)}
                      />
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <h2
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          margin: 0,
                          color: '#111827',
                        }}
                      >
                        {p.name}
                      </h2>
                      {p.description && (
                        <p
                          style={{
                            marginTop: 4,
                            fontSize: 12,
                            color: '#6b7280',
                          }}
                        >
                          {p.description}
                        </p>
                      )}
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 500,
                          color: '#9ca3af',
                          marginBottom: 4,
                        }}
                      >
                        STATUS
                      </div>
                      <ProjectStatusBadge status={status} />
                    </div>
                    <div
                      style={{
                        marginTop: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        gap: 10,
                        fontSize: 11,
                        color: '#9ca3af',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Users size={13} />
                          <span>4</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
                })}
              {projects.length > 0 &&
                projects.filter((p) => {
                  const q = searchQuery.trim().toLowerCase();
                  if (!q) return true;
                  const nameMatch = p.name.toLowerCase().includes(q);
                  const descMatch = (p.description ?? '').toLowerCase().includes(q);
                  return nameMatch || descMatch;
                }).length === 0 && (
                  <p style={{ color: '#6b7280', fontSize: 13 }}>No projects found.</p>
                )}
            </div>
          )}
        </div>
      </div>
      {showProjectModal && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/30 px-4"
          onClick={handleCloseProjectModal}
        >
          <div
            className="max-h-[90vh] w-full max-w-[760px] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
              <h2 className="text-[20px] font-semibold text-slate-900 sm:text-[24px]">
                {projectModalMode === 'create'
                  ? 'Create New Project'
                  : 'Edit Project'}
              </h2>
              <button
                type="button"
                onClick={handleCloseProjectModal}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close create project modal"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSubmitProjectModal} className="px-4 pb-4 pt-3 sm:px-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <div>
                    <label htmlFor="project-name" className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-400">
                      Project Name
                    </label>
                    <input
                      id="project-name"
                      type="text"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder="e.g. Nexus Redesign"
                      className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-900 outline-none transition focus:border-slate-300"
                    />
                  </div>
                  <div>
                    <label htmlFor="project-description" className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-400">
                      Description
                    </label>
                    <textarea
                      id="project-description"
                      value={newProjectDescription}
                      onChange={(e) => setNewProjectDescription(e.target.value)}
                      rows={3}
                      placeholder="What is this project about?"
                      className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-900 outline-none transition focus:border-slate-300"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="project-category" className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-400">
                        Category
                      </label>
                      <div ref={categoryDropdownRef} className="relative">
                        <button
                          id="project-category"
                          type="button"
                          onClick={() => setIsCategoryDropdownOpen((prev) => !prev)}
                          className="inline-flex h-9 w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] font-medium text-slate-700 shadow-sm outline-none transition-colors duration-150 hover:bg-slate-100"
                          aria-haspopup="listbox"
                          aria-expanded={isCategoryDropdownOpen}
                        >
                          <span>{newProjectCategory}</span>
                          <ChevronDown size={14} className="text-slate-400" />
                        </button>
                        {isCategoryDropdownOpen && (
                          <div className="absolute left-0 top-[calc(100%+6px)] z-20 w-full rounded-2xl border border-slate-100 bg-white p-1.5 shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
                            {PROJECT_CATEGORY_OPTIONS.map((option) => {
                              const isActive = option === newProjectCategory;
                              return (
                                <button
                                  key={option}
                                  type="button"
                                  role="option"
                                  aria-selected={isActive}
                                  onClick={() => {
                                    setNewProjectCategory(option);
                                    setIsCategoryDropdownOpen(false);
                                  }}
                                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] transition-colors ${
                                    isActive
                                      ? 'bg-slate-50 font-medium text-slate-900'
                                      : 'text-slate-700 hover:bg-slate-50'
                                  }`}
                                >
                                  <span>{option}</span>
                                  {isActive ? <Check size={14} className="text-slate-500" /> : null}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-400">
                        Status
                      </label>
                      <div className="relative">
                        <select
                          value={newProjectStatus}
                          onChange={(e) =>
                            setNewProjectStatus(
                              e.target.value as
                                | 'Onboarding'
                                | 'Established'
                                | 'On Hold'
                                | 'Terminated',
                            )
                          }
                          className="h-9 w-full rounded-full border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-slate-300 focus:ring-0"
                        >
                          {PROJECT_STATUS_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-400">
                      Project Sections
                    </label>
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-100 px-1.5 text-[10px] font-semibold text-blue-600">
                      {newProjectSections.filter((section) => section.name.trim()).length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {newProjectSections.map((section, index) => (
                      <div
                        key={section.id}
                        className={`flex items-center gap-2 rounded-md ${
                          draggingSectionId === section.id ? 'opacity-70' : ''
                        }`}
                        onDragOver={(e) => {
                          e.preventDefault();
                        }}
                        onDrop={() => handleDropSection(section.id)}
                      >
                        <span
                          className="cursor-grab text-slate-300 active:cursor-grabbing"
                          draggable
                          onDragStart={() => handleDragStartSection(section.id)}
                          onDragEnd={() => setDraggingSectionId(null)}
                          title="Drag to reorder"
                        >
                          <GripVertical size={13} />
                        </span>
                        <input
                          type="text"
                          value={section.name}
                          onChange={(e) => handleChangeSection(index, e.target.value)}
                          onBlur={() => handleSectionBlur(index)}
                          className="h-9 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-900 outline-none transition focus:border-slate-300"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveSection(index)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
                          aria-label={`Remove section ${section.name || index + 1}`}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2">
                      <span className="text-slate-300">
                        <GripVertical size={13} />
                      </span>
                      <input
                        type="text"
                        placeholder="Add section..."
                        value={newSectionInput}
                        onChange={(e) => setNewSectionInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddSection();
                          }
                        }}
                        className="h-9 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-900 outline-none transition focus:border-slate-300"
                      />
                      <button
                        type="button"
                        onClick={handleAddSection}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-slate-100"
                        aria-label="Add section"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="pt-1">
                    <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-400">
                      Templates (Coming Soon)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-400"
                      >
                        Kanban Board
                      </button>
                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-400"
                      >
                        Scrum Sprint
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {createError && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">
                  {createError}
                </div>
              )}
              <div className="mt-4 border-t border-slate-200" />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseProjectModal}
                  disabled={creating}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-slate-500 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-slate-600 disabled:opacity-50"
                >
                  {creating
                    ? projectModalMode === 'create'
                      ? 'Creating…'
                      : 'Saving…'
                    : projectModalMode === 'create'
                      ? 'Create Project'
                      : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </>
  );
}

function ProjectCardMenu({
  project,
  isOpen,
  onToggle,
  onEdit,
  onDelete,
  onClose,
}: {
  project: Project;
  isOpen: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose]);

  return (
    <div
      ref={ref}
      style={{ position: 'relative' }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={onToggle}
        className={[
          'flex items-center justify-center w-[28px] h-[28px] rounded-full',
          'cursor-pointer transition-colors duration-150',
          isOpen
            ? 'bg-[#f3f4f6] dark:bg-neutral-800'
            : 'bg-transparent hover:bg-[#f3f4f6] dark:hover:bg-neutral-700',
          'text-[#6b7280] dark:text-neutral-200',
        ].join(' ')}
      >
        <MoreHorizontal size={15} />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-[100%] mt-[4px] z-50 min-w-[150px] rounded-[12px] border border-[#e5e7eb] bg-white py-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)] dark:border-neutral-700 dark:bg-[#202020]"
        >
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-2 w-full px-3 py-2 text-[13px] cursor-pointer text-left text-[#374151] transition-colors hover:bg-[#f9fafb] dark:text-neutral-100 dark:hover:bg-neutral-800 dark:rounded-lg"
          >
            <Pencil size={14} />
            Edit project
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-2 w-full px-3 py-2 text-[13px] cursor-pointer text-left text-red-600 transition-colors hover:bg-[#fef2f2] dark:text-rose-300 dark:hover:bg-neutral-800 dark:rounded-lg"
          >
            <Trash2 size={14} />
            Delete project
          </button>
        </div>
      )}
    </div>
  );
}
