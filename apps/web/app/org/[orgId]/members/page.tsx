'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '../../../../lib/api';
import { useAuth } from '../../../../contexts/AuthContext';

interface Member {
  userId: string;
  email: string;
  role: string;
  joinedAt: string;
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  inviteLink?: string;
}

export default function OrgMembersPage() {
  const params = useParams();
  const { user } = useAuth();
  const orgId = params.orgId as string;

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Search + role filtering (applies only to the members table).
  const [searchQuery, setSearchQuery] = useState('');
  type RoleFilter = 'ALL' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER');
  const [inviting, setInviting] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  const loadMembers = async () => {
    try {
      const data = await apiFetch(`/orgs/${orgId}/members`, {
        headers: { 'x-org-id': orgId },
      });
      setMembers(data as Member[]);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load members');
    }
  };

  const loadInvites = async () => {
    try {
      const data = await apiFetch(`/orgs/${orgId}/invites`, {
        headers: { 'x-org-id': orgId },
      });
      setInvites(Array.isArray(data) ? (data as PendingInvite[]) : []);
    } catch {
      setInvites([]);
    }
  };

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true);
      await loadMembers();
      await loadInvites();
      setLoading(false);
    };
    void load();
  }, [orgId, user]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    setInviting(true);
    setLastInviteLink(null);
    try {
      const res = (await apiFetch(`/orgs/${orgId}/invites`, {
        method: 'POST',
        headers: { 'x-org-id': orgId },
        body: JSON.stringify({ email, role: inviteRole }),
      })) as { inviteLink?: string };
      setInviteEmail('');
      if (res?.inviteLink) setLastInviteLink(res.inviteLink);
      await loadInvites();
    } catch (err: any) {
      alert(err.message || 'Failed to send invite');
    } finally {
      setInviting(false);
    }
  };

  const copyInviteLink = (link: string) => {
    navigator.clipboard.writeText(link).then(() => alert('Link copied to clipboard.'));
  };

  const handleUpdateRole = async (userId: string, role: 'ADMIN' | 'MEMBER') => {
    try {
      await apiFetch(`/orgs/${orgId}/members/${userId}`, {
        method: 'PATCH',
        headers: { 'x-org-id': orgId },
        body: JSON.stringify({ role }),
      });
      await loadMembers();
    } catch (err: any) {
      alert(err.message || 'Failed to update role');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!window.confirm('Remove this member from the organization?')) return;
    try {
      await apiFetch(`/orgs/${orgId}/members/${userId}`, {
        method: 'DELETE',
        headers: { 'x-org-id': orgId },
      });
      await loadMembers();
    } catch (err: any) {
      alert(err.message || 'Failed to remove member');
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      await apiFetch(`/orgs/${orgId}/invites/${inviteId}`, {
        method: 'DELETE',
        headers: { 'x-org-id': orgId },
      });
      await loadInvites();
    } catch (err: any) {
      alert(err.message || 'Failed to revoke invite');
    }
  };

  const getInitial = (email: string) => email.charAt(0).toUpperCase();

  const formatRole = (role: string) => {
    if (role === 'ADMIN') return 'Admin';
    if (role === 'VIEWER') return 'Viewer';
    return 'Member';
  };

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return members.filter((m) => {
      const email = m.email.toLowerCase();
      const namePart = (m.email.split('@')[0] || '').toLowerCase();

      const matchesSearch = !q || email.includes(q) || namePart.includes(q);
      const matchesRole = roleFilter === 'ALL' || m.role === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [members, roleFilter, searchQuery]);

  const statusForMember = (index: number) => {
    const cycle = index % 4;
    if (cycle === 0) return { label: 'Active', color: 'bg-emerald-500' };
    if (cycle === 1) return { label: 'Active', color: 'bg-emerald-500' };
    if (cycle === 2) return { label: 'Away', color: 'bg-amber-400' };
    return { label: 'Offline', color: 'bg-slate-400' };
  };

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-start gap-4">
          <div>
            <h1 className="text-[22px] font-semibold leading-tight text-slate-900">
              Team Members
            </h1>
            <p className="mt-1 text-[13px] text-slate-500">
              Manage your team and their permissions.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <>
            {/* Invite form (keeps existing behavior) */}
            {user?.role === 'ADMIN' && (
              <div id="invite-form" className="mb-8 rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm">
                <h2 className="mb-3 text-[14px] font-semibold text-slate-900">
                  Invite member
                </h2>
                <form
                  onSubmit={handleInvite}
                  className="flex flex-wrap items-center gap-3"
                >
                  <input
                    type="email"
                    placeholder="Email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="h-9 min-w-[200px] flex-1 rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-900 shadow-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 placeholder:text-slate-400"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) =>
                      setInviteRole(e.target.value as 'MEMBER' | 'ADMIN')
                    }
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                  >
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                  <button
                    type="submit"
                    disabled={inviting}
                    className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-4 text-[13px] font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {inviting ? 'Sending…' : 'Send invite'}
                  </button>
                </form>

                {lastInviteLink && (
                  <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <div className="mb-1 text-[11px] font-medium text-slate-700">
                      Invite link (share with the invited user):
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={lastInviteLink}
                        className="h-8 min-w-[200px] flex-1 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-800"
                      />
                      <button
                        type="button"
                        onClick={() => copyInviteLink(lastInviteLink)}
                        className="inline-flex h-8 items-center rounded-md bg-slate-900 px-3 text-[12px] font-medium text-white hover:bg-slate-800"
                      >
                        Copy link
                      </button>
                    </div>
                  </div>
                )}

                {user?.role === 'ADMIN' && invites.length > 0 && (
                  <div className="mt-4">
                    <h3 className="mb-2 text-[13px] font-semibold text-slate-900">
                      Pending invites
                    </h3>
                    <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white">
                      {invites.map((inv) => (
                        <div
                          key={inv.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-[12px]"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-900">
                              {inv.email}
                            </div>
                            <div className="text-slate-500 text-[11px]">
                              Role: {formatRole(inv.role)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {inv.inviteLink && (
                              <button
                                type="button"
                                onClick={() => copyInviteLink(inv.inviteLink!)}
                                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                              >
                                Copy link
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRevokeInvite(inv.id)}
                              className="inline-flex items-center rounded-lg border border-rose-100 bg-rose-50 px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-100"
                            >
                              Revoke
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Search / filter bar */}
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
                  placeholder="Search members..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-[13px] text-slate-900 outline-none transition focus:border-slate-900 focus:bg-white focus:ring-1 focus:ring-slate-900 placeholder:text-slate-400"
                />
              </div>
              <div className="ml-0 flex w-full items-center gap-2 sm:ml-4 sm:w-auto">
                <span className="text-[12px] font-medium text-slate-600">Role</span>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
                  aria-label="Filter by role"
                  className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-600 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 sm:w-auto"
                >
                  <option value="ALL">All roles</option>
                  <option value="ADMIN">Admin</option>
                  <option value="MEMBER">Member</option>
                  <option value="VIEWER">Viewer</option>
                </select>
              </div>
            </div>

            {/* Members table */}
            <div className="mb-8 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
              <div className="overflow-x-auto">
              <div className="min-w-[840px] border-b border-slate-100 px-4 py-3 sm:px-6">
                <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.1fr)_40px] items-center text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                  <span>Member</span>
                  <span>Role</span>
                  <span>Status</span>
                  <span>Last Active</span>
                  <span className="text-right">Actions</span>
                </div>
              </div>

              {members.length === 0 ? (
                <div className="px-6 py-8 text-sm text-slate-500">
                  No members yet.
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="px-6 py-8 text-sm text-slate-500">
                  No members found
                </div>
              ) : (
                <div className="min-w-[840px] divide-y divide-slate-100">
                  {filteredMembers.map((m, index) => {
                    const status = statusForMember(index);
                    return (
                      <div
                        key={m.userId}
                        className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.1fr)_40px] items-center px-4 py-3 text-[13px] sm:px-6"
                      >
                        {/* Member */}
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-[13px] font-semibold text-slate-700">
                            {getInitial(m.email)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-medium text-slate-900">
                              {m.email.split('@')[0] || m.email}
                            </div>
                            <div className="truncate text-[12px] text-slate-500">{m.email}</div>
                          </div>
                        </div>

                        {/* Role */}
                        <div className="flex items-center gap-2 text-[12px] text-slate-700">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[11px] font-medium text-slate-500">
                            {formatRole(m.role).charAt(0)}
                          </span>
                          <span>{formatRole(m.role)}</span>
                        </div>

                        {/* Status */}
                        <div className="flex items-center gap-2 text-[12px] text-slate-600">
                          <span className={`h-2 w-2 rounded-full ${status.color}`} />
                          <span>{status.label}</span>
                        </div>

                        {/* Last active */}
                        <div className="flex items-center gap-2 text-[12px] text-slate-500">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100">
                            <span className="block h-2 w-2 rounded-sm bg-slate-400" />
                          </span>
                          <span>{new Date(m.joinedAt).toLocaleDateString()}</span>
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end">
                          {user?.role === 'ADMIN' ? (
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <select
                                value={m.role}
                                onChange={(e) =>
                                  handleUpdateRole(
                                    m.userId,
                                    e.target.value as 'ADMIN' | 'MEMBER',
                                  )
                                }
                                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[12px] text-slate-700 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                              >
                                <option value="MEMBER">Member</option>
                                <option value="ADMIN">Admin</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => handleRemoveMember(m.userId)}
                                className="inline-flex min-h-[34px] items-center rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
                            >
                              <span className="block h-1 w-1 rounded-full bg-slate-400" />
                              <span className="mx-[1px] block h-1 w-1 rounded-full bg-slate-400" />
                              <span className="block h-1 w-1 rounded-full bg-slate-400" />
                            </button>
                          )}
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
      </div>
    </div>
  );
}
