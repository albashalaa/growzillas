'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setToken } from '../../../lib/auth';
import { useAuth } from '../../../contexts/AuthContext';
import { apiFetch } from '../../../lib/api';

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshMe } = useAuth();
  const [error, setError] = useState('');

  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const handleCallback = async () => {
      try {
        const token = searchParams.get('token');

        if (!token) {
          setError('No token received');
          return;
        }

        setToken(token);
        await refreshMe();

        // Check for stored returnTo from Google login (e.g. invite link)
        let returnTo: string | null = null;
        if (typeof window !== 'undefined') {
          returnTo = window.localStorage.getItem('auth_returnTo');
          if (returnTo) {
            window.localStorage.removeItem('auth_returnTo');
          }
        }

        if (returnTo) {
          router.push(returnTo);
          return;
        }

        // Fallback: use /auth/me org context to route
        const me = await apiFetch('/auth/me');
        if (me.orgId) {
          router.push(`/org/${me.orgId}/home`);
        } else {
          router.push('/create-org');
        }
      } catch (err: any) {
        setError(err.message || 'Authentication failed');
      }
    };

    void handleCallback();
  }, [searchParams, router, refreshMe]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff',
      }}
    >
      <div style={{ textAlign: 'center', color: '#000' }}>
        {error ? (
          <div>
            <h1 style={{ fontSize: '24px', marginBottom: '20px' }}>
              Authentication Failed
            </h1>
            <p>{error}</p>
            <a
              href="/login"
              style={{
                color: '#000',
                textDecoration: 'underline',
                marginTop: '20px',
                display: 'inline-block',
              }}
            >
              Back to login
            </a>
          </div>
        ) : (
          <div>
            <h1 style={{ fontSize: '24px', marginBottom: '20px' }}>
              Logging you in...
            </h1>
            <p>Please wait...</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#fff',
          }}
        >
          <div style={{ textAlign: 'center', color: '#000' }}>
            <h1 style={{ fontSize: '24px', marginBottom: '20px' }}>
              Logging you in...
            </h1>
            <p>Please wait...</p>
          </div>
        </div>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}

