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
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fff',
          fontFamily: "'Montserrat', sans-serif",
        }}
      >
        <p style={{ color: '#000' }}>Validating invite...</p>
      </div>
    );
  }

  if (!invite) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fff',
          fontFamily: "'Montserrat', sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: '500px',
            width: '100%',
            padding: '32px',
            border: '1px solid #000',
            color: '#000',
          }}
        >
          <h1 style={{ fontSize: '20px', marginBottom: '16px' }}>Invite</h1>
          <p>{error || 'Invite not found'}</p>
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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff',
        fontFamily: "'Montserrat', sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: '520px',
          width: '100%',
          padding: '32px',
          border: '1px solid #000',
          color: '#000',
        }}
      >
        <h1 style={{ fontSize: '22px', marginBottom: '16px' }}>
          Organization Invite
        </h1>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ marginBottom: '6px' }}>
            <strong>Organization:</strong> {invite.orgName}
          </div>
          <div style={{ marginBottom: '6px' }}>
            <strong>Invited email:</strong> {invite.invitedEmail}
          </div>
          <div style={{ marginBottom: '6px' }}>
            <strong>Role:</strong> {invite.role}
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            Expires:{' '}
            {new Date(invite.expiresAt).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: '8px',
              border: '1px solid #000',
              marginBottom: '12px',
            }}
          >
            {error}
          </div>
        )}

        {notLoggedIn ? (
          <div>
            <p
              style={{
                marginBottom: '12px',
                fontSize: '14px',
              }}
            >
              Login with the invited email to accept this invite.
            </p>
            <a
              href={`/login?returnTo=${encodeURIComponent(loginReturnTo)}`}
              style={{
                display: 'inline-block',
                padding: '10px 18px',
                backgroundColor: '#000',
                color: '#fff',
                textDecoration: 'none',
                fontSize: '14px',
              }}
            >
              Go to login
            </a>
          </div>
        ) : !emailsMatch ? (
          <div>
            <p
              style={{
                marginBottom: '12px',
                fontSize: '14px',
              }}
            >
              You are logged in as <strong>{user?.email}</strong>, but this
              invite is for <strong>{invite.invitedEmail}</strong>.
            </p>
            <button
              type="button"
              onClick={() => {
                logout();
                router.push(
                  `/login?returnTo=${encodeURIComponent(loginReturnTo)}`,
                );
              }}
              style={{
                padding: '10px 18px',
                backgroundColor: '#000',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Log out and switch account
            </button>
          </div>
        ) : (
          <div>
            <p
              style={{
                marginBottom: '12px',
                fontSize: '14px',
              }}
            >
              You are logged in as <strong>{user?.email}</strong>. Click below
              to accept this invite.
            </p>
            <button
              type="button"
              onClick={handleAccept}
              disabled={accepting}
              style={{
                padding: '10px 18px',
                backgroundColor: '#000',
                color: '#fff',
                border: 'none',
                cursor: accepting ? 'not-allowed' : 'pointer',
                fontSize: '14px',
              }}
            >
              {accepting ? 'Accepting...' : 'Accept invite'}
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
          <div
            style={{
              minHeight: '100vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#fff',
              fontFamily: "'Montserrat', sans-serif",
            }}
          >
            <p style={{ color: '#000' }}>Loading invite...</p>
          </div>
        }
      >
        <InviteInner />
      </Suspense>
    </>
  );
}

