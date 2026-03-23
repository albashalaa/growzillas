'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Head from 'next/head';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../lib/api';

interface InviteInfo {
  orgId: string;
  orgName: string;
  invitedEmail: string;
  role: string;
  expiresAt: string;
  acceptedAt?: string | null;
  valid: boolean;
}

function InviteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, logout } = useAuth();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [error, setError] = useState('');
  const [accepting, setAccepting] = useState(false);

  const token = searchParams.get('token') || '';

  useEffect(() => {
    const fetchInvite = async () => {
      if (!token) {
        setError('Missing invite token');
        setLoadingInvite(false);
        return;
      }

      try {
        const res = await fetch(
          `http://localhost:3002/invites/validate?token=${encodeURIComponent(
            token,
          )}`,
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({
            message: 'Invalid invite',
          }));
          throw new Error(err.message || 'Invalid invite');
        }
        const data = (await res.json()) as InviteInfo;
        setInvite(data);
      } catch (err: any) {
        setError(err.message || 'Failed to validate invite');
      } finally {
        setLoadingInvite(false);
      }
    };

    fetchInvite();
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    setError('');

    try {
      const result = await apiFetch('/invites/accept', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      router.push(`/org/${result.orgId}/home`);
    } catch (err: any) {
      setError(err.message || 'Failed to accept invite');
      setAccepting(false);
    }
  };

  if (loadingInvite) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#171717] flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-2xl border border-slate-100 dark:border-neutral-700 bg-white dark:bg-[#202020] px-8 py-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
          <p className="text-sm text-slate-600 dark:text-neutral-300">Validating invite...</p>
        </div>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#171717] flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-100 dark:border-neutral-700 bg-white dark:bg-[#202020] px-8 py-7 shadow-[0_22px_55px_rgba(15,23,42,0.07)]">
          <h1 className="text-[20px] font-semibold text-slate-900 dark:text-neutral-100 mb-2">
            Organization Invite
          </h1>
          <p className="text-sm text-slate-600 dark:text-neutral-300">
            {error || 'Invite not found or is no longer valid.'}
          </p>
        </div>
      </div>
    );
  }

  const loginReturnTo = `/invite?token=${encodeURIComponent(token)}`;

  const notLoggedIn = !user && !loading;
  const loggedIn = !!user && !loading;
  const emailsMatch =
    loggedIn &&
    user!.email.toLowerCase() === invite.invitedEmail.toLowerCase();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#171717] flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-100 bg-white px-5 py-6 shadow-[0_22px_55px_rgba(15,23,42,0.07)] dark:border-neutral-700 dark:bg-[#202020] sm:px-9 sm:py-8">
        <h1 className="text-[20px] font-semibold leading-snug text-slate-900 dark:text-neutral-100 mb-1">
          Organization Invite
        </h1>
        <p className="text-[13px] text-slate-500 dark:text-neutral-400 mb-6">
          You have been invited to join this workspace.
        </p>

        <div className="mb-5 space-y-3 text-[13px]">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-neutral-500">
              Organization
            </div>
            <div className="mt-1 text-slate-800 dark:text-neutral-200">{invite.orgName}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-neutral-500">
              Invited email
            </div>
            <div className="mt-1 text-slate-800 dark:text-neutral-200">{invite.invitedEmail}</div>
          </div>
          <div className="flex gap-6">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-neutral-500">
                Role
              </div>
              <div className="mt-1 inline-flex rounded-full bg-slate-100 dark:bg-[#2a2a2a] px-3 py-1 text-[12px] font-medium text-slate-700 dark:text-neutral-200">
                {invite.role}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-neutral-500">
                Expires
              </div>
              <div className="mt-1 text-[12px] text-slate-500 dark:text-neutral-400">
                {new Date(invite.expiresAt).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-[13px] text-amber-800 dark:text-amber-200">
            {error}
          </div>
        )}

        {notLoggedIn ? (
          <div className="space-y-3">
            <p className="text-[13px] text-slate-600 dark:text-neutral-300">
              Login with the invited email to accept this invitation.
            </p>
            <a
              href={`/login?returnTo=${encodeURIComponent(loginReturnTo)}`}
              className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 dark:bg-neutral-100 px-4 py-2.5 text-[13px] font-medium text-white dark:text-neutral-900 shadow-sm transition hover:bg-slate-950 dark:hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-neutral-300 focus:ring-offset-2 dark:focus:ring-offset-[#202020]"
            >
              Go to login
            </a>
          </div>
        ) : !emailsMatch ? (
          <div className="space-y-3">
            <p className="text-[13px] text-slate-600 dark:text-neutral-300">
              You are logged in as{' '}
              <span className="font-semibold text-slate-900 dark:text-neutral-100">{user?.email}</span>, but this
              invite is for{' '}
              <span className="font-semibold text-slate-900 dark:text-neutral-100">
                {invite.invitedEmail}
              </span>
              .
            </p>
            <button
              type="button"
              onClick={() => {
                logout();
                router.push(
                  `/login?returnTo=${encodeURIComponent(loginReturnTo)}`,
                );
              }}
              className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 dark:bg-neutral-100 px-4 py-2.5 text-[13px] font-medium text-white dark:text-neutral-900 shadow-sm transition hover:bg-slate-950 dark:hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-neutral-300 focus:ring-offset-2 dark:focus:ring-offset-[#202020]"
            >
              Log out and switch account
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[13px] text-slate-600 dark:text-neutral-300">
              You are logged in as{' '}
              <span className="font-semibold text-slate-900 dark:text-neutral-100">
                {user?.email}
              </span>
              . Click below to accept this invite.
            </p>
            <button
              type="button"
              onClick={handleAccept}
              disabled={accepting}
              className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 dark:bg-neutral-100 px-4 py-2.5 text-[13px] font-medium text-white dark:text-neutral-900 shadow-sm transition hover:bg-slate-950 dark:hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-neutral-300 focus:ring-offset-2 dark:focus:ring-offset-[#202020] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {accepting ? 'Accepting…' : 'Accept invite'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InvitePage() {
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
      <Suspense
        fallback={
          <div className="min-h-screen bg-slate-50 dark:bg-[#171717] flex items-center justify-center px-4">
            <div className="max-w-md w-full rounded-2xl border border-slate-100 dark:border-neutral-700 bg-white dark:bg-[#202020] px-8 py-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
              <p className="text-sm text-slate-600 dark:text-neutral-300">Loading invite...</p>
            </div>
          </div>
        }
      >
        <InviteInner />
      </Suspense>
    </>
  );
}

