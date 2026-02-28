'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { apiRequest } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';

interface Agent {
  id: string;
  name: string;
}

interface SimulationResponse {
  decision: 'ALLOW' | 'BLOCK';
  reason: string;
  signals: string[];
  riskScore: number;
  approvalRequestId?: string | null;
  eventId: string;
}

export default function SimulatePage() {
  const ready = useRequireAuth();
  const { push } = useToast();
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [form, setForm] = useState({
    agentId: '',
    tool: 'knowledge_base',
    action: 'read',
    resource: 'ticket:12345',
    metadata: '{"source":"ui-simulate"}',
    approvalRequestId: '',
  });
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!ready) {
      return;
    }

    const load = async () => {
      try {
        const response = await apiRequest<{ agents: Agent[] }>('/agents');
        setAgents(response.agents);
        setForm((prev) => ({ ...prev, agentId: response.agents[0]?.id ?? '' }));
      } catch (error) {
        push({ title: 'Failed to load agents', description: (error as Error).message, tone: 'error' });
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [ready]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const metadata = JSON.parse(form.metadata || '{}') as Record<string, unknown>;
      const response = await apiRequest<SimulationResponse>('/simulate', {
        method: 'POST',
        body: JSON.stringify({
          agentId: form.agentId,
          tool: form.tool,
          action: form.action,
          resource: form.resource,
          metadata,
          approvalRequestId: form.approvalRequestId || undefined,
        }),
      });

      setResult(response);
      if (response.approvalRequestId) {
        setForm((prev) => ({ ...prev, approvalRequestId: response.approvalRequestId || '' }));
      }
      push({ title: `Simulation ${response.decision}`, tone: response.decision === 'ALLOW' ? 'success' : 'error' });
    } catch (error) {
      push({ title: 'Simulation failed', description: (error as Error).message, tone: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!ready || loading) {
    return <Skeleton className="h-56" />;
  }

  return (
    <main className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Policy Simulation</h1>
        <p className="text-sm text-slate-600">Test decisions before live traffic, including approval gates.</p>
      </div>

      <form onSubmit={onSubmit} className="panel space-y-3 rounded-xl border border-slate-200 p-4">
        <Select
          label="Agent"
          value={form.agentId}
          onChange={(event) => setForm((prev) => ({ ...prev, agentId: event.target.value }))}
          required
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </Select>
        <Input
          label="Tool"
          value={form.tool}
          onChange={(event) => setForm((prev) => ({ ...prev, tool: event.target.value }))}
          required
        />
        <Input
          label="Action"
          value={form.action}
          onChange={(event) => setForm((prev) => ({ ...prev, action: event.target.value }))}
          required
        />
        <Input
          label="Resource"
          value={form.resource}
          onChange={(event) => setForm((prev) => ({ ...prev, resource: event.target.value }))}
        />
        <Input
          label="Approved Request ID (optional)"
          value={form.approvalRequestId}
          onChange={(event) => setForm((prev) => ({ ...prev, approvalRequestId: event.target.value }))}
          placeholder="Paste approved request id to execute high-risk action"
        />
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-slate-700">Metadata (JSON)</span>
          <textarea
            className="min-h-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
            value={form.metadata}
            onChange={(event) => setForm((prev) => ({ ...prev, metadata: event.target.value }))}
          />
        </label>
        <Button type="submit" loading={submitting}>
          Evaluate
        </Button>
      </form>

      {result ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <Badge tone={result.decision === 'ALLOW' ? 'success' : 'danger'}>{result.decision}</Badge>
            <p className="text-sm text-slate-700">{result.reason}</p>
          </div>
          {result.signals.length > 0 ? (
            <p className="mt-2 text-xs text-amber-700">Signals: {result.signals.join(', ')}</p>
          ) : null}
          <p className="mt-2 text-xs text-slate-600">Risk score: {result.riskScore}</p>
          {result.approvalRequestId ? (
            <p className="mt-1 text-xs text-rose-700">Approval Request ID: {result.approvalRequestId}</p>
          ) : null}
          <p className="mt-2 text-xs text-slate-500">Event ID: {result.eventId}</p>
        </section>
      ) : null}
    </main>
  );
}
