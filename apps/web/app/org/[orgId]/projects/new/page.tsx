'use client';

import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '../../../../../contexts/AuthContext';
import { apiFetch } from '../../../../../lib/api';

export default function NewProjectPage() {
  const router = useRouter();
  const params = useParams();
  const { user, loading } = useAuth();
  const orgId = params.orgId as string;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Project name is required');
      return;
    }

    setSubmitting(true);

    try {
      const project = await apiFetch('/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description || undefined,
        }),
      });

      router.push(`/org/${orgId}/projects/${project.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
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
        <p style={{ color: '#000' }}>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

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
          backgroundColor: '#fff',
          fontFamily: "'Montserrat', sans-serif",
          padding: '40px 20px',
        }}
      >
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <button
            onClick={() => router.push(`/org/${orgId}/projects`)}
            style={{
              marginBottom: '20px',
              padding: '6px 12px',
              backgroundColor: '#fff',
              color: '#000',
              border: '1px solid #000',
              cursor: 'pointer',
            }}
          >
            ← Back to projects
          </button>

          <h1 style={{ fontSize: '24px', marginBottom: '20px', color: '#000' }}>
            New Project
          </h1>

          {error && (
            <div
              style={{
                padding: '10px',
                border: '1px solid #000',
                marginBottom: '15px',
                color: '#000',
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '15px' }}>
              <label
                style={{ display: 'block', marginBottom: '5px', color: '#000' }}
              >
                Project name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
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
                style={{ display: 'block', marginBottom: '5px', color: '#000' }}
              >
                Description (optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #000',
                  backgroundColor: '#fff',
                  color: '#000',
                  resize: 'vertical',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '10px 20px',
                backgroundColor: '#000',
                color: '#fff',
                border: 'none',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Creating...' : 'Create project'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

