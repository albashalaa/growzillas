'use client';

import { Suspense, useState } from 'react';
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

  const handleFullNameChange = (value: string) => {
    const trimmed = value;
    const parts = trimmed.split(' ');
    setFirstName(parts[0] ?? '');
    setLastName(parts.slice(1).join(' ') ?? '');
  };

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
        setError(
          'An account with this email already exists. Please sign in instead.',
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        {/* Logo block */}
        <div className="mb-8 flex justify-center">
          <div className="flex items-center gap-3">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white text-sm font-semibold shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
              aria-hidden
            >
              G
            </div>
            <span className="text-xl font-semibold tracking-normal text-slate-900">
              Growzillas
            </span>
          </div>
        </div>

        {/* Card */}
        <div className="login-card mx-auto w-full max-w-md rounded-2xl border border-slate-100 bg-white px-5 py-6 shadow-[0_22px_55px_rgba(15,23,42,0.07)] sm:px-9 sm:py-8">
          <div className="mb-5">
          <h1 className="text-[20px] font-semibold leading-snug text-slate-900">
              Create an account
            </h1>
          <p className="mt-1.5 text-[13px] text-slate-500">
              Start managing your projects more efficiently
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label
                className="block text-[11px] font-medium text-slate-700"
                htmlFor="fullName"
              >
                Full name
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-300">
                  <svg
                    aria-hidden="true"
                    className="h-3.5 w-3.5"
                    viewBox="0 0 20 20"
                    fill="none"
                  >
                    <circle
                      cx="10"
                      cy="7"
                      r="3"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                    <path
                      d="M4.5 15.5C5.3 13.8 7.1 12.5 10 12.5C12.9 12.5 14.7 13.8 15.5 15.5"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <input
                  id="fullName"
                  type="text"
                  value={[firstName, lastName].filter(Boolean).join(' ')}
                  onChange={(e) => handleFullNameChange(e.target.value)}
                  required
                  className="block w-full h-10 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[13px] text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-1 focus:ring-slate-900 placeholder:text-slate-400"
                  placeholder="John Doe"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label
                className="block text-[11px] font-medium text-slate-700"
                htmlFor="email"
              >
                Email address
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-300">
                  <svg
                    aria-hidden="true"
                    className="h-3.5 w-3.5"
                    viewBox="0 0 20 20"
                    fill="none"
                  >
                    <rect
                      x="3"
                      y="4"
                      width="14"
                      height="12"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                    <path
                      d="M4 6.5 9.25 10a2 2 0 0 0 2 0L16 6.5"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="block w-full h-10 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[13px] text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-1 focus:ring-slate-900 placeholder:text-slate-400"
                  placeholder="name@company.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label
                className="block text-[11px] font-medium text-slate-700"
                htmlFor="password"
              >
                Password
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-300">
                  <svg
                    aria-hidden="true"
                    className="h-3.5 w-3.5"
                    viewBox="0 0 20 20"
                    fill="none"
                  >
                    <rect
                      x="4"
                      y="8"
                      width="12"
                      height="8"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                    <path
                      d="M7 8V6.5A3.5 3.5 0 0 1 10.5 3 3.5 3.5 0 0 1 14 6.5V8"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="block w-full h-10 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[13px] text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-1 focus:ring-slate-900 placeholder:text-slate-400"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex items-start gap-2 text-[11px] text-slate-500">
              <input
                id="terms"
                type="checkbox"
                className="mt-[3px] h-3.5 w-3.5 rounded border border-slate-300 bg-white text-slate-900 focus:ring-slate-900"
              />
              <label htmlFor="terms" className="select-none">
                I agree to the{' '}
                <span className="font-semibold text-slate-900">Terms of Service</span>{' '}
                and{' '}
                <span className="font-semibold text-slate-900">Privacy Policy</span>
              </label>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-[13px] font-medium text-white shadow-sm transition hover:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? (
                'Creating account...'
              ) : (
                <span className="inline-flex items-center gap-2">
                  <span>Create account</span>
                  <span className="mt-px">
                    <svg
                      aria-hidden="true"
                      className="h-3.5 w-3.5"
                      viewBox="0 0 20 20"
                      fill="none"
                    >
                      <path
                        d="M11.5 5L16 9.5L11.5 14"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M4 9.5H15.5"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                </span>
              )}
            </button>

            <div className="pt-2 text-center text-[11px] text-slate-500">
              <span>Already have an account? </span>
              <a
                href={returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : '/login'}
                className="font-semibold text-slate-900 hover:text-slate-700"
              >
                Sign in
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <p className="text-slate-900">Loading...</p>
        </div>
      }
    >
      <RegisterInner />
    </Suspense>
  );
}

