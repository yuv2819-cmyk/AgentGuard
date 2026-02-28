'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Table } from '@/components/ui/table';
import { apiRequest } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { useTimezone } from '@/lib/timezone';

interface Agent {
  id: string;
  name: string;
  status: 'ACTIVE' | 'DISABLED';
  environmentTag: string;
}

interface AuditEvent {
  id: string;
  decision: 'ALLOW' | 'BLOCK';
  tool: string;
  action: string;
  createdAt: string;
}

export default function AppOverviewPage() {
  const ready = useRequireAuth();
  const { formatDate } = useTimezone();
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [policiesCount, setPoliciesCount] = useState(0);
  const [recentEvents, setRecentEvents] = useState<AuditEvent[]>([]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    const load = async () => {
      try {
        const [agentsResponse, policiesResponse, logsResponse] = await Promise.all([
          apiRequest<{ agents: Agent[] }>('/agents'),
          apiRequest<{ policies: Array<{ id: string }> }>('/policies'),
          apiRequest<{ data: AuditEvent[] }>('/audit-logs?page=1&pageSize=5'),
        ]);

        setAgents(agentsResponse.agents);
        setPoliciesCount(policiesResponse.policies.length);
        setRecentEvents(logsResponse.data);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [ready]);

  if (!ready || loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-56" />
      </div>
    );
  }

  const activeCount = agents.filter((agent) => agent.status === 'ACTIVE').length;

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Overview</h1>
        <p className="text-sm text-slate-600">Policy posture and latest execution events.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <article className="panel rounded-xl border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total Agents</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{agents.length}</p>
          <p className="mt-1 text-sm text-slate-600">{activeCount} active</p>
        </article>
        <article className="panel rounded-xl border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Policies</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{policiesCount}</p>
          <p className="mt-1 text-sm text-slate-600">Assigned via allow/deny rules</p>
        </article>
        <article className="panel rounded-xl border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Recent Decisions</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{recentEvents.length}</p>
          <p className="mt-1 text-sm text-slate-600">Last 5 events logged</p>
        </article>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Recent audit events</h2>
          <Link href="/app/audit-logs" className="text-sm text-primary-700 hover:text-primary-800">
            View all
          </Link>
        </div>

        {recentEvents.length === 0 ? (
          <EmptyState title="No audit events yet" hint="Run simulation from the Simulate tab." />
        ) : (
          <Table columns={['Decision', 'Tool', 'Action', 'Timestamp']}>
            {recentEvents.map((event) => (
              <tr key={event.id}>
                <td className="px-4 py-3">
                  <Badge tone={event.decision === 'ALLOW' ? 'success' : 'danger'}>{event.decision}</Badge>
                </td>
                <td className="px-4 py-3 text-slate-700">{event.tool}</td>
                <td className="px-4 py-3 text-slate-700">{event.action}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(event.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </main>
  );
}
