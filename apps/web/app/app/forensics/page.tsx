'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiRequest } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { useTimezone } from '@/lib/timezone';

interface Agent {
  id: string;
  name: string;
}

interface ForensicsSummary {
  totalEvents: number;
  integrityFailures: number;
  chainStatus: 'HEALTHY' | 'BROKEN';
  from: string | null;
  to: string | null;
}

interface TimelineEvent {
  id: string;
  agentId: string | null;
  tool: string;
  action: string;
  decision: 'ALLOW' | 'BLOCK';
  reason: string;
  chainIntegrity: 'OK' | 'BROKEN';
  createdAt: string;
}

export default function ForensicsPage() {
  const ready = useRequireAuth();
  const { push } = useToast();
  const { formatDate } = useTimezone();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ForensicsSummary | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filters, setFilters] = useState({
    agentId: '',
    from: '',
    to: '',
  });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.agentId) params.set('agentId', filters.agentId);
    if (filters.from) params.set('from', new Date(filters.from).toISOString());
    if (filters.to) params.set('to', new Date(filters.to).toISOString());
    params.set('limit', '500');
    return params.toString();
  }, [filters]);

  const load = async () => {
    setLoading(true);
    try {
      const [forensicsResponse, agentsResponse] = await Promise.all([
        apiRequest<{ summary: ForensicsSummary; timeline: TimelineEvent[] }>(`/forensics/replay?${query}`),
        apiRequest<{ agents: Agent[] }>('/agents'),
      ]);
      setSummary(forensicsResponse.summary);
      setTimeline(forensicsResponse.timeline);
      setAgents(agentsResponse.agents);
    } catch (error) {
      push({ title: 'Failed to load forensic replay', description: (error as Error).message, tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready) {
      void load();
    }
  }, [ready, query]);

  if (!ready || loading) {
    return <Skeleton className="h-64" />;
  }

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Forensics Replay</h1>
          <p className="text-sm text-slate-600">
            Reconstruct decision timelines and verify audit hash-chain continuity.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh Replay
        </Button>
      </div>

      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-3">
        <Select
          label="Agent"
          value={filters.agentId}
          onChange={(event) => setFilters((prev) => ({ ...prev, agentId: event.target.value }))}
        >
          <option value="">All Agents</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </Select>
        <Input
          type="datetime-local"
          label="From"
          value={filters.from}
          onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))}
        />
        <Input
          type="datetime-local"
          label="To"
          value={filters.to}
          onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))}
        />
      </section>

      {summary ? (
        <section className="grid gap-4 sm:grid-cols-4">
          <article className="panel rounded-xl border border-slate-200 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Chain Status</p>
            <p className="mt-2">
              <Badge tone={summary.chainStatus === 'HEALTHY' ? 'success' : 'danger'}>
                {summary.chainStatus}
              </Badge>
            </p>
          </article>
          <article className="panel rounded-xl border border-slate-200 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total Events</p>
            <p className="mt-2 text-xl font-semibold text-slate-900">{summary.totalEvents}</p>
          </article>
          <article className="panel rounded-xl border border-slate-200 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Integrity Failures</p>
            <p className="mt-2 text-xl font-semibold text-slate-900">{summary.integrityFailures}</p>
          </article>
          <article className="panel rounded-xl border border-slate-200 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Window</p>
            <p className="mt-2 text-sm text-slate-700">
              {summary.from ? formatDate(summary.from) : '-'} to{' '}
              {summary.to ? formatDate(summary.to) : '-'}
            </p>
          </article>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Timeline</h2>
        {timeline.length === 0 ? (
          <EmptyState title="No forensic events found for this filter" />
        ) : (
          <Table columns={['Timestamp', 'Decision', 'Tool', 'Action', 'Reason', 'Chain']}>
            {timeline.map((event) => (
              <tr key={event.id}>
                <td className="px-4 py-3 text-slate-600">{formatDate(event.createdAt)}</td>
                <td className="px-4 py-3">
                  <Badge tone={event.decision === 'ALLOW' ? 'success' : 'danger'}>{event.decision}</Badge>
                </td>
                <td className="px-4 py-3 text-slate-700">{event.tool}</td>
                <td className="px-4 py-3 text-slate-700">{event.action}</td>
                <td className="px-4 py-3 text-slate-700">{event.reason}</td>
                <td className="px-4 py-3">
                  <Badge tone={event.chainIntegrity === 'OK' ? 'success' : 'danger'}>
                    {event.chainIntegrity}
                  </Badge>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </main>
  );
}
