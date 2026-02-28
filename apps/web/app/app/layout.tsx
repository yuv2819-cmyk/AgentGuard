'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { clearAuthSession, useRequireAuth } from '@/lib/auth';
import { useWorkspace } from '@/lib/workspace';

const navItems = [
  { href: '/app', label: 'Overview' },
  { href: '/app/agents', label: 'Agents' },
  { href: '/app/policies', label: 'Policies' },
  { href: '/app/policy-sync', label: 'Policy Sync' },
  { href: '/app/simulate', label: 'Simulate' },
  { href: '/app/runtime', label: 'Runtime' },
  { href: '/app/approvals', label: 'Approvals' },
  { href: '/app/playbooks', label: 'Playbooks' },
  { href: '/app/audit-logs', label: 'Audit Logs' },
  { href: '/app/forensics', label: 'Forensics' },
  { href: '/app/compliance', label: 'Compliance' },
  { href: '/app/identity', label: 'Identity' },
  { href: '/app/rbac', label: 'RBAC' },
  { href: '/app/settings', label: 'Settings' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublicRoute = pathname === '/app/login' || pathname === '/app/signup';
  const ready = useRequireAuth(!isPublicRoute);
  const { workspaces, selectedWorkspaceId, setSelectedWorkspaceId, loading } = useWorkspace(
    !isPublicRoute,
  );

  if (isPublicRoute) {
    return <>{children}</>;
  }

  if (!ready) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Skeleton className="h-12 w-full" />
      </main>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-8">
      <aside className="panel hidden w-64 shrink-0 rounded-2xl border border-slate-200 p-4 lg:block">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Control Plane</h2>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm ${
                pathname === item.href ? 'bg-primary-50 font-semibold text-primary-700' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-6 border-t border-slate-200 pt-4">
          <Select
            label="Workspace"
            value={selectedWorkspaceId ?? ''}
            onChange={(event) => setSelectedWorkspaceId(event.target.value)}
            disabled={loading || workspaces.length === 0}
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </Select>
        </div>

        <Button
          className="mt-4 w-full"
          variant="ghost"
          onClick={() => {
            clearAuthSession();
            router.replace('/app/login');
          }}
        >
          Logout
        </Button>
      </aside>

      <section className="min-w-0 flex-1">{children}</section>
    </div>
  );
}
