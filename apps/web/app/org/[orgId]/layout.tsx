import { OrgSidebar } from '../../../components/org/OrgSidebar';

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: '#fff',
      }}
    >
      <OrgSidebar />
      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
    </div>
  );
}
