/* Legacy route: redirect to org-scoped My Tasks */
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';

export default function LegacyMyTasksRedirect() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (user?.orgId) {
        router.replace(`/org/${user.orgId}/my-tasks`);
      } else {
        router.replace('/login');
      }
    }
  }, [loading, user, router]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff',
        color: '#000',
      }}
    >
      Redirecting to My Tasks...
    </div>
  );
}

