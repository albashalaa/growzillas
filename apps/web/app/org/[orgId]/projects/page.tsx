'use client';

import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '../../../../lib/api';
import { useAuth } from '../../../../contexts/AuthContext';

interface Project {
  id: string;
  name: string;
  description?: string | null;
}

export default function OrgProjectsPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const orgId = params.orgId as string;

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const loadProjects = async () => {
    if (!user) return;
    try {
      const data = await apiFetch('/projects', {
        headers: { 'x-org-id': orgId },
      });
      setProjects(data as Project[]);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, user]);

  const handleOpenCreateModal = () => {
    setCreateError('');
    setNewProjectName('');
    setNewProjectDescription('');
    setShowCreateModal(true);
  };

  const handleCloseCreateModal = () => {
    if (creating) return;
    setShowCreateModal(false);
  };

  const handleSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newProjectName.trim();
    if (!trimmedName) {
      setCreateError('Project name is required.');
      return;
    }

    setCreating(true);
    setCreateError('');
    try {
      await apiFetch('/projects', {
        method: 'POST',
        headers: {
          'x-org-id': orgId,
        },
        body: JSON.stringify({
          name: trimmedName,
          description: newProjectDescription.trim() || undefined,
        }),
      });
      setShowCreateModal(false);
      setNewProjectName('');
      setNewProjectDescription('');
      await loadProjects();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>
      <div
        style={{
          padding: '40px 24px',
          fontFamily: "'Montserrat', sans-serif",
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h1 style={{ fontSize: '24px', margin: 0, color: '#000' }}>Projects</h1>
          <button
            type="button"
            onClick={handleOpenCreateModal}
            style={{
              padding: '8px 12px',
              border: '1px solid #000',
              backgroundColor: '#fff',
              color: '#000',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Create New Project
          </button>
        </div>
        {error && (
          <div
            style={{
              marginBottom: '12px',
              padding: '10px',
              border: '1px solid red',
              color: 'red',
            }}
          >
            {error}
          </div>
        )}
        {loading ? (
          <p style={{ color: '#555' }}>Loading…</p>
        ) : projects.length === 0 ? (
          <p style={{ color: '#555' }}>No projects yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {projects.map((p) => (
              <li key={p.id} style={{ marginBottom: '8px' }}>
                <button
                  type="button"
                  onClick={() => router.push(`/org/${orgId}/projects/${p.id}`)}
                  style={{
                    display: 'block',
                    width: '100%',
                    maxWidth: '500px',
                    textAlign: 'left',
                    padding: '12px 16px',
                    border: '1px solid #000',
                    backgroundColor: '#fff',
                    color: '#111',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  <span style={{ fontWeight: 600, color: '#111' }}>{p.name}</span>
                  {p.description && (
                    <span style={{ display: 'block', fontSize: '12px', color: '#555', marginTop: '4px' }}>
                      {p.description}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={handleCloseCreateModal}
        >
          <div
            style={{
              backgroundColor: '#fff',
              border: '1px solid #000',
              padding: '20px',
              width: '100%',
              maxWidth: '400px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: '18px',
                margin: '0 0 12px',
                color: '#000',
              }}
            >
              Create New Project
            </h2>
            <form onSubmit={handleSubmitCreate}>
              <div style={{ marginBottom: '10px' }}>
                <label
                  htmlFor="project-name"
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    marginBottom: '4px',
                    color: '#000',
                  }}
                >
                  Project Name<span style={{ color: 'red' }}> *</span>
                </label>
                <input
                  id="project-name"
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    border: '1px solid #000',
                    fontSize: '13px',
                    color: '#000',
                  }}
                />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label
                  htmlFor="project-description"
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    marginBottom: '4px',
                    color: '#000',
                  }}
                >
                  Description (optional)
                </label>
                <textarea
                  id="project-description"
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    border: '1px solid #000',
                    fontSize: '13px',
                    color: '#000',
                    resize: 'vertical',
                  }}
                />
              </div>
              {createError && (
                <div
                  style={{
                    marginBottom: '8px',
                    padding: '6px 8px',
                    border: '1px solid red',
                    color: 'red',
                    fontSize: '12px',
                  }}
                >
                  {createError}
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                  marginTop: '4px',
                }}
              >
                <button
                  type="button"
                  onClick={handleCloseCreateModal}
                  disabled={creating}
                  style={{
                    padding: '6px 10px',
                    border: '1px solid #000',
                    backgroundColor: '#fff',
                    color: '#000',
                    cursor: creating ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  style={{
                    padding: '6px 10px',
                    border: '1px solid #000',
                    backgroundColor: creating ? '#f5f5f5' : '#000',
                    color: creating ? '#555' : '#fff',
                    cursor: creating ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                  }}
                >
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
