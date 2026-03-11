'use client';

import { Suspense, useState } from 'react';
import Head from 'next/head';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../lib/api';
import { setToken } from '../../lib/auth';
import { handlePostAuthRedirect } from '../../lib/postAuthRedirect';

function RegisterInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, refreshMe } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
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
      const result = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          password,
        }),
      });

      if (result && result.access_token) {
        // Backend returned a token directly
        setToken(result.access_token);
        await refreshMe();
      } else {
        // Fallback: perform a login with the same credentials
        await login(email.trim(), password);
      }

      await handlePostAuthRedirect(router, { returnTo });
    } catch (err: any) {
      const msg = err?.message || 'Registration failed';
      if (msg.toLowerCase().includes('email already in use')) {
        setError('Email already in use');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

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
            Create account
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
                First Name
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
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
                Last Name
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
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
              }}
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

export default function RegisterPage() {
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
      <RegisterInner />
    </Suspense>
  );
}

