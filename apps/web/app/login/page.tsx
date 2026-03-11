'use client';

import { Suspense, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { handlePostAuthRedirect } from '../../lib/postAuthRedirect';

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const returnTo = searchParams.get('returnTo') || null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email.trim(), password);
      await handlePostAuthRedirect(router, { returnTo });
    } catch (err: any) {
      const msg = err?.message || 'Authentication failed';
      if (msg.toLowerCase().includes('invalid credentials')) {
        setError('Invalid email or password');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    if (typeof window !== 'undefined') {
      if (returnTo) {
        window.localStorage.setItem('auth_returnTo', returnTo);
      }
      window.location.href = 'http://localhost:3002/auth/google';
    }
  };

  const registerHref = returnTo
    ? `/register?returnTo=${encodeURIComponent(returnTo)}`
    : '/register';

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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fff',
          fontFamily: "'Montserrat', sans-serif",
        }}
      >
        <div style={{ width: '100%', maxWidth: '400px', padding: '20px' }}>
          <h1
            style={{
              fontSize: '24px',
              marginBottom: '20px',
              color: '#000',
            }}
          >
            Login
          </h1>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '15px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '5px',
                  color: '#000',
                }}
              >
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #000',
                  backgroundColor: '#fff',
                  color: '#000',
                }}
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '5px',
                  color: '#000',
                }}
              >
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #000',
                  backgroundColor: '#fff',
                  color: '#000',
                }}
              />
            </div>

            {error && (
              <div
                style={{
                  color: '#000',
                  marginBottom: '15px',
                  padding: '8px',
                  border: '1px solid #000',
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#000',
                color: '#fff',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                marginBottom: '15px',
              }}
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <div
            style={{
              textAlign: 'center',
              color: '#000',
              marginBottom: '15px',
              position: 'relative',
            }}
          >
            <div
              style={{
                borderTop: '1px solid #000',
                position: 'absolute',
                width: '100%',
                top: '50%',
              }}
            />
            <span
              style={{
                backgroundColor: '#fff',
                padding: '0 10px',
                position: 'relative',
              }}
            >
              or
            </span>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: '#fff',
              color: '#000',
              border: '1px solid #000',
              cursor: 'pointer',
              marginBottom: '12px',
            }}
          >
            Continue with Google
          </button>

          <div style={{ fontSize: '13px', color: '#000', textAlign: 'center' }}>
            <span>Don&apos;t have an account? </span>
            <Link
              href={registerHref}
              style={{ color: '#000', textDecoration: 'underline' }}
            >
              Create one
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

export default function LoginPage() {
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
            fontFamily: "'Montserrat', sans-serif",
          }}
        >
          <p style={{ color: '#000' }}>Loading...</p>
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}


