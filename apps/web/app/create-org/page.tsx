'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../lib/api';

export default function CreateOrgPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    // Check if user already has an org
    if (user) {
      apiFetch('/orgs/my')
        .then((orgs) => {
          if (orgs.length > 0) {
            router.push(`/org/${orgs[0].orgId}/home`);
          }
        })
        .catch(() => {});
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const org = await apiFetch('/orgs', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      
      router.push(`/org/${org.id}/home`);
    } catch (err: any) {
      setError(err.message || 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        color: '#000'
      }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      backgroundColor: '#fff'
    }}>
      <div style={{ width: '100%', maxWidth: '400px', padding: '20px' }}>
        <h1 style={{ fontSize: '24px', marginBottom: '20px', color: '#000' }}>
          Create Organization
        </h1>
        
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#000' }}>
              Organization Name
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
                color: '#000'
              }}
            />
          </div>

          {error && (
            <div style={{ 
              color: '#000', 
              marginBottom: '15px',
              padding: '8px',
              border: '1px solid #000'
            }}>
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
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Creating...' : 'Create Organization'}
          </button>
        </form>
      </div>
    </div>
  );
}
