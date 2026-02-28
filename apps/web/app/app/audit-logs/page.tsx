'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiRequest, downloadCsv } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { useTimezone } from '@/lib/timezone';

interface AuditEvent {
  id: string;
  agentId: string | null;
  tool: string;
  action: string;
  resource: string | null;
  decision: 'ALLOW' | 'BLOCK';
  reason: string;
  metadata: Record<string, unknown>;
  anomalyFlagged: boolean;
  prevHash: string;
  hash: string;
  createdAt: string;
}

interface Agent {
  id: string;
  name: string;
}

export default function AuditLogsPage() {
  const ready = useRequireAuth();
  const { push } = useToast();
  const { formatDate } = useTimezone();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [filters, setFilters] = useState({
    agentId: '',
    decision: '',
    tool: '',
    action: '',
    anomaly: '',
    from: '',
    to: '',
    q: '',
  });

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: '1', pageSize: '50' });
    if (filters.agentId) params.set('agentId', filters.agentId);
    if (filters.decision) params.set('decision', filters.decision);
    if (filters.tool) params.set('tool', filters.tool);
    if (filters.action) params.set('action', filters.action);
    if (filters.anomaly) params.set('anomaly_flagged', filters.anomaly);
    if (filters.from) params.set('from', new Date(filters.from).toISOString());
    if (filters.to) params.set('to', new Date(filters.to).toISOString());
    if (filters.q) params.set('q', filters.q);
    return params.toString();
  }, [filters]);

  const load = async () => {
    setLoading(true);
    try {
      const [logsResponse, agentsResponse] = await Promise.all([
        apiRequest<{ data: AuditEvent[] }>(`/audit-logs?${query}`),
        apiRequest<{ agents: Agent[] }>('/agents'),
      ]);

      setEvents(logsResponse.data);
      setAgents(agentsResponse.agents);
    } catch (error) {
      push({ title: 'Failed to load audit logs', description: (error as Error).message, tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready) {
      void load();
    }
  }, [ready, query]);

  const exportCsv = async () => {
    try {
      const blob = await downloadCsv(`/audit-logs/export.csv?${query}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      push({ title: 'CSV download started', tone: 'success' });
    } catch (error) {
      push({ title: 'Export failed', description: (error as Error).message, tone: 'error' });
    }
  };

  if (!ready || loading) {
    return <Skeleton className="h-60" />;
  }

  return (
    <main className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Audit Logs</h1>
          <p className="text-sm text-slate-600">Tamper-evident event ledger with filters and export.</p>
        </div>
        <Button variant="secondary" onClick={exportCsv}>
          Export CSV
        </Button>
      </div>

      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <Select
          label="Agent"
          value={filters.agentId}
          onChange={(event) => setFilters((prev) => ({ ...prev, agentId: event.target.value }))}
        >
          <option value="">All</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </Select>
        <Select
          label="Decision"
          value={filters.decision}
          onChange={(event) => setFilters((prev) => ({ ...prev, decision: event.target.value }))}
        >
          <option value="">All</option>
          <option value="ALLOW">ALLOW</option>
          <option value="BLOCK">BLOCK</option>
        </Select>
        <Input
          label="Tool"
          value={filters.tool}
          onChange={(event) => setFilters((prev) => ({ ...prev, tool: event.target.value }))}
        />
        <Input
          label="Action"
          value={filters.action}
          onChange={(event) => setFilters((prev) => ({ ...prev, action: event.target.value }))}
        />
        <Select
          label="Anomaly"
          value={filters.anomaly}
          onChange={(event) => setFilters((prev) => ({ ...prev, anomaly: event.target.value }))}
        >
          <option value="">Any</option>
          <option value="true">Flagged</option>
          <option value="false">Normal</option>
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
        <Input
          label="Search"
          value={filters.q}
          onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
        />
      </section>

      {events.length === 0 ? (
        <EmptyState title="No audit events match these filters" />
      ) : (
        <Table columns={['Decision', 'Tool', 'Action', 'Reason', 'Anomaly', 'Timestamp']}>
          {events.map((event) => (
            <tr key={event.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected(event)}>
              <td className="px-4 py-3">
                <Badge tone={event.decision === 'ALLOW' ? 'success' : 'danger'}>{event.decision}</Badge>
              </td>
              <td className="px-4 py-3 text-slate-700">{event.tool}</td>
              <td className="px-4 py-3 text-slate-700">{event.action}</td>
              <td className="px-4 py-3 text-slate-600">{event.reason}</td>
              <td className="px-4 py-3">
                {event.anomalyFlagged ? <Badge tone="warning">Flagged</Badge> : <Badge>Normal</Badge>}
              </td>
              <td className="px-4 py-3 text-slate-600">{formatDate(event.createdAt)}</td>
            </tr>
          ))}
        </Table>
      )}

      <Drawer open={Boolean(selected)} title="Audit Event Details" onClose={() => setSelected(null)}>
        {selected ? (
          <div className="space-y-3 text-sm">
            <p>
              <span className="font-medium text-slate-700">Event ID:</span> {selected.id}
            </p>
            <p>
              <span className="font-medium text-slate-700">Decision:</span> {selected.decision}
            </p>
            <p>
              <span className="font-medium text-slate-700">Tool/Action:</span> {selected.tool} / {selected.action}
            </p>
            <p>
              <span className="font-medium text-slate-700">Reason:</span> {selected.reason}
            </p>
            <p>
              <span className="font-medium text-slate-700">Resource:</span> {selected.resource || '-'}
            </p>
            <p>
              <span className="font-medium text-slate-700">Prev Hash:</span>
            </p>
            <pre className="break-all rounded bg-slate-100 p-2 text-xs">{selected.prevHash}</pre>
            <p>
              <span className="font-medium text-slate-700">Hash:</span>
            </p>
            <pre className="break-all rounded bg-slate-100 p-2 text-xs">{selected.hash}</pre>
            <p>
              <span className="font-medium text-slate-700">Metadata:</span>
            </p>
            <pre className="rounded bg-slate-100 p-3 text-xs">
              {JSON.stringify(selected.metadata || {}, null, 2)}
            </pre>
          </div>
        ) : null}
      </Drawer>
    </main>
  );
}
