'use client';

import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../contexts/AuthContext';
import { apiFetch } from '../../../lib/api';

interface UserOrg {
  orgId: string;
  name: string;
  role: string;
}

export default function OrgSelectPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [orgs, setOrgs] = useState<UserOrg[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchOrgs = async () => {
      try {
        const data = await apiFetch('/orgs/my');
        setOrgs(data);

        if (data.length === 0) {
          router.push('/create-org');
        } else if (data.length === 1) {
          router.push(`/org/${data[0].orgId}/home`);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load organizations');
      } finally {
        setLoadingOrgs(false);
      }
    };

    if (user) {
      fetchOrgs();
    }
  }, [user, router]);

  if (loading || loadingOrgs) {
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
        <p style={{ color: '#000' }}>Loading organizations...</p>
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
            padding: '24px',
            border: '1px solid #000',
          }}
        >
          <h1
            style={{
              fontSize: '22px',
              marginBottom: '16px',
              color: '#000',
            }}
          >
            Select organization
          </h1>

          {error && (
            <div
              style={{
                padding: '10px',
                border: '1px solid #000',
                marginBottom: '16px',
                color: '#000',
              }}
            >
              {error}
            </div>
          )}

          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {orgs.map((org) => (
              <li
                key={org.orgId}
                style={{
                  border: '1px solid #000',
                  padding: '12px',
                  cursor: 'pointer',
                }}
                onClick={() => router.push(`/org/${org.orgId}/home`)}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    color: '#000',
                  }}
                >
                  <div>
                    <div style={{ marginBottom: '2px' }}>{org.name}</div>
                    <div style={{ fontSize: '11px', color: '#666' }}>
                      Role: {org.role}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

