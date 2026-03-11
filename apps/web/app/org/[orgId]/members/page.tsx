'use client';

import { useEffect, useState } from 'react';
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

  return (
    <div style={{ padding: '40px 24px', fontFamily: "'Montserrat', sans-serif" }}>
      <h1 style={{ fontSize: '24px', marginBottom: '8px', color: '#111' }}>Members</h1>
      <p style={{ marginBottom: '16px', color: '#555' }}>
        Member management for this organization.
      </p>

      {error && (
        <div
          style={{
            marginBottom: '16px',
            padding: '10px',
            border: '1px solid #000',
            color: '#111',
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#555' }}>Loading…</p>
      ) : (
        <>
          {user?.role === 'ADMIN' && (
          <form
            onSubmit={handleInvite}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              alignItems: 'center',
              marginBottom: '24px',
              padding: '12px',
              border: '1px solid #000',
            }}
          >
            <input
              type="email"
              placeholder="Email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              style={{
                padding: '6px 8px',
                border: '1px solid #000',
                fontSize: '14px',
              }}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'MEMBER' | 'ADMIN')}
              style={{
                padding: '6px 8px',
                border: '1px solid #000',
                fontSize: '14px',
              }}
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </select>
            <button
              type="submit"
              disabled={inviting}
              style={{
                padding: '6px 12px',
                backgroundColor: '#000',
                color: '#fff',
                border: 'none',
                cursor: inviting ? 'not-allowed' : 'pointer',
                fontSize: '14px',
              }}
            >
              {inviting ? 'Sending…' : 'Invite'}
            </button>
          </form>
          )}

          {lastInviteLink && (
            <div
              style={{
                marginBottom: '24px',
                padding: '12px',
                border: '1px solid #000',
                backgroundColor: '#f9f9f9',
              }}
            >
              <div style={{ fontSize: '12px', marginBottom: '6px', color: '#111' }}>
                Invite link (share with the invited user):
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  readOnly
                  value={lastInviteLink}
                  style={{
                    flex: '1',
                    minWidth: '200px',
                    padding: '6px 8px',
                    border: '1px solid #000',
                    fontSize: '13px',
                    color: '#111',
                  }}
                />
                <button
                  type="button"
                  onClick={() => copyInviteLink(lastInviteLink)}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#000',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Copy link
                </button>
              </div>
            </div>
          )}

          {user?.role === 'ADMIN' && invites.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '16px', marginBottom: '8px', color: '#111' }}>
                Pending invites
              </h2>
              <div style={{ border: '1px solid #000' }}>
                {invites.map((inv) => (
                  <div
                    key={inv.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      borderBottom: '1px solid #eee',
                    }}
                  >
                    <span style={{ color: '#111' }}>{inv.email}</span>
                    <span style={{ fontSize: '12px', color: '#555' }}>{inv.role}</span>
                    {inv.inviteLink && (
                      <button
                        type="button"
                        onClick={() => copyInviteLink(inv.inviteLink!)}
                        style={{
                          padding: '4px 8px',
                          border: '1px solid #000',
                          backgroundColor: '#fff',
                          color: '#111',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        Copy link
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRevokeInvite(inv.id)}
                      style={{
                        padding: '4px 8px',
                        border: '1px solid #000',
                        backgroundColor: '#fff',
                        color: '#111',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h2 style={{ fontSize: '16px', marginBottom: '8px', color: '#111' }}>Members</h2>
          <div style={{ border: '1px solid #000' }}>
            {members.length === 0 ? (
              <div style={{ padding: '12px', color: '#555' }}>No members yet.</div>
            ) : (
              members.map((m) => (
                  <div
                    key={m.userId}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      borderBottom: '1px solid #eee',
                    }}
                  >
                  <div>
                    <span style={{ fontWeight: 500, color: '#111' }}>{m.email}</span>
                    <span style={{ marginLeft: '8px', fontSize: '12px', color: '#555' }}>
                      {new Date(m.joinedAt).toLocaleDateString()}
                    </span>
                  </div>
                  {user?.role === 'ADMIN' && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <select
                      value={m.role}
                      onChange={(e) =>
                        handleUpdateRole(m.userId, e.target.value as 'ADMIN' | 'MEMBER')
                      }
                      style={{
                        padding: '4px 8px',
                        border: '1px solid #000',
                        fontSize: '12px',
                      }}
                    >
                      <option value="MEMBER">Member</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(m.userId)}
                      style={{
                        padding: '4px 8px',
                        border: '1px solid #000',
                        backgroundColor: '#fff',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  )}
                  {user?.role !== 'ADMIN' && (
                  <span style={{ fontSize: '12px', color: '#555' }}>{m.role}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
