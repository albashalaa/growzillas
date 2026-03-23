'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { apiFetch } from '../../lib/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TaskResult {
  id: string;
  title: string;
  projectId: string;
  sectionId: string;
  parentId: string | null;
  priority: string;
  dueDate: string | null;
  projectName: string;
  sectionName: string;
  assignees: { id: string; email: string }[];
}

interface ProjectResult {
  id: string;
  name: string;
  description: string | null;
}

interface MemberResult {
  id: string;
  displayName: string;
  email: string;
  role: string;
}

interface SearchResults {
  tasks: TaskResult[];
  projects: ProjectResult[];
  members: MemberResult[];
}

type FlatItem =
  | { kind: 'task'; data: TaskResult }
  | { kind: 'project'; data: ProjectResult }
  | { kind: 'member'; data: MemberResult };

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function GlobalSearch() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;

  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  /* ---------- flatten results into a single indexed list ---------- */

  const flatItems: FlatItem[] = React.useMemo(() => {
    if (!results) return [];
    const items: FlatItem[] = [];
    for (const t of results.tasks) items.push({ kind: 'task', data: t });
    for (const p of results.projects) items.push({ kind: 'project', data: p });
    for (const m of results.members) items.push({ kind: 'member', data: m });
    return items;
  }, [results]);

  /* ---------- debounced search ----------------------------------- */

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) {
        setResults(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await apiFetch(
          `/search?q=${encodeURIComponent(trimmed)}`,
          { headers: { 'x-org-id': orgId } },
        );
        setResults(data as SearchResults);
        setActiveIdx(0);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    },
    [orgId],
  );

  const onInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => runSearch(value), 250);
  };

  /* ---------- open / close --------------------------------------- */

  const openPanel = () => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const closePanel = () => {
    setOpen(false);
    setQuery('');
    setResults(null);
    setActiveIdx(0);
  };

  /* ---------- Cmd+K global shortcut ----------------------------- */

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (open) {
          closePanel();
        } else {
          openPanel();
        }
      }
      if (e.key === 'Escape' && open) {
        closePanel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  /* ---------- click outside -------------------------------------- */

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node)
      ) {
        closePanel();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  /* ---------- keyboard navigation -------------------------------- */

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && flatItems.length > 0) {
      e.preventDefault();
      selectItem(flatItems[activeIdx]);
    } else if (e.key === 'Escape') {
      closePanel();
    }
  };

  /* ---------- scroll active item into view ----------------------- */

  useEffect(() => {
    const el = document.querySelector(`[data-search-idx="${activeIdx}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  /* ---------- select an item ------------------------------------- */

  const selectItem = (item: FlatItem) => {
    closePanel();
    switch (item.kind) {
      case 'task': {
        const t = item.data;
        router.push(`/org/${orgId}/tasks?taskId=${t.id}`);
        break;
      }
      case 'project':
        router.push(`/org/${orgId}/projects/${item.data.id}`);
        break;
      case 'member':
        router.push(`/org/${orgId}/members`);
        break;
    }
  };

  /* ---------- group helpers -------------------------------------- */

  const hasAnyResults =
    results &&
    (results.tasks.length > 0 ||
      results.projects.length > 0 ||
      results.members.length > 0);

  let runningIdx = 0;
  const nextIdx = () => runningIdx++;

  /* ---------- render --------------------------------------------- */

  return (
    <>
      {/* Trigger — the styled search input in the navbar */}
      <div className="min-w-0 flex-1 max-w-lg">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <svg
              width={16}
              height={16}
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="7.5"
                cy="7.5"
                r="3.5"
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
            placeholder="Search… (⌘K)"
            className="top-nav-search h-9 w-full cursor-pointer rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-[13px] text-slate-900 outline-none placeholder:text-slate-400 shadow-sm transition focus:border-slate-900 focus:bg-white focus:ring-1 focus:ring-slate-300 dark:focus:border-neutral-600 dark:focus:ring-neutral-500 sm:h-10"
            onFocus={openPanel}
            readOnly
          />
        </div>
      </div>

      {/* Overlay + Panel — rendered via portal so it floats above everything */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[9998]">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/20" />

            {/* Centered search panel */}
            <div className="flex justify-center px-3 pt-4 sm:px-4 sm:pt-[56px]">
              <div
                ref={panelRef}
                className="w-full max-w-[600px] overflow-hidden rounded-xl border border-slate-100 bg-white shadow-xl shadow-slate-200/60 sm:rounded-2xl"
              >
                {/* Search input */}
                <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                  <svg
                    width={18}
                    height={18}
                    viewBox="0 0 16 16"
                    fill="none"
                    className="shrink-0 text-slate-400"
                  >
                    <circle
                      cx="7.5"
                      cy="7.5"
                      r="3.5"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    />
                    <path
                      d="M10.3 10.3L12.5 12.5"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                    />
                  </svg>
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => onInputChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Search tasks, projects, members…"
                    className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[14px] text-slate-900 outline-none placeholder:text-slate-400 shadow-sm transition focus:border-slate-900 focus:bg-white focus:ring-1 focus:ring-slate-300 dark:focus:border-neutral-600 dark:focus:ring-neutral-500"
                    autoComplete="off"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery('');
                        setResults(null);
                        inputRef.current?.focus();
                      }}
                      className="rounded p-0.5 text-slate-400 hover:text-slate-600"
                    >
                      <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
                        <path
                          d="M4 4l6 6M10 4l-6 6"
                          stroke="currentColor"
                          strokeWidth="1.3"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  )}
                  <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-slate-200 bg-slate-50 px-1.5 text-[10px] font-medium text-slate-400">
                    ESC
                  </kbd>
                </div>

                {/* Results area */}
                <div className="max-h-[400px] overflow-y-auto">
                  {/* Empty state — no query yet */}
                  {!query.trim() && (
                    <div className="px-4 py-8 text-center text-[13px] text-slate-400">
                      Start typing to search across your workspace…
                    </div>
                  )}

                  {/* Loading */}
                  {query.trim() && loading && !results && (
                    <div className="px-4 py-8 text-center text-[13px] text-slate-400">
                      Searching…
                    </div>
                  )}

                  {/* No results */}
                  {query.trim() && results && !hasAnyResults && (
                    <div className="px-4 py-8 text-center text-[13px] text-slate-400">
                      No results for &ldquo;{query.trim()}&rdquo;
                    </div>
                  )}

                  {/* Grouped results */}
                  {results && hasAnyResults && (
                    <div className="py-1">
                      {/* Tasks */}
                      {results.tasks.length > 0 && (
                        <div>
                          <div className="px-4 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            Tasks
                          </div>
                          {results.tasks.map((task) => {
                            const idx = nextIdx();
                            return (
                              <button
                                key={task.id}
                                data-search-idx={idx}
                                type="button"
                                onMouseEnter={() => setActiveIdx(idx)}
                                onClick={() =>
                                  selectItem({ kind: 'task', data: task })
                                }
                                className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                                  activeIdx === idx
                                    ? 'bg-slate-50'
                                    : 'bg-white'
                                }`}
                              >
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
                                  <svg
                                    width={14}
                                    height={14}
                                    viewBox="0 0 16 16"
                                    fill="none"
                                  >
                                    <rect
                                      x="2"
                                      y="2"
                                      width="12"
                                      height="12"
                                      rx="3"
                                      stroke="currentColor"
                                      strokeWidth="1.3"
                                    />
                                    <path
                                      d="M5.5 8l2 2 3-4"
                                      stroke="currentColor"
                                      strokeWidth="1.3"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-[13px] font-medium text-slate-800">
                                    {task.parentId && (
                                      <span className="mr-1 text-[11px] text-slate-400">
                                        Subtask ›
                                      </span>
                                    )}
                                    {task.title}
                                  </div>
                                  <div className="truncate text-[11px] text-slate-400">
                                    {task.projectName}
                                    {task.sectionName &&
                                      ` · ${task.sectionName}`}
                                  </div>
                                </div>
                                {task.priority && (
                                  <PriorityDot priority={task.priority} />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Projects */}
                      {results.projects.length > 0 && (
                        <div>
                          <div className="px-4 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            Projects
                          </div>
                          {results.projects.map((project) => {
                            const idx = nextIdx();
                            return (
                              <button
                                key={project.id}
                                data-search-idx={idx}
                                type="button"
                                onMouseEnter={() => setActiveIdx(idx)}
                                onClick={() =>
                                  selectItem({
                                    kind: 'project',
                                    data: project,
                                  })
                                }
                                className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                                  activeIdx === idx
                                    ? 'bg-slate-50'
                                    : 'bg-white'
                                }`}
                              >
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-500">
                                  <svg
                                    width={14}
                                    height={14}
                                    viewBox="0 0 16 16"
                                    fill="none"
                                  >
                                    <rect
                                      x="2"
                                      y="3"
                                      width="12"
                                      height="10"
                                      rx="2"
                                      stroke="currentColor"
                                      strokeWidth="1.3"
                                    />
                                    <path
                                      d="M2 6h12"
                                      stroke="currentColor"
                                      strokeWidth="1.3"
                                    />
                                  </svg>
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-[13px] font-medium text-slate-800">
                                    {project.name}
                                  </div>
                                  {project.description && (
                                    <div className="truncate text-[11px] text-slate-400">
                                      {project.description}
                                    </div>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Members */}
                      {results.members.length > 0 && (
                        <div>
                          <div className="px-4 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            Members
                          </div>
                          {results.members.map((member) => {
                            const idx = nextIdx();
                            return (
                              <button
                                key={member.id}
                                data-search-idx={idx}
                                type="button"
                                onMouseEnter={() => setActiveIdx(idx)}
                                onClick={() =>
                                  selectItem({
                                    kind: 'member',
                                    data: member,
                                  })
                                }
                                className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                                  activeIdx === idx
                                    ? 'bg-slate-50'
                                    : 'bg-white'
                                }`}
                              >
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold uppercase text-slate-500">
                                  {(member.displayName || member.email)[0]}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-[13px] font-medium text-slate-800">
                                    {member.displayName}
                                  </div>
                                  <div className="truncate text-[11px] text-slate-400">
                                    {member.email}
                                    {member.role && ` · ${member.role}`}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer */}
                {query.trim() && hasAnyResults && (
                  <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2">
                    <div className="flex items-center gap-3 text-[11px] text-slate-400">
                      <span>
                        <kbd className="rounded border border-slate-200 bg-slate-50 px-1 text-[10px]">
                          ↑↓
                        </kbd>{' '}
                        navigate
                      </span>
                      <span>
                        <kbd className="rounded border border-slate-200 bg-slate-50 px-1 text-[10px]">
                          ↵
                        </kbd>{' '}
                        open
                      </span>
                      <span>
                        <kbd className="rounded border border-slate-200 bg-slate-50 px-1 text-[10px]">
                          esc
                        </kbd>{' '}
                        close
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}

    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Small helpers                                                      */
/* ------------------------------------------------------------------ */

function PriorityDot({ priority }: { priority: string }) {
  const color =
    priority === 'URGENT'
      ? 'bg-red-400'
      : priority === 'HIGH'
        ? 'bg-orange-400'
        : priority === 'MEDIUM'
          ? 'bg-yellow-400'
          : 'bg-slate-300';
  return <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} />;
}
