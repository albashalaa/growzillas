'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';

interface OrgSidebarProps {
  orgId: string;
}

export function OrgSidebar({ orgId }: OrgSidebarProps) {
  const { org } = useOrg();
  const { logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const orgName = org?.name ?? 'Growzillas';

  const isActive = (href: string) => pathname?.startsWith(href);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <aside
      style={{
        width: '220px',
        borderRight: '1px solid #000',
        padding: '24px 16px',
      }}
    >
      <div style={{ marginBottom: '24px' }}>
        <div
          style={{
            fontSize: '16px',
            fontWeight: 600,
            marginBottom: '4px',
            color: '#000',
          }}
        >
          {orgName}
        </div>
        <div style={{ fontSize: '11px', color: '#666' }}>{orgId}</div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {[
          { label: 'Home', path: `/org/${orgId}/home` },
          { label: 'My Tasks', path: `/org/${orgId}/my-tasks` },
          { label: 'Projects', path: `/org/${orgId}/projects` },
          { label: 'Members', path: `/org/${orgId}/members` },
        ].map((item) => {
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              href={item.path}
              style={{
                padding: '8px 10px',
                border: '1px solid #000',
                backgroundColor: active ? '#000' : '#fff',
                color: active ? '#fff' : '#000',
                textDecoration: 'none',
                fontSize: '13px',
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ marginTop: '40px' }}>
        <button
          onClick={handleLogout}
          style={{
            padding: '8px 12px',
            backgroundColor: '#000',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Logout
        </button>
      </div>
    </aside>
  );
}

