'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { apiFetch, apiFetchFormData, API_BASE_URL } from '../../lib/api';
import { mapOrgMember } from '../../lib/map-org-member';
import { getToken } from '../../lib/auth';
import { useAuth } from '../../contexts/AuthContext';
import { UserAvatar } from '../ui/UserAvatar';
import { History, ExternalLink, MoreHorizontal, ChevronRight, Calendar, Check, ArrowLeft, Trash2 } from 'lucide-react';

interface TaskAssignee {
  id: string;
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

interface ProjectSection {
  id: string;
  name: string;
  order?: number;
}

interface OrgMember {
  id: string;
  email: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}

interface CommentStoryMetadata {
  mentions?: string[];
}

interface Story {
  id: string;
  type: 'COMMENT' | 'ACTIVITY';
  body?: string | null;
  metadata?: CommentStoryMetadata | null;
  createdAt: string;
   createdById?: string;
  createdBy?: {
    id: string;
    email: string;
    displayName?: string | null;
  } | null;
}

interface MentionUser {
  id: string;
  displayName: string;
}

interface TaskAttachment {
  id: string;
  taskId: string;
  orgId: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string | null;
  fileSize?: number | null;
  uploadedById?: string | null;
  createdAt: string;
}

export interface TaskDrawerTask {
  id: string;
  title: string;
  description?: string | null;
  priority?: string | null;
  dueDate?: string | null;
  projectId: string;
  projectName?: string | null;
  project?: {
    id: string;
    name: string;
  } | null;
  sectionId: string;
  parentId?: string | null;
  assignees: TaskAssignee[];
}

interface Subtask {
  id: string;
  title: string;
  priority?: string | null;
  dueDate?: string | null;
  projectId: string;
  projectName?: string | null;
  project?: {
    id: string;
    name: string;
  } | null;
  sectionId: string;
  parentId: string | null;
  section?: {
    id: string;
    name: string;
  } | null;
  assignees: TaskAssignee[];
}

interface TaskDrawerProps {
  orgId: string;
  task: TaskDrawerTask;
  onClose: () => void;
  onUpdated?: (updated: TaskDrawerTask) => Promise<void> | void;
  onDeleted?: () => Promise<void> | void;
  /** When user clicks a subtask row, open that subtask in the drawer (parent sets activeTask) */
  onOpenTask?: (task: TaskDrawerTask) => void;
  /** When viewing a subtask, go back to parent task (parent pops task stack) */
  onBackToParent?: () => void;
  /** Optional title of the parent task when viewing a subtask (from existing state) */
  parentTaskTitle?: string;
}

export function TaskDrawer({
  orgId,
  task,
  onClose,
  onUpdated,
  onDeleted,
  onOpenTask,
  onBackToParent,
  parentTaskTitle,
}: TaskDrawerProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [parentTask, setParentTask] = useState<TaskDrawerTask | null>(null);
  const [parentLoading, setParentLoading] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [dueDate, setDueDate] = useState(
    task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '',
  );
  const [sectionId, setSectionId] = useState(task.sectionId);
  const [assigneeId, setAssigneeId] = useState(task.assignees?.[0]?.id ?? '');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>(
    (task.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT') ?? 'MEDIUM',
  );
  const [description, setDescription] = useState(task.description ?? '');
  const [saving, setSaving] = useState(false);

  const [sections, setSections] = useState<ProjectSection[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [posting, setPosting] = useState(false);

  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResults, setMentionResults] = useState<MentionUser[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [activeMentions, setActiveMentions] = useState<MentionUser[]>([]);
  const [mentionDropdownRect, setMentionDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const mentionDebounceRef = useRef<number | null>(null);
  const commentTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [subtasksLoading, setSubtasksLoading] = useState(false);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const projectName = task.projectName ?? task.project?.name ?? null;

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? '');
    setDueDate(task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '');
    setSectionId(task.sectionId);
    setAssigneeId(task.assignees?.[0]?.id ?? '');

    // reset parent info when the focused task changes
    setParentTask(null);
    setParentLoading(false);
  }, [task]);

  // Resolve parent task (title and data) when viewing a subtask
  useEffect(() => {
    if (!task.parentId) return;

    // If parent title is already provided from page state, we can rely on onBackToParent for navigation
    if (parentTaskTitle) {
      return;
    }

    // Otherwise, fetch parent task minimally so we can show its title and open it via onOpenTask
    let cancelled = false;
    const loadParent = async () => {
      try {
        setParentLoading(true);
        const data = await apiFetch(`/tasks/${task.parentId}`, {
          headers: { 'x-org-id': orgId },
        });
        if (!cancelled) {
          setParentTask(data as TaskDrawerTask);
        }
      } catch {
        if (!cancelled) {
          setParentTask(null);
        }
      } finally {
        if (!cancelled) {
          setParentLoading(false);
        }
      }
    };

    void loadParent();

    return () => {
      cancelled = true;
    };
  }, [orgId, task.parentId, parentTaskTitle]);

  const resolvedParentTitle = parentTaskTitle ?? parentTask?.title ?? '';

  const handleParentClick = () => {
    // If we have a back handler (parent in stack) and a title from state, use that
    if (onBackToParent && parentTaskTitle) {
      onBackToParent();
      return;
    }
    // Otherwise, if we fetched the parent task, open it via onOpenTask
    if (onOpenTask && parentTask) {
      onOpenTask(parentTask);
    }
  };

  // Detect active "@query" near the cursor in the comment textarea.
  const detectMentionQuery = (value: string, cursor: number) => {
    if (cursor <= 0) return null;

    const slice = value.slice(0, cursor);
    let atIndex = slice.lastIndexOf('@');
    if (atIndex === -1) return null;

    // Ensure "@" starts a word (start of string or after whitespace)
    if (atIndex > 0) {
      const prev = slice[atIndex - 1];
      if (prev !== ' ' && prev !== '\n' && prev !== '\t') {
        return null;
      }
    }

    const query = slice.slice(atIndex + 1);
    // Stop if query has whitespace or is empty
    if (!query || /\s/.test(query)) return null;

    return { query, start: atIndex, end: cursor };
  };

  // Keep active mentions in sync with comment body (MVP: based on displayName presence).
  useEffect(() => {
    if (activeMentions.length === 0 || !commentBody) return;
    setActiveMentions((prev) =>
      prev.filter((m) => commentBody.includes(`@${m.displayName}`)),
    );
  }, [commentBody]);

  // Measure textarea position for portal dropdown when mention query is active (viewport coords for position: fixed)
  const updateMentionDropdownRect = useCallback(() => {
    const el = commentTextareaRef.current;
    if (!el || !mentionQuery) {
      setMentionDropdownRect(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    setMentionDropdownRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 220),
    });
  }, [mentionQuery]);

  useEffect(() => {
    if (!mentionQuery) {
      setMentionDropdownRect(null);
      return;
    }
    const raf = requestAnimationFrame(() => updateMentionDropdownRect());
    const onScrollOrResize = () => updateMentionDropdownRect();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [mentionQuery, updateMentionDropdownRect]);

  // Debounced search for mention suggestions.
  useEffect(() => {
    if (!mentionQuery || mentionQuery.length < 1) {
      setMentionResults([]);
      setMentionLoading(false);
      return;
    }

    if (mentionDebounceRef.current) {
      window.clearTimeout(mentionDebounceRef.current);
    }

    mentionDebounceRef.current = window.setTimeout(async () => {
      try {
        setMentionLoading(true);
        const results = await apiFetch(
          `/users/search?q=${encodeURIComponent(mentionQuery)}`,
          {
            headers: { 'x-org-id': orgId },
          },
        );
        setMentionResults(
          (results as any[]).map((u) => ({
            id: u.id,
            displayName: u.displayName as string,
          })),
        );
      } catch {
        setMentionResults([]);
      } finally {
        setMentionLoading(false);
      }
    }, 200);

    return () => {
      if (mentionDebounceRef.current) {
        window.clearTimeout(mentionDebounceRef.current);
      }
    };
  }, [mentionQuery, orgId]);

  useEffect(() => {
    const loadMeta = async () => {
      try {
        const [sectionsData, membersData] = await Promise.all([
          apiFetch(`/projects/${task.projectId}/sections`),
          apiFetch(`/orgs/${orgId}/members`),
        ]);
        setSections(sectionsData as ProjectSection[]);
        setMembers((membersData as any[]).map((m) => mapOrgMember(m)));
      } catch {
        // ignore, drawer will just have empty selects
      }
    };

    const loadStories = async () => {
      try {
        setStoriesLoading(true);
        const data = await apiFetch(`/tasks/${task.id}/stories`, {
          headers: { 'x-org-id': orgId },
        });
        setStories(data as Story[]);
      } catch {
        // ignore for now
      } finally {
        setStoriesLoading(false);
      }
    };

    const loadSubtasks = async () => {
      try {
        setSubtasksLoading(true);
        const data = await apiFetch(`/tasks/${task.id}/subtasks`, {
          headers: { 'x-org-id': orgId },
        });
        setSubtasks(data as Subtask[]);
      } catch {
        // ignore for now
      } finally {
        setSubtasksLoading(false);
      }
    };

    const loadAttachments = async () => {
      try {
        setAttachmentsLoading(true);
        const data = await apiFetch(`/tasks/${task.id}/attachments`, {
          headers: { 'x-org-id': orgId },
        });
        setAttachments(data as TaskAttachment[]);
      } catch {
        // ignore for now
      } finally {
        setAttachmentsLoading(false);
      }
    };

    void loadMeta();
    void loadStories();
    void loadSubtasks();
    void loadAttachments();
  }, [orgId, task.id, task.projectId]);

  // If the project's sections were edited/reordered (Create/Edit Project),
  // refresh sections so the Status dropdown doesn't show stale options.
  useEffect(() => {
    const handler = (event: Event) => {
      const ce = event as CustomEvent<{ projectId?: string }>;
      const updatedProjectId = ce.detail?.projectId;
      if (!updatedProjectId || updatedProjectId !== task.projectId) return;
      void (async () => {
        try {
          const sectionsData = await apiFetch(`/projects/${task.projectId}/sections`);
          setSections(sectionsData as ProjectSection[]);
        } catch {
          // ignore
        }
      })();
    };

    window.addEventListener('project:sections-updated', handler);
    return () =>
      window.removeEventListener('project:sections-updated', handler);
  }, [task.projectId]);

  const applyResponse = useCallback((res: TaskDrawerTask) => {
    setTitle(res.title);
    setDescription(res.description ?? '');
    setPriority((res.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT') ?? 'MEDIUM');
    setDueDate(res.dueDate ? new Date(res.dueDate).toISOString().slice(0, 10) : '');
    setSectionId(res.sectionId);
    setAssigneeId(res.assignees?.[0]?.id ?? '');
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const body: any = {};

    if (title.trim() && title.trim() !== task.title) {
      body.title = title.trim();
    }
    if (description !== (task.description ?? '')) {
      body.description = description;
    }
    body.dueDate = dueDate || '';
    body.priority = priority;
    if (sectionId && sectionId !== task.sectionId) {
      body.sectionId = sectionId;
    }
    body.assigneeUserId = assigneeId || '';

    try {
      const updated = await apiFetch(`/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'x-org-id': orgId },
        body: JSON.stringify(body),
      });
      const res = updated as TaskDrawerTask;
      applyResponse(res);
      if (onUpdated) {
        await onUpdated(res);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update task');
    } finally {
      setSaving(false);
    }
  };

  const saveField = useCallback(
    async (patch: Record<string, string>) => {
      try {
        const updated = await apiFetch(`/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'x-org-id': orgId },
          body: JSON.stringify(patch),
        });
        const res = updated as TaskDrawerTask;
        applyResponse(res);
        if (onUpdated) {
          await onUpdated(res);
        }
      } catch (err: any) {
        alert(err.message || 'Failed to update task');
      }
    },
    [task.id, orgId, onUpdated, applyResponse],
  );

  const handleDelete = async () => {
    const confirmed = window.confirm('Delete this task?');
    if (!confirmed) return;
    try {
      await apiFetch(`/tasks/${task.id}`, {
        method: 'DELETE',
        headers: { 'x-org-id': orgId },
      });
      if (onDeleted) {
        await onDeleted();
      }
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to delete task');
    }
  };

  const handlePostComment = async () => {
    const body = commentBody.trim();
    if (!body) return;
    setPosting(true);
    try {
      const mentions = Array.from(
        new Set(activeMentions.map((m) => m.id)),
      );

      const story = await apiFetch(`/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: { 'x-org-id': orgId },
        body: JSON.stringify({ body, mentions }),
      });
      setStories((prev) => [story as Story, ...prev]);
      setCommentBody('');
      setMentionQuery('');
      setMentionResults([]);
      setActiveMentions([]);
      // Trigger a refresh so pages relying on /notifications re-fetch
      router.refresh();
    } catch (err: any) {
      alert(err.message || 'Failed to post comment');
    } finally {
      setPosting(false);
    }
  };

  const handleChangeCommentBody: React.ChangeEventHandler<HTMLTextAreaElement> = (
    e,
  ) => {
    const newValue = e.target.value;
    setCommentBody(newValue);
    const cursor = e.target.selectionStart ?? newValue.length;
    const info = detectMentionQuery(newValue, cursor);
    if (info) {
      setMentionQuery(info.query);
    } else {
      setMentionQuery('');
      setMentionResults([]);
    }
  };

  const handleSaveEditedComment = async () => {
    if (!editingCommentId) return;
    const body = editingCommentBody.trim();
    if (!body) return;
    setSavingComment(true);
    try {
      const updated = await apiFetch(
        `/tasks/${task.id}/comments/${editingCommentId}`,
        {
          method: 'PATCH',
          headers: { 'x-org-id': orgId },
          body: JSON.stringify({ body }),
        },
      );
      setStories((prev) =>
        prev.map((s) => (s.id === editingCommentId ? (updated as Story) : s)),
      );
      setEditingCommentId(null);
      setEditingCommentBody('');
    } catch (err: any) {
      alert(err.message || 'Failed to update comment');
    } finally {
      setSavingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    const confirmed = window.confirm('Delete this comment?');
    if (!confirmed) return;
    try {
      await apiFetch(`/tasks/${task.id}/comments/${commentId}`, {
        method: 'DELETE',
        headers: { 'x-org-id': orgId },
      });
      setStories((prev) => prev.filter((s) => s.id !== commentId));
      if (editingCommentId === commentId) {
        setEditingCommentId(null);
        setEditingCommentBody('');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete comment');
    }
  };

  const handleStartEditComment = (story: Story) => {
    setEditingCommentId(story.id);
    setEditingCommentBody(story.body ?? '');
  };

  const handleCancelEditComment = () => {
    setEditingCommentId(null);
    setEditingCommentBody('');
  };

  const handleChangeEditingCommentBody: React.ChangeEventHandler<
    HTMLTextAreaElement
  > = (e) => {
    setEditingCommentBody(e.target.value);
  };

  const handleSelectMentionUser = (u: MentionUser) => {
    const textarea = commentTextareaRef.current;
    if (!textarea) return;

    const current = commentBody;
    const cursor = textarea.selectionStart ?? current.length;
    const info = detectMentionQuery(current, cursor);
    if (!info) {
      setMentionQuery('');
      setMentionResults([]);
      return;
    }

    const before = current.slice(0, info.start);
    const after = current.slice(info.end);
    const insertText = `@${u.displayName}`;
    const next = `${before}${insertText}${after}`;
    setCommentBody(next);
    setMentionQuery('');
    setMentionResults([]);

    setActiveMentions((prev) => {
      if (prev.some((m) => m.id === u.id)) return prev;
      return [...prev, u];
    });

    const newCursor = (before + insertText).length;
    requestAnimationFrame(() => {
      textarea.selectionStart = newCursor;
      textarea.selectionEnd = newCursor;
      textarea.focus();
    });
  };

  const handleUploadAttachment: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const created = await apiFetchFormData(`/tasks/${task.id}/attachments`, formData, {
        headers: { 'x-org-id': orgId },
      });
      setAttachments((prev) => [created as TaskAttachment, ...prev]);
      // reset input so selecting the same file again still triggers change
      e.target.value = '';
    } catch (err: any) {
      alert(err.message || 'Failed to upload attachment');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    const confirmed = window.confirm('Delete this file?');
    if (!confirmed) return;
    try {
      await apiFetch(`/tasks/${task.id}/attachments/${attachmentId}`, {
        method: 'DELETE',
        headers: { 'x-org-id': orgId },
      });
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    } catch (err: any) {
      alert(err.message || 'Failed to delete attachment');
    }
  };

  const getDownloadUrl = (attachment: TaskAttachment) => {
    if (attachment.fileUrl) {
      // If it's a relative URL (e.g. /uploads/... or /tasks/...),
      // prefix with API base so we hit the API server, not Next.js.
      if (attachment.fileUrl.startsWith('http')) {
        return attachment.fileUrl;
      }
      return `${API_BASE_URL}${attachment.fileUrl}`;
    }
    return `${API_BASE_URL}/tasks/${task.id}/attachments/${attachment.id}/download`;
  };

  const handleDownloadAttachment = async (attachment: TaskAttachment) => {
    try {
      const token = getToken();
      const url = `${API_BASE_URL}/tasks/${task.id}/attachments/${attachment.id}/download`;

      const response = await fetch(url, {
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : undefined,
      });

      if (!response.ok) {
        throw new Error(`Download failed (HTTP ${response.status})`);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = attachment.fileName || 'attachment';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      alert(err?.message || 'Failed to download attachment');
    }
  };

  const handleOpenSubtask = (subtask: Subtask) => {
    onOpenTask?.(subtask);
  };

  const handleDeleteSubtask = async (subtask: Subtask) => {
    const confirmed = window.confirm('Delete this subtask?');
    if (!confirmed) return;
    try {
      await apiFetch(`/tasks/${subtask.id}`, {
        method: 'DELETE',
        headers: { 'x-org-id': orgId },
      });
      setSubtasks((prev) => prev.filter((t) => t.id !== subtask.id));
      if (onUpdated) await onUpdated(task);
    } catch (err: any) {
      alert(err.message || 'Failed to delete subtask');
    }
  };

  const handleToggleSubtask = async (subtask: Subtask, done: boolean) => {
    const doneSection = sections.find((s) =>
      s.name.toLowerCase().includes('done'),
    );
    const defaultSection = sections.find(
      (s) =>
        s.name.toLowerCase().includes('todo') ||
        s.name.toLowerCase() === 'to do',
    ) ?? sections.find((s) => !s.name.toLowerCase().includes('done'));

    const targetSection = done ? doneSection : defaultSection;
    if (!targetSection) return;

    // Optimistic local update
    setSubtasks((prev) =>
      prev.map((s) =>
        s.id === subtask.id
          ? { ...s, sectionId: targetSection.id, section: { id: targetSection.id, name: targetSection.name } }
          : s,
      ),
    );

    try {
      const updated = await apiFetch(`/tasks/${subtask.id}`, {
        method: 'PATCH',
        headers: { 'x-org-id': orgId },
        body: JSON.stringify({ sectionId: targetSection.id }),
      });
      const res = updated as TaskDrawerTask;

      // Sync local subtask with authoritative response
      setSubtasks((prev) =>
        prev.map((s) =>
          s.id === subtask.id
            ? {
                ...s,
                sectionId: res.sectionId,
                section: (res as any).section ?? { id: res.sectionId, name: targetSection.name },
                title: res.title,
                dueDate: res.dueDate ?? null,
                assignees: res.assignees ?? s.assignees,
              }
            : s,
        ),
      );

      if (onUpdated) await onUpdated(res);
    } catch (err: any) {
      // Revert optimistic update
      setSubtasks((prev) =>
        prev.map((s) =>
          s.id === subtask.id
            ? { ...s, sectionId: subtask.sectionId, section: subtask.section }
            : s,
        ),
      );
      alert(err.message || 'Failed to update subtask');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end bg-black/40"
      onClick={onClose}
    >
      <div
        className="pointer-events-auto flex h-full w-full max-w-[540px] flex-col overflow-hidden border-l border-slate-100 bg-white shadow-[0_0_40px_rgba(15,23,42,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
          <TaskDrawerHeader
            task={task}
            orgId={orgId}
            projectName={projectName}
            title={title}
            saving={saving}
            parentLoading={parentLoading}
            resolvedParentTitle={resolvedParentTitle}
            onTitleChange={(value) => setTitle(value)}
            onParentClick={handleParentClick}
            onSave={handleSave}
            onDelete={handleDelete}
            onClose={onClose}
          />
          <TaskDrawerMetaForm
            title={title}
            dueDate={dueDate}
            sectionId={sectionId}
            assigneeId={assigneeId}
            priority={priority}
            sections={sections}
            members={members}
            saving={saving}
            onChangeTitle={(value) => setTitle(value)}
            onChangeDueDate={(value) => setDueDate(value)}
            onChangeSectionId={(value) => setSectionId(value)}
            onChangeAssigneeId={(value) => setAssigneeId(value)}
            onChangePriority={(value) => setPriority(value)}
            onSaveField={saveField}
            onSave={handleSave}
            onDelete={handleDelete}
            onClose={onClose}
          />

          {/* Description */}
          <TaskDrawerDescriptionSection
            description={description}
            onChange={(value) => setDescription(value)}
            onSave={handleSave}
          />

          {/* Subtasks — only for top-level tasks (hide when viewing a subtask) */}
          {!task.parentId && (
            <TaskDrawerSubtasksSection
              task={task}
              subtasks={subtasks}
              subtasksLoading={subtasksLoading}
              sections={sections}
              members={members}
              orgId={orgId}
              onOpenSubtask={handleOpenSubtask}
              onDeleteSubtask={handleDeleteSubtask}
              onSubtaskCreated={(created) =>
                setSubtasks((prev) => [...prev, created])
              }
              onPageTaskCreated={onUpdated}
              onToggleSubtask={handleToggleSubtask}
            />
          )}

          {/* Attachments */}
          <TaskDrawerAttachmentsSection
            uploading={uploading}
            attachmentsLoading={attachmentsLoading}
            attachments={attachments}
            onUpload={handleUploadAttachment}
            onDownload={handleDownloadAttachment}
            onDelete={handleDeleteAttachment}
            getDownloadUrl={getDownloadUrl}
          />

          {/* Comment messages */}
          <TaskDrawerCommentsList
            user={user}
            stories={stories}
            editingCommentId={editingCommentId}
            editingCommentBody={editingCommentBody}
            savingComment={savingComment}
            onStartEditComment={handleStartEditComment}
            onCancelEditComment={handleCancelEditComment}
            onChangeEditingCommentBody={handleChangeEditingCommentBody}
            onSaveEditedComment={handleSaveEditedComment}
            onDeleteComment={handleDeleteComment}
          />

        </div>

        <TaskDrawerCommentInput
          user={user}
          commentBody={commentBody}
          mentionQuery={mentionQuery}
          mentionResults={mentionResults}
          mentionDropdownRect={mentionDropdownRect}
          mentionLoading={mentionLoading}
          commentTextareaRef={commentTextareaRef}
          onChangeCommentBody={handleChangeCommentBody}
          onPostComment={handlePostComment}
          onSelectMentionUser={handleSelectMentionUser}
          posting={posting}
        />
      </div>
    </div>
  );
}

interface TaskDrawerDescriptionSectionProps {
  description: string;
  onChange: (value: string) => void;
  onSave: () => void;
}

function TaskDrawerDescriptionSection({
  description,
  onChange,
  onSave,
}: TaskDrawerDescriptionSectionProps) {
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.selectionStart = len;
      textareaRef.current.selectionEnd = len;
    }
  }, [editing]);

  const handleBlur = () => {
    setEditing(false);
    onSave();
  };

  return (
    <section className="mt-8">
      <h3 className="mb-3 text-[14px] font-semibold text-slate-800">
        Description
      </h3>
      {editing ? (
        <textarea
          ref={textareaRef}
          value={description}
          onChange={(e) => onChange(e.target.value)}
          onBlur={handleBlur}
          rows={4}
          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13px] leading-relaxed text-slate-700 outline-none transition-colors duration-150 placeholder:text-slate-400 focus:border-slate-300 focus:ring-0"
          placeholder="Add a description..."
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full cursor-text rounded-lg px-3 py-2.5 text-left text-[13px] leading-relaxed transition-colors duration-150 hover:bg-slate-50"
        >
          {description ? (
            <span className="whitespace-pre-wrap text-slate-700">{description}</span>
          ) : (
            <span className="text-slate-400">Add a description...</span>
          )}
        </button>
      )}
    </section>
  );
}

interface TaskDrawerAttachmentsSectionProps {
  uploading: boolean;
  attachmentsLoading: boolean;
  attachments: TaskAttachment[];
  onUpload: React.ChangeEventHandler<HTMLInputElement>;
  onDownload: (attachment: TaskAttachment) => void;
  onDelete: (attachmentId: string) => void;
  getDownloadUrl: (attachment: TaskAttachment) => string;
}

function TaskDrawerAttachmentsSection({
  uploading,
  attachmentsLoading,
  attachments,
  onUpload,
  onDownload,
  onDelete,
  getDownloadUrl,
}: TaskDrawerAttachmentsSectionProps) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-slate-800">
          Attachments{' '}
          {attachments.length > 0 && (
            <span className="text-[13px] font-medium text-slate-500">
              ({attachments.length})
            </span>
          )}
        </h3>
        <label className="cursor-pointer text-[11px] font-medium text-slate-500 hover:text-slate-900">
          {uploading ? 'Uploading…' : '+ Add'}
          <input
            type="file"
            onChange={onUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>
      {attachmentsLoading ? (
        <div className="text-xs text-slate-500">Loading…</div>
      ) : attachments.length === 0 ? (
        <div className="text-xs text-slate-500">No attachments yet.</div>
      ) : (
        <ul className="space-y-2 text-[12px] text-slate-900">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm"
            >
              <a
                href={getDownloadUrl(a)}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-800"
              >
                {a.fileName}
              </a>
              <div className="flex flex-shrink-0 flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <button
                  type="button"
                  onClick={() => onDownload(a)}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 hover:bg-slate-50"
                >
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(a.id)}
                  className="rounded-full border border-rose-100 bg-rose-50 px-2.5 py-1.5 text-rose-600 hover:bg-rose-100"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- Comments: messages list (inside scrollable area) ---------- */

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return (email ?? '?').slice(0, 2).toUpperCase();
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function renderCommentBody(s: Story) {
  const text = s.body ?? '';
  const hasMentions =
    Array.isArray(s.metadata?.mentions) && s.metadata.mentions.length > 0;
  if (!hasMentions || !text.includes('@')) return text;
  const parts = text.split(/(@\S+)/g);
  return parts.map((part, idx) =>
    part.startsWith('@') && part.length > 1 ? (
      <span key={idx} className="font-semibold text-blue-600">
        {part}
      </span>
    ) : (
      <span key={idx}>{part}</span>
    ),
  );
}

interface TaskDrawerCommentsListProps {
  user: any;
  stories: Story[];
  editingCommentId: string | null;
  editingCommentBody: string;
  savingComment: boolean;
  onStartEditComment: (story: Story) => void;
  onCancelEditComment: () => void;
  onChangeEditingCommentBody: React.ChangeEventHandler<HTMLTextAreaElement>;
  onSaveEditedComment: () => void;
  onDeleteComment: (commentId: string) => void;
}

function TaskDrawerCommentsList({
  user,
  stories,
  editingCommentId,
  editingCommentBody,
  savingComment,
  onStartEditComment,
  onCancelEditComment,
  onChangeEditingCommentBody,
  onSaveEditedComment,
  onDeleteComment,
}: TaskDrawerCommentsListProps) {
  const comments = stories.filter((s) => s.type === 'COMMENT');

  return (
    <section className="mt-8">
      <h3 className="mb-4 text-[14px] font-semibold text-slate-800">Comments</h3>

      {comments.length === 0 ? (
        <p className="text-[13px] text-slate-400">No comments yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {comments.map((s) => {
            const authorName = s.createdBy?.displayName || s.createdBy?.email || 'Someone';
            const initials = getInitials(s.createdBy?.displayName, s.createdBy?.email);
            const isOwn = user && (s.createdById === user.id || s.createdBy?.id === user.id);

            return (
              <div key={s.id} className="group flex items-start gap-3">
                {/* Avatar */}
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold uppercase text-slate-600">
                  {initials}
                </div>

                {/* Bubble */}
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-baseline gap-2">
                    <span className="text-[13px] font-semibold text-slate-800">{authorName}</span>
                    <span className="text-[11px] text-slate-400">{timeAgo(s.createdAt)}</span>
                    {isOwn && (
                      <span className="ml-auto flex gap-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => onStartEditComment(s)}
                          className="text-[11px] text-slate-400 hover:text-blue-500"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteComment(s.id)}
                          className="text-[11px] text-slate-400 hover:text-red-500"
                        >
                          Delete
                        </button>
                      </span>
                    )}
                  </div>

                  {editingCommentId === s.id ? (
                    <div>
                      <textarea
                        rows={3}
                        value={editingCommentBody}
                        onChange={onChangeEditingCommentBody}
                        className="mb-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 outline-none focus:border-slate-300 focus:ring-0"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={onSaveEditedComment}
                          disabled={savingComment}
                          className="rounded-lg bg-slate-900 px-3 py-1 text-[11px] font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
                        >
                          {savingComment ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={onCancelEditComment}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl rounded-tl-md bg-slate-50 px-4 py-2.5 text-[13px] leading-relaxed text-slate-700">
                      {renderCommentBody(s)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ---------- Comments: composer input (sticky bottom of drawer) ---------- */

interface TaskDrawerCommentInputProps {
  user: any;
  commentBody: string;
  mentionQuery: string;
  mentionResults: MentionUser[];
  mentionDropdownRect: { top: number; left: number; width: number } | null;
  mentionLoading: boolean;
  commentTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onChangeCommentBody: React.ChangeEventHandler<HTMLTextAreaElement>;
  onPostComment: () => void;
  onSelectMentionUser: (user: MentionUser) => void;
  posting: boolean;
}

function TaskDrawerCommentInput({
  user,
  commentBody,
  mentionQuery,
  mentionResults,
  mentionDropdownRect,
  mentionLoading,
  commentTextareaRef,
  onChangeCommentBody,
  onPostComment,
  onSelectMentionUser,
  posting,
}: TaskDrawerCommentInputProps) {
  const initials = user
    ? getInitials(user.displayName ?? user.name, user.email)
    : '??';

  return (
    <div className="border-t border-slate-100 bg-white px-4 py-3 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Avatar */}
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold uppercase text-slate-600">
          {initials}
        </div>

        {/* Input */}
        <div className="relative flex-1">
          <textarea
            ref={commentTextareaRef}
            rows={1}
            placeholder="Write a comment..."
            value={commentBody}
            onChange={onChangeCommentBody}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (commentBody.trim()) onPostComment();
              }
            }}
            className="w-full resize-none rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-[13px] text-slate-700 outline-none placeholder:font-normal placeholder:text-slate-400 focus:border-slate-300 focus:ring-0"
          />

          {/* Mention dropdown portal */}
          {mentionQuery &&
            mentionDropdownRect &&
            typeof document !== 'undefined' &&
            createPortal(
              <div
                role="listbox"
                aria-label="Mention suggestions"
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
                style={{
                  position: 'fixed',
                  top: mentionDropdownRect.top,
                  left: mentionDropdownRect.left,
                  width: mentionDropdownRect.width,
                  zIndex: 10000,
                  maxHeight: '200px',
                  overflowY: 'auto',
                }}
              >
                {mentionLoading ? (
                  <div role="option" className="px-3 py-2.5 text-[13px] text-slate-400">
                    Searching…
                  </div>
                ) : mentionResults.length === 0 ? (
                  <div role="option" aria-selected="false" className="px-3 py-2.5 text-[13px] italic text-slate-400">
                    No matches
                  </div>
                ) : (
                  mentionResults.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      role="option"
                      onClick={() => onSelectMentionUser(u)}
                      className="block w-full border-b border-slate-100 px-3 py-2.5 text-left text-[13px] text-slate-700 transition-colors last:border-b-0 hover:bg-slate-50"
                    >
                      {u.displayName}
                    </button>
                  ))
                )}
              </div>,
              document.body,
            )}
        </div>

        {/* Post button */}
        <button
          type="button"
          onClick={onPostComment}
          disabled={posting || !commentBody.trim()}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
          title="Post comment"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

interface TaskDrawerHeaderProps {
  task: TaskDrawerTask;
  orgId: string;
  projectName?: string | null;
  title: string;
  saving: boolean;
  parentLoading: boolean;
  resolvedParentTitle: string;
  onTitleChange: (value: string) => void;
  onParentClick: () => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function TaskDrawerHeader({
  task,
  orgId,
  projectName,
  title,
  saving,
  parentLoading,
  resolvedParentTitle,
  onTitleChange,
  onParentClick,
  onSave,
  onDelete,
  onClose,
}: TaskDrawerHeaderProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  return (
    <div className="mb-7 pb-4">
      {/* Top action row */}
      <div className="mb-2 flex items-center gap-1.5 text-slate-400">
        {/* Parent task button — left side, only for subtasks */}
        {task.parentId && resolvedParentTitle ? (
          <button
            type="button"
            onClick={onParentClick}
            className="mr-auto inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <ArrowLeft size={13} className="text-slate-400" />
            <span className="max-w-[220px] truncate">{resolvedParentTitle}</span>
          </button>
        ) : (
          <div className="mr-auto" />
        )}

        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100 hover:text-slate-700"
          title="Activity"
        >
          <History size={16} strokeWidth={1.6} />
        </button>

        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100 hover:text-slate-700"
          title="Open task"
        >
          <ExternalLink size={16} strokeWidth={1.6} />
        </button>

        {/* More options — with dropdown */}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100 hover:text-slate-700"
            title="More options"
          >
            <MoreHorizontal size={16} strokeWidth={1.6} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-xl border border-slate-100 bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-red-600 transition-colors hover:bg-red-50"
              >
                <Trash2 size={14} strokeWidth={1.6} />
                Delete task
              </button>
            </div>
          )}
        </div>

        <div className="mx-1 h-5 w-px bg-slate-200" />

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100 hover:text-slate-700"
          title="Close"
        >
          <span className="text-[15px]">&times;</span>
        </button>
      </div>

      {/* Divider above title */}
      <div className="h-px w-full bg-slate-100" />

      {/* Project label above title */}
      {projectName ? (
        <button
          type="button"
          onClick={() => router.push(`/org/${orgId}/tasks?projectId=${task.projectId}&view=board`)}
          className="mt-2 inline-flex max-w-full items-center truncate text-left text-sm text-neutral-500 transition-colors hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          title={projectName}
        >
          <span className="truncate">{projectName}</span>
        </button>
      ) : null}

      {/* Main title (display-style, still editable) */}
      <input
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        onBlur={onSave}
        className="task-title-input mt-2 w-full rounded-md border-none bg-transparent px-0 text-[20px] font-semibold text-slate-800 outline-none placeholder:text-slate-400 transition-colors duration-150"
        placeholder="Task title"
      />
    </div>
  );
}

interface TaskDrawerMetaFormProps {
  title: string;
  dueDate: string;
  sectionId: string;
  assigneeId: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  sections: ProjectSection[];
  members: OrgMember[];
  saving: boolean;
  onChangeTitle: (value: string) => void;
  onChangeDueDate: (value: string) => void;
  onChangeSectionId: (value: string) => void;
  onChangeAssigneeId: (value: string) => void;
  onChangePriority: (value: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT') => void;
  onSaveField: (patch: Record<string, string>) => Promise<void>;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function TaskDrawerMetaForm({
  dueDate,
  sectionId,
  assigneeId,
  priority,
  sections,
  members,
  saving,
  onChangeTitle,
  onChangeDueDate,
  onChangeSectionId,
  onChangeAssigneeId,
  onChangePriority,
  onSaveField,
  onSave,
  onDelete,
  onClose,
}: TaskDrawerMetaFormProps) {
  const currentSection = sections.find((s) => s.id === sectionId);
  const currentAssignee = members.find((m) => m.id === assigneeId);
  const dueDateLabel = dueDate
    ? new Date(dueDate).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'No due date';

  const [statusOpen, setStatusOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const assigneeRef = useRef<HTMLDivElement | null>(null);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const priorityRef = useRef<HTMLDivElement | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const dateRef = useRef<HTMLDivElement | null>(null);
  const [calMonth, setCalMonth] = useState(() => {
    if (dueDate) {
      const d = new Date(dueDate);
      return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  });

  const getStatusDotClass = (name: string | undefined) => {
    const n = (name || '').toLowerCase();
    if (n.includes('backlog')) return 'bg-slate-400';
    if (n.includes('todo') || n === 'to do') return 'bg-sky-500';
    if (n.includes('progress')) return 'bg-amber-400';
    if (n.includes('review')) return 'bg-purple-500';
    if (n.includes('done')) return 'bg-emerald-500';
    return 'bg-slate-300';
  };

  useEffect(() => {
    if (!statusOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!statusRef.current) return;
      if (!statusRef.current.contains(e.target as Node)) {
        setStatusOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [statusOpen]);

  useEffect(() => {
    if (!assigneeOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!assigneeRef.current) return;
      if (!assigneeRef.current.contains(e.target as Node)) {
        setAssigneeOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [assigneeOpen]);

  useEffect(() => {
    if (!priorityOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!priorityRef.current) return;
      if (!priorityRef.current.contains(e.target as Node)) {
        setPriorityOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [priorityOpen]);

  useEffect(() => {
    if (!dateOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!dateRef.current) return;
      if (!dateRef.current.contains(e.target as Node)) {
        setDateOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [dateOpen]);
  return (
    <>
      {/* Metadata panel */}
      <section className="mb-9 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 sm:px-6">
        <div className="grid gap-y-3 gap-x-10 md:grid-cols-2">
          {/* Left column: Status / Priority */}
          <div className="space-y-3.5">
            {/* Status (Section) */}
            <div ref={statusRef} className="relative">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Status
              </div>
              <button
                type="button"
                onClick={() => setStatusOpen((v) => !v)}
                className="mt-1 inline-flex min-h-[32px] w-full items-center justify-between rounded-full bg-white px-3 text-[13px] font-medium text-slate-700 shadow-sm outline-none transition-colors duration-150 hover:bg-slate-50"
              >
                <span className="inline-flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${getStatusDotClass(
                      currentSection?.name,
                    )}`}
                  />
                  <span>{currentSection?.name ?? 'Select status'}</span>
                </span>
                <span className="text-xs text-slate-400">▾</span>
              </button>

              {statusOpen && (
                <div className="absolute left-0 top-[calc(100%+6px)] z-20 w-52 rounded-2xl border border-slate-100 bg-white p-1.5 shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
                  <ul className="space-y-0.5 text-[13px] text-slate-700">
                    {sections.map((s) => {
                      const selected = s.id === sectionId;
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => {
                              if (s.id !== sectionId) {
                                onChangeSectionId(s.id);
                                void onSaveField({ sectionId: s.id });
                              }
                              setStatusOpen(false);
                            }}
                            className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left transition-colors duration-150 ${
                              selected
                                ? 'bg-slate-50 text-slate-900'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <span className="inline-flex items-center gap-2">
                              <span
                                className={`h-2.5 w-2.5 rounded-full ${getStatusDotClass(
                                  s.name,
                                )}`}
                              />
                              <span>{s.name}</span>
                            </span>
                            {selected && (
                              <span className="text-xs text-slate-500">✓</span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            {/* Priority dropdown */}
            <div ref={priorityRef} className="relative">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Priority
              </div>
              <button
                type="button"
                onClick={() => setPriorityOpen((v) => !v)}
                className="mt-1 inline-flex min-h-[32px] w-full items-center justify-between rounded-full bg-white px-3 text-[13px] font-medium text-slate-700 shadow-sm outline-none transition-colors duration-150 hover:bg-slate-50"
              >
                <span className="inline-flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      priority === 'LOW'
                        ? 'bg-sky-50 text-sky-600'
                        : priority === 'MEDIUM'
                        ? 'bg-amber-50 text-amber-700'
                        : priority === 'URGENT'
                        ? 'bg-rose-50 text-rose-600'
                        : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {priority}
                  </span>
                </span>
                <span className="text-xs text-slate-400">▾</span>
              </button>

              {priorityOpen && (
                <div className="absolute left-0 top-[calc(100%+6px)] z-20 w-48 rounded-2xl border border-slate-100 bg-white p-1.5 shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
                  <ul className="space-y-0.5 text-[13px] text-slate-700">
                    {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const).map((p) => {
                      const selected = p === priority;
                      const badgeClasses =
                        p === 'LOW'
                          ? 'bg-sky-50 text-sky-600'
                          : p === 'MEDIUM'
                          ? 'bg-amber-50 text-amber-700'
                          : p === 'URGENT'
                          ? 'bg-rose-50 text-rose-600'
                          : 'bg-emerald-50 text-emerald-700';
                      return (
                        <li key={p}>
                          <button
                            type="button"
                            onClick={() => {
                              if (p !== priority) {
                                onChangePriority(p);
                                void onSaveField({ priority: p });
                              }
                              setPriorityOpen(false);
                            }}
                            className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left transition-colors duration-150 ${
                              selected
                                ? 'bg-slate-50 text-slate-900'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${badgeClasses}`}
                            >
                              {p}
                            </span>
                            {selected && (
                              <span className="text-xs text-slate-500">✓</span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Right column: Assignee / Due Date */}
          <div className="space-y-3.5">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Assignee
              </div>
              <div ref={assigneeRef} className="relative">
                <button
                  type="button"
                  onClick={() => setAssigneeOpen((v) => !v)}
                  className="mt-1 inline-flex min-h-[32px] w-full items-center justify-between rounded-full bg-white px-3 text-[13px] font-medium text-slate-700 shadow-sm outline-none transition-colors duration-150 hover:bg-slate-50"
                >
                  <span className="inline-flex items-center gap-2">
                    <UserAvatar
                      avatarUrl={currentAssignee?.avatarUrl}
                      displayName={currentAssignee?.displayName}
                      email={currentAssignee?.email}
                      size={24}
                      className="bg-slate-100"
                      fallbackTextClassName="text-[11px] font-semibold text-slate-600"
                    />
                    <span>
                      {currentAssignee
                        ? currentAssignee.displayName || currentAssignee.email
                        : 'Unassigned'}
                    </span>
                  </span>
                  <span className="text-xs text-slate-400">▾</span>
                </button>

                {assigneeOpen && (
                  <div className="absolute left-0 top-[calc(100%+6px)] z-20 w-56 rounded-2xl border border-slate-100 bg-white p-1.5 shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
                    <ul className="space-y-0.5 text-[13px] text-slate-700">
                      <li>
                        <button
                          type="button"
                          onClick={() => {
                            if (assigneeId !== '') {
                              onChangeAssigneeId('');
                              void onSaveField({ assigneeUserId: '' });
                            }
                            setAssigneeOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left transition-colors duration-150 ${
                            assigneeId === ''
                              ? 'bg-slate-50 text-slate-900'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <span className="inline-flex items-center gap-2">
                            <UserAvatar
                              size={24}
                              className="bg-slate-100"
                              fallbackTextClassName="text-[11px] font-semibold text-slate-500"
                              displayName="Unassigned"
                              email=""
                            />
                            <span>Unassigned</span>
                          </span>
                          {assigneeId === '' && (
                            <span className="text-xs text-slate-500">✓</span>
                          )}
                        </button>
                      </li>
                      {members.map((m) => {
                        const selected = m.id === assigneeId;
                        const label = m.displayName || m.email || '';
                        return (
                          <li key={m.id}>
                            <button
                              type="button"
                              onClick={() => {
                                if (m.id !== assigneeId) {
                                  onChangeAssigneeId(m.id);
                                  void onSaveField({ assigneeUserId: m.id });
                                }
                                setAssigneeOpen(false);
                              }}
                              className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left transition-colors duration-150 ${
                                selected
                                  ? 'bg-slate-50 text-slate-900'
                                  : 'hover:bg-slate-50'
                              }`}
                            >
                              <span className="inline-flex items-center gap-2">
                                <UserAvatar
                                  avatarUrl={m.avatarUrl}
                                  displayName={m.displayName}
                                  email={m.email}
                                  size={24}
                                  className="bg-slate-100"
                                  fallbackTextClassName="text-[11px] font-semibold text-slate-600"
                                />
                                <span>{label}</span>
                              </span>
                              {selected && (
                                <span className="text-xs text-slate-500">✓</span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div ref={dateRef} className="relative">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Due Date
              </div>
              <button
                type="button"
                onClick={() => setDateOpen((v) => !v)}
                className="mt-1 inline-flex min-h-[32px] w-full items-center justify-between rounded-full bg-white px-3 text-[13px] font-medium text-slate-700 shadow-sm outline-none transition-colors duration-150 hover:bg-slate-50"
              >
                <span className="inline-flex items-center gap-2 text-slate-600">
                  <span className="text-xs text-slate-400">📅</span>
                  <span>{dueDateLabel}</span>
                </span>
                <span className="text-xs text-slate-400">▾</span>
              </button>

              {dateOpen && (() => {
                const yr = calMonth.getFullYear();
                const mo = calMonth.getMonth();
                const firstDay = new Date(yr, mo, 1).getDay();
                const daysInMonth = new Date(yr, mo + 1, 0).getDate();
                const prevDays = new Date(yr, mo, 0).getDate();
                const todayStr = new Date().toISOString().slice(0, 10);
                const moLabel = calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

                const cells: { day: number; inMonth: boolean; dateStr: string }[] = [];
                for (let i = firstDay - 1; i >= 0; i--) {
                  const d = prevDays - i;
                  const ds = new Date(yr, mo - 1, d);
                  cells.push({ day: d, inMonth: false, dateStr: ds.toISOString().slice(0, 10) });
                }
                for (let d = 1; d <= daysInMonth; d++) {
                  const ds = new Date(yr, mo, d);
                  cells.push({ day: d, inMonth: true, dateStr: ds.toISOString().slice(0, 10) });
                }
                const remaining = 7 - (cells.length % 7);
                if (remaining < 7) {
                  for (let d = 1; d <= remaining; d++) {
                    const ds = new Date(yr, mo + 1, d);
                    cells.push({ day: d, inMonth: false, dateStr: ds.toISOString().slice(0, 10) });
                  }
                }

                return (
                  <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-64 rounded-2xl border border-slate-100 bg-white p-3 shadow-[0_18px_45px_rgba(15,23,42,0.14)]">
                    {/* Header: prev / month label / next */}
                    <div className="mb-2 flex items-center justify-between text-[13px] font-medium text-slate-700">
                      <button
                        type="button"
                        onClick={() => setCalMonth(new Date(yr, mo - 1, 1))}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        ‹
                      </button>
                      <span>{moLabel}</span>
                      <button
                        type="button"
                        onClick={() => setCalMonth(new Date(yr, mo + 1, 1))}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        ›
                      </button>
                    </div>

                    {/* Weekday labels */}
                    <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                        <span key={d}>{d}</span>
                      ))}
                    </div>

                    {/* Day grid */}
                    <div className="grid grid-cols-7 gap-y-0.5 text-center text-[12px]">
                      {cells.map((c, idx) => {
                        const isSelected = c.dateStr === dueDate;
                        const isToday = c.dateStr === todayStr;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              onChangeDueDate(c.dateStr);
                              void onSaveField({ dueDate: c.dateStr });
                              setDateOpen(false);
                            }}
                            className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-100 ${
                              isSelected
                                ? 'bg-slate-900 text-white'
                                : isToday
                                ? 'bg-slate-100 font-medium text-slate-900'
                                : c.inMonth
                                ? 'text-slate-700 hover:bg-slate-100'
                                : 'text-slate-300'
                            }`}
                          >
                            {c.day}
                          </button>
                        );
                      })}
                    </div>

                    {/* Footer: Today / Clear */}
                    <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] font-medium">
                      <button
                        type="button"
                        onClick={() => {
                          onChangeDueDate(todayStr);
                          void onSaveField({ dueDate: todayStr });
                          setDateOpen(false);
                        }}
                        className="rounded-full px-2 py-0.5 text-slate-600 hover:bg-slate-100"
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onChangeDueDate('');
                          void onSaveField({ dueDate: '' });
                          setDateOpen(false);
                        }}
                        className="rounded-full px-2 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

interface TaskDrawerSubtasksSectionProps {
  task: TaskDrawerTask;
  subtasks: Subtask[];
  subtasksLoading: boolean;
  sections: ProjectSection[];
  members: OrgMember[];
  orgId: string;
  onOpenSubtask: (subtask: Subtask) => void;
  onDeleteSubtask: (subtask: Subtask) => void;
  onSubtaskCreated: (subtask: Subtask) => void;
  onPageTaskCreated?: (task: TaskDrawerTask) => void;
  onToggleSubtask: (subtask: Subtask, done: boolean) => Promise<void>;
}

function TaskDrawerSubtasksSection({
  task,
  subtasks,
  subtasksLoading,
  sections,
  members,
  orgId,
  onOpenSubtask,
  onDeleteSubtask,
  onSubtaskCreated,
  onPageTaskCreated,
  onToggleSubtask,
}: TaskDrawerSubtasksSectionProps) {
  const [adding, setAdding] = useState(false);

  const handleAddSubtask = async () => {
    if (adding) return;
    setAdding(true);
    try {
      const created = await apiFetch(`/tasks/${task.id}/subtasks`, {
        method: 'POST',
        headers: { 'x-org-id': orgId },
        body: JSON.stringify({ title: 'Untitled subtask' }),
      });
      const res = created as any;
      const newSubtask: Subtask = {
        id: res.id,
        title: res.title,
        dueDate: res.dueDate ?? null,
        projectId: res.projectId,
        projectName: (res.project?.name as string | undefined) ?? task.projectName ?? task.project?.name ?? null,
        project: res.project ?? task.project ?? null,
        sectionId: res.sectionId,
        parentId: task.id,
        section: res.section ?? null,
        assignees: res.assignees ?? [],
      };
      onSubtaskCreated(newSubtask);
      if (onPageTaskCreated) {
        onPageTaskCreated({
          id: res.id,
          title: res.title,
          description: res.description ?? null,
          dueDate: res.dueDate ?? null,
          projectId: res.projectId,
          projectName: (res.project?.name as string | undefined) ?? task.projectName ?? task.project?.name ?? null,
          project: res.project ?? task.project ?? null,
          sectionId: res.sectionId,
          parentId: task.id,
          assignees: res.assignees ?? [],
        });
      }
      onOpenSubtask(newSubtask);
    } catch (err: any) {
      alert(err.message || 'Failed to create subtask');
    } finally {
      setAdding(false);
    }
  };

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-slate-800">
          Subtasks{' '}
          {subtasks.length > 0 && (
            <span className="text-[13px] font-medium text-slate-500">
              ({subtasks.length})
            </span>
          )}
        </h3>
        {!task.parentId && (
          <button
            type="button"
            onClick={handleAddSubtask}
            disabled={adding}
            className="text-[12px] font-medium text-slate-500 transition-colors hover:text-slate-800 disabled:opacity-50"
          >
            {adding ? 'Creating…' : '+ Add Subtask'}
          </button>
        )}
      </div>
      {subtasksLoading ? (
        <div className="text-xs text-slate-500">Loading…</div>
      ) : subtasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center text-xs text-slate-400">
          No subtasks yet. Break down this task into smaller pieces.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {subtasks.map((s) => (
            <SubtaskCard
              key={s.id}
              subtask={s}
              onOpen={() => onOpenSubtask(s)}
              onDelete={() => onDeleteSubtask(s)}
              onToggle={(done) => onToggleSubtask(s, done)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** Clickable subtask row: click opens that subtask in the drawer; Delete removes it */
function SubtaskCard({
  subtask,
  onOpen,
  onDelete,
  onToggle,
}: {
  subtask: Subtask;
  onOpen: () => void;
  onDelete: () => void;
  onToggle: (done: boolean) => void;
}) {
  const sectionName = subtask.section?.name ?? '';
  const isDone = sectionName.toLowerCase().includes('done');
  const dueStr = subtask.dueDate
    ? new Date(subtask.dueDate).toLocaleDateString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '';
  const assignee = (subtask.assignees ?? [])[0];

  const sectionColor = (() => {
    const n = sectionName.toLowerCase();
    if (n.includes('done')) return { bg: 'bg-emerald-50', text: 'text-emerald-600' };
    if (n.includes('progress')) return { bg: 'bg-amber-50', text: 'text-amber-600' };
    if (n.includes('review')) return { bg: 'bg-purple-50', text: 'text-purple-600' };
    if (n.includes('todo') || n === 'to do') return { bg: 'bg-sky-50', text: 'text-sky-600' };
    if (n.includes('backlog')) return { bg: 'bg-slate-100', text: 'text-slate-500' };
    return { bg: 'bg-slate-100', text: 'text-slate-600' };
  })();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 transition-colors duration-100 hover:bg-slate-50/80"
      style={{ cursor: 'pointer' }}
    >
      {/* Checkbox / status circle */}
      <button
        type="button"
        className="flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(!isDone);
        }}
      >
        {isDone ? (
          <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-emerald-500 transition-colors hover:bg-emerald-600">
            <Check size={13} className="text-white" strokeWidth={2.5} />
          </div>
        ) : (
          <div className="h-[22px] w-[22px] rounded-full border-2 border-slate-300 transition-colors hover:border-emerald-400" />
        )}
      </button>

      {/* Title + metadata */}
      <div className="min-w-0 flex-1">
        <div
          className={`text-[13px] font-medium leading-tight ${
            isDone ? 'text-slate-400 line-through' : 'text-slate-800'
          }`}
        >
          {subtask.title}
        </div>
        <div className="mt-1 flex items-center gap-2">
          {subtask.priority && (
            <span
              className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                subtask.priority === 'LOW'
                  ? 'bg-sky-50 text-sky-600'
                  : subtask.priority === 'MEDIUM'
                  ? 'bg-amber-50 text-amber-700'
                  : subtask.priority === 'URGENT'
                  ? 'bg-rose-50 text-rose-600'
                  : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              {subtask.priority}
            </span>
          )}
          {sectionName && (
            <span
              className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sectionColor.bg} ${sectionColor.text}`}
            >
              {sectionName}
            </span>
          )}
          {dueStr && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
              <Calendar size={11} />
              {dueStr}
            </span>
          )}
        </div>
      </div>

      {/* Assignee avatar */}
      {assignee && (
        <UserAvatar
          avatarUrl={assignee.avatarUrl}
          displayName={assignee.displayName}
          email={assignee.email}
          size={28}
          className="flex-shrink-0 bg-slate-200"
          title={assignee.displayName ?? assignee.email}
          fallbackTextClassName="text-[11px] font-semibold text-slate-600"
        />
      )}

      {/* Three-dot menu */}
      <div ref={menuRef} className="relative flex-shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 opacity-100 transition-opacity duration-100 hover:bg-slate-100 hover:text-slate-600 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <MoreHorizontal size={15} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-20 mt-1 w-28 rounded-lg border border-slate-100 bg-white py-1 shadow-lg">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onDelete();
              }}
              className="w-full px-3 py-1.5 text-left text-[12px] text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Chevron */}
      <ChevronRight size={16} className="flex-shrink-0 text-slate-300" />
    </div>
  );
}


