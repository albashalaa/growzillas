'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { apiFetch, apiFetchFormData, API_BASE_URL } from '../../lib/api';
import { mapOrgMember } from '../../lib/map-org-member';
import { getToken } from '../../lib/auth';
import { useAuth } from '../../contexts/AuthContext';

interface TaskAssignee {
  id: string;
  email: string;
  displayName?: string | null;
}

interface ProjectSection {
  id: string;
  name: string;
  order?: number;
}

interface OrgMember {
  id: string;
  email: string;
  displayName?: string | null;
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
  dueDate?: string | null;
  projectId: string;
  sectionId: string;
  parentId?: string | null;
  assignees: TaskAssignee[];
}

interface Subtask {
  id: string;
  title: string;
  dueDate?: string | null;
  projectId: string;
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

  useEffect(() => {
    setTitle(task.title);
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

  const handleSave = async () => {
    setSaving(true);
    const body: any = {};

    if (title.trim() && title.trim() !== task.title) {
      body.title = title.trim();
    }
    body.dueDate = dueDate || '';
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
      if (onUpdated) {
        await onUpdated(updated as TaskDrawerTask);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update task');
    } finally {
      setSaving(false);
    }
  };

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
      if (onUpdated) await onUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to delete subtask');
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
          position: 'fixed',
          top: 0,
          right: 0,
          width: '460px',
          maxWidth: '100vw',
          height: '100vh',
          backgroundColor: '#fff',
          borderLeft: '1px solid #000',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '24px',
          }}
        >
          <TaskDrawerHeader
            task={task}
            parentLoading={parentLoading}
            resolvedParentTitle={resolvedParentTitle}
            onParentClick={handleParentClick}
          />
          <TaskDrawerMetaForm
            title={title}
            dueDate={dueDate}
            sectionId={sectionId}
            assigneeId={assigneeId}
            sections={sections}
            members={members}
            saving={saving}
            onChangeTitle={(value) => setTitle(value)}
            onChangeDueDate={(value) => setDueDate(value)}
            onChangeSectionId={(value) => setSectionId(value)}
            onChangeAssigneeId={(value) => setAssigneeId(value)}
            onSave={handleSave}
            onDelete={handleDelete}
            onClose={onClose}
            uploading={uploading}
            attachmentsLoading={attachmentsLoading}
            attachments={attachments}
            onUploadAttachment={handleUploadAttachment}
            onDownloadAttachment={handleDownloadAttachment}
            onDeleteAttachment={handleDeleteAttachment}
            getDownloadUrl={getDownloadUrl}
          />

        {/* Subtasks — only show add for top-level tasks (no nested subtasks) */}
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
        />

        {/* Comments */}
        <TaskDrawerCommentsSection
          user={user}
          stories={stories}
          editingCommentId={editingCommentId}
          editingCommentBody={editingCommentBody}
          savingComment={savingComment}
          commentBody={commentBody}
          mentionQuery={mentionQuery}
          mentionResults={mentionResults}
          mentionDropdownRect={mentionDropdownRect}
          mentionLoading={mentionLoading}
          commentTextareaRef={commentTextareaRef}
          onStartEditComment={handleStartEditComment}
          onCancelEditComment={handleCancelEditComment}
          onChangeEditingCommentBody={handleChangeEditingCommentBody}
          onSaveEditedComment={handleSaveEditedComment}
          onDeleteComment={handleDeleteComment}
          onChangeCommentBody={handleChangeCommentBody}
          onPostComment={handlePostComment}
          onSelectMentionUser={handleSelectMentionUser}
          posting={posting}
        />
        </div>
      </div>
    </div>
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
    <div style={{ marginTop: '20px', marginBottom: '12px' }}>
      <h3 style={{ fontSize: '14px', marginBottom: '8px', color: '#000' }}>
        Attachments
      </h3>
      <div style={{ marginBottom: '8px' }}>
        <label
          style={{
            display: 'inline-block',
            padding: '4px 10px',
            border: '1px solid #000',
            backgroundColor: '#fff',
            color: '#000',
            cursor: uploading ? 'not-allowed' : 'pointer',
            fontSize: '12px',
          }}
        >
          {uploading ? 'Uploading…' : 'Upload file'}
          <input
            type="file"
            onChange={onUpload}
            style={{ display: 'none' }}
            disabled={uploading}
          />
        </label>
      </div>
      {attachmentsLoading ? (
        <div style={{ fontSize: '12px', color: '#555' }}>Loading…</div>
      ) : attachments.length === 0 ? (
        <div style={{ fontSize: '12px', color: '#555' }}>No attachments yet.</div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            fontSize: '12px',
            color: '#000',
          }}
        >
          {attachments.map((a) => (
            <li
              key={a.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                padding: '4px 0',
                borderBottom: '1px solid #eee',
              }}
            >
              <a
                href={getDownloadUrl(a)}
                target="_blank"
                rel="noreferrer"
                style={{
                  flex: 1,
                  minWidth: 0,
                  color: '#000',
                  textDecoration: 'underline',
                  wordBreak: 'break-all',
                }}
              >
                {a.fileName}
              </a>
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => onDownload(a)}
                  style={{
                    padding: '2px 6px',
                    border: '1px solid #000',
                    backgroundColor: '#fff',
                    color: '#000',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(a.id)}
                  style={{
                    padding: '2px 6px',
                    border: '1px solid #000',
                    backgroundColor: '#fff',
                    color: '#000',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface TaskDrawerCommentsSectionProps {
  user: any;
  stories: Story[];
  editingCommentId: string | null;
  editingCommentBody: string;
  savingComment: boolean;
  commentBody: string;
  mentionQuery: string;
  mentionResults: MentionUser[];
  mentionDropdownRect: { top: number; left: number; width: number } | null;
  mentionLoading: boolean;
  commentTextareaRef: React.RefObject<HTMLTextAreaElement>;
  onStartEditComment: (story: Story) => void;
  onCancelEditComment: () => void;
  onChangeEditingCommentBody: React.ChangeEventHandler<HTMLTextAreaElement>;
  onSaveEditedComment: () => void;
  onDeleteComment: (commentId: string) => void;
  onChangeCommentBody: React.ChangeEventHandler<HTMLTextAreaElement>;
  onPostComment: () => void;
  onSelectMentionUser: (user: MentionUser) => void;
  posting: boolean;
}

function TaskDrawerCommentsSection({
  user,
  stories,
  editingCommentId,
  editingCommentBody,
  savingComment,
  commentBody,
  mentionQuery,
  mentionResults,
  mentionDropdownRect,
  mentionLoading,
  commentTextareaRef,
  onStartEditComment,
  onCancelEditComment,
  onChangeEditingCommentBody,
  onSaveEditedComment,
  onDeleteComment,
  onChangeCommentBody,
  onPostComment,
  onSelectMentionUser,
  posting,
}: TaskDrawerCommentsSectionProps) {
  return (
    <div style={{ marginTop: '24px' }}>
      <h3 style={{ fontSize: '14px', marginBottom: '8px', color: '#000' }}>
        Comments
      </h3>
      <div
        style={{
          maxHeight: '140px',
          overflowY: 'auto',
          border: '1px solid #000',
          padding: '8px',
          marginBottom: '8px',
        }}
      >
        {stories.filter((s) => s.type === 'COMMENT').length === 0 ? (
          <div style={{ fontSize: '12px', color: '#555' }}>No comments yet.</div>
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
                <div style={{ marginBottom: '2px', display: 'flex', gap: 4 }}>
                  <strong>
                    {s.createdBy?.displayName || s.createdBy?.email || 'Someone'}
                  </strong>
                  <span style={{ color: '#555' }}>
                    {new Date(s.createdAt).toLocaleString()}
                  </span>
                  {user &&
                    (s.createdById === user.id || s.createdBy?.id === user.id) && (
                      <span
                        style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}
                      >
                        <button
                          type="button"
                          onClick={() => onStartEditComment(s)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#0070f3',
                            cursor: 'pointer',
                            fontSize: '11px',
                            textDecoration: 'underline',
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteComment(s.id)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#d00',
                            cursor: 'pointer',
                            fontSize: '11px',
                            textDecoration: 'underline',
                          }}
                        >
                          Delete
                        </button>
                      </span>
                    )}
                </div>
                {editingCommentId === s.id ? (
                  <div style={{ marginTop: '4px' }}>
                    <textarea
                      rows={3}
                      value={editingCommentBody}
                      onChange={onChangeEditingCommentBody}
                      style={{
                        width: '100%',
                        resize: 'vertical',
                        padding: '6px',
                        border: '1px solid #000',
                        fontSize: '12px',
                        marginBottom: '4px',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={onSaveEditedComment}
                        disabled={savingComment}
                        style={{
                          padding: '4px 8px',
                          border: '1px solid #000',
                          backgroundColor: '#000',
                          color: '#fff',
                          fontSize: '11px',
                          cursor: savingComment ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {savingComment ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={onCancelEditComment}
                        style={{
                          padding: '4px 8px',
                          border: '1px solid #000',
                          backgroundColor: '#fff',
                          color: '#000',
                          fontSize: '11px',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {(() => {
                      const text = s.body ?? '';
                      const hasMentions =
                        Array.isArray(s.metadata?.mentions) &&
                        s.metadata.mentions.length > 0;
                      if (!hasMentions || !text.includes('@')) {
                        return text;
                      }
                      const parts = text.split(/(@\S+)/g);
                      return parts.map((part, idx) => {
                        if (part.startsWith('@') && part.length > 1) {
                          return (
                            <span
                              key={idx}
                              style={{
                                fontWeight: 600,
                                color: '#000',
                              }}
                            >
                              {part}
                            </span>
                          );
                        }
                        return <span key={idx}>{part}</span>;
                      });
                    })()}
                  </div>
                )}
              </div>
            ))
        )}
      </div>
      <div style={{ position: 'relative', marginBottom: '6px' }}>
        <textarea
          ref={commentTextareaRef}
          rows={3}
          placeholder="Write a comment..."
          value={commentBody}
          onChange={onChangeCommentBody}
          style={{
            width: '100%',
            resize: 'vertical',
            padding: '6px',
            border: '1px solid #000',
            fontSize: '12px',
          }}
        />
        {mentionQuery &&
          mentionDropdownRect &&
          typeof document !== 'undefined' &&
          createPortal(
            <div
              role="listbox"
              aria-label="Mention suggestions"
              style={{
                position: 'fixed',
                top: mentionDropdownRect.top,
                left: mentionDropdownRect.left,
                width: mentionDropdownRect.width,
                backgroundColor: '#fff',
                border: '1px solid #333',
                borderRadius: '6px',
                boxShadow: '0 6px 20px rgba(0,0,0,0.2)',
                zIndex: 10000,
                maxHeight: '200px',
                overflowY: 'auto',
                fontSize: '13px',
              }}
            >
              {mentionLoading ? (
                <div
                  role="option"
                  style={{
                    padding: '10px 12px',
                    color: '#555',
                    borderBottom: '1px solid #eee',
                  }}
                >
                  Searching…
                </div>
              ) : mentionResults.length === 0 ? (
                <div
                  role="option"
                  aria-selected="false"
                  style={{
                    padding: '10px 12px',
                    color: '#666',
                    fontStyle: 'italic',
                  }}
                >
                  No matches
                </div>
              ) : (
                mentionResults.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    role="option"
                    onClick={() => onSelectMentionUser(u)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 12px',
                      border: 'none',
                      borderBottom: '1px solid #eee',
                      background: '#fff',
                      color: '#111',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f0f0f0';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#fff';
                    }}
                  >
                    {u.displayName}
                  </button>
                ))
              )}
            </div>,
            document.body,
          )}
      </div>
      <button
        type="button"
        onClick={onPostComment}
        disabled={posting}
        style={{
          padding: '6px 12px',
          backgroundColor: '#000',
          color: '#fff',
          border: 'none',
          cursor: posting ? 'not-allowed' : 'pointer',
          fontSize: '13px',
        }}
      >
        {posting ? 'Posting...' : 'Post'}
      </button>
    </div>
  );
}

interface TaskDrawerHeaderProps {
  task: TaskDrawerTask;
  parentLoading: boolean;
  resolvedParentTitle: string;
  onParentClick: () => void;
}

function TaskDrawerHeader({
  task,
  parentLoading,
  resolvedParentTitle,
  onParentClick,
}: TaskDrawerHeaderProps) {
  return (
    <>
      {/* When viewing a subtask, show its parent task name and allow clicking back to it */}
      {task.parentId && !parentLoading && resolvedParentTitle && (
        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              fontSize: '11px',
              color: '#777',
              marginBottom: '4px',
            }}
          >
            Parent task
          </div>
          <button
            type="button"
            onClick={onParentClick}
            style={{
              padding: '4px 8px',
              border: '1px solid #000',
              background: '#fff',
              color: '#000',
              cursor: 'pointer',
              fontSize: '13px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span style={{ fontSize: '11px' }}>←</span>
            <span>{resolvedParentTitle}</span>
          </button>
        </div>
      )}
      <h2 style={{ marginBottom: '16px', color: '#000', fontSize: '18px' }}>
        Task details
      </h2>
    </>
  );
}

interface TaskDrawerMetaFormProps {
  title: string;
  dueDate: string;
  sectionId: string;
  assigneeId: string;
  sections: ProjectSection[];
  members: OrgMember[];
  saving: boolean;
  onChangeTitle: (value: string) => void;
  onChangeDueDate: (value: string) => void;
  onChangeSectionId: (value: string) => void;
  onChangeAssigneeId: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
  uploading: boolean;
  attachmentsLoading: boolean;
  attachments: TaskAttachment[];
  onUploadAttachment: React.ChangeEventHandler<HTMLInputElement>;
  onDownloadAttachment: (attachment: TaskAttachment) => void;
  onDeleteAttachment: (attachmentId: string) => void;
  getDownloadUrl: (attachment: TaskAttachment) => string;
}

function TaskDrawerMetaForm({
  title,
  dueDate,
  sectionId,
  assigneeId,
  sections,
  members,
  saving,
  onChangeTitle,
  onChangeDueDate,
  onChangeSectionId,
  onChangeAssigneeId,
  onSave,
  onDelete,
  onClose,
  uploading,
  attachmentsLoading,
  attachments,
  onUploadAttachment,
  onDownloadAttachment,
  onDeleteAttachment,
  getDownloadUrl,
}: TaskDrawerMetaFormProps) {
  return (
    <>
      <label style={labelStyle}>
        Title
        <input
          type="text"
          value={title}
          onChange={(e) => onChangeTitle(e.target.value)}
          style={inputStyle}
        />
      </label>

      <label style={labelStyle}>
        Due date
        <input
          type="date"
          value={dueDate}
          onChange={(e) => onChangeDueDate(e.target.value)}
          style={inputStyle}
        />
      </label>

      {/* Attachments */}
      <TaskDrawerAttachmentsSection
        uploading={uploading}
        attachmentsLoading={attachmentsLoading}
        attachments={attachments}
        onUpload={onUploadAttachment}
        onDownload={onDownloadAttachment}
        onDelete={onDeleteAttachment}
        getDownloadUrl={getDownloadUrl}
      />

      <label style={labelStyle}>
        Section
        <select
          value={sectionId}
          onChange={(e) => onChangeSectionId(e.target.value)}
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
          onChange={(e) => onChangeAssigneeId(e.target.value)}
          style={inputStyle}
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName || m.email}
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          style={{
            padding: '6px 12px',
            backgroundColor: '#000',
            color: '#fff',
            border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: '13px',
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onDelete}
          style={{
            padding: '6px 12px',
            backgroundColor: '#fff',
            color: '#000',
            border: '1px solid #000',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Delete
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            marginLeft: 'auto',
            padding: '6px 12px',
            backgroundColor: '#fff',
            color: '#000',
            border: '1px solid #000',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Close
        </button>
      </div>
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
}: TaskDrawerSubtasksSectionProps) {
  return (
    <div style={{ marginTop: '24px' }}>
      <h3 style={{ fontSize: '14px', marginBottom: '12px', color: '#000' }}>
        Subtasks
      </h3>
      {subtasksLoading ? (
        <div style={{ fontSize: '12px', color: '#555' }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {subtasks.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#555', padding: '8px 0' }}>
              No subtasks yet.
            </div>
          ) : (
            subtasks.map((s) => (
              <SubtaskCard
                key={s.id}
                subtask={s}
                onOpen={() => onOpenSubtask(s)}
                onDelete={() => onDeleteSubtask(s)}
              />
            ))
          )}
        </div>
      )}

      {!task.parentId && (
        <SubtaskCreateRow
          orgId={orgId}
          parentTaskId={task.id}
          sections={sections}
          members={members}
          onCreated={onSubtaskCreated}
        />
      )}
    </div>
  );
}

/** Clickable subtask row: click opens that subtask in the drawer; Delete removes it */
function SubtaskCard({
  subtask,
  onOpen,
  onDelete,
}: {
  subtask: Subtask;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const sectionName = subtask.section?.name ?? '';
  const dueStr = subtask.dueDate
    ? new Date(subtask.dueDate).toLocaleDateString()
    : '';
  const assigneeStr =
    (subtask.assignees?.length ?? 0) > 0
      ? (subtask.assignees ?? [])
          .map((a) => a.displayName || a.email)
          .join(', ')
      : '';

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
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '8px',
        padding: '12px',
        border: '1px solid #000',
        backgroundColor: '#fff',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, color: '#000', marginBottom: '4px' }}>
          {subtask.title}
        </div>
        <div style={{ fontSize: '12px', color: '#555' }}>
          {[sectionName, dueStr, assigneeStr].filter(Boolean).join(' · ') || '—'}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        style={{
          flexShrink: 0,
          padding: '4px 8px',
          border: '1px solid #000',
          backgroundColor: '#fff',
          color: '#000',
          cursor: 'pointer',
          fontSize: '11px',
        }}
      >
        Delete
      </button>
    </div>
  );
}

function SubtaskCreateRow({
  orgId,
  parentTaskId,
  sections,
  members,
  onCreated,
}: {
  orgId: string;
  parentTaskId: string;
  sections: ProjectSection[];
  members: OrgMember[];
  onCreated: (created: Subtask) => void;
}) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      const created = await apiFetch(`/tasks/${parentTaskId}/subtasks`, {
        method: 'POST',
        headers: { 'x-org-id': orgId },
        body: JSON.stringify({
          title: title.trim(),
          dueDate: dueDate || undefined,
          assigneeUserId: assigneeId || undefined,
          sectionId: sectionId || undefined,
        }),
      });
      onCreated(created as Subtask);
      setTitle('');
      setDueDate('');
      setSectionId('');
      setAssigneeId('');
    } catch (err: any) {
      alert(err.message || 'Failed to create subtask');
    } finally {
      setCreating(false);
    }
  };

  return (
    <form
      onSubmit={handleCreate}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        marginTop: '8px',
      }}
    >
      <input
        type="text"
        placeholder="Add subtask..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={inputStyle}
      />
      <div
        style={{
          display: 'flex',
          gap: '4px',
          flexWrap: 'wrap',
        }}
      >
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          style={inputStyle}
        />
        <select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          style={inputStyle}
        >
          <option value="">Assignee (optional)</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName || m.email}
            </option>
          ))}
        </select>
        <select
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
          style={inputStyle}
        >
          <option value="">Section (parent/auto)</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={creating}
        style={{
          marginTop: '4px',
          padding: '4px 8px',
          backgroundColor: '#000',
          color: '#fff',
          border: 'none',
          cursor: creating ? 'not-allowed' : 'pointer',
          fontSize: '12px',
        }}
      >
        {creating ? 'Adding…' : 'Add subtask'}
      </button>
    </form>
  );
}
const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '8px',
  fontSize: '12px',
  color: '#000',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  marginTop: '4px',
  border: '1px solid #000',
  fontSize: '13px',
};

