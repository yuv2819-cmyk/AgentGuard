'use client';

import { FormEvent, useEffect, useState } from 'react';
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

interface Playbook {
  id: string;
  name: string;
  actionType: 'DISABLE_AGENT' | 'REVOKE_ACTIVE_KEYS' | 'CREATE_APPROVAL' | 'NOTIFY_WEBHOOK';
  triggerDecision: 'ALLOW' | 'BLOCK' | null;
  minRiskScore: number;
  matchSignals: string[];
  enabled: boolean;
}

interface PlaybookExecution {
  id: string;
  status: 'EXECUTED' | 'SKIPPED' | 'FAILED';
  message: string | null;
  createdAt: string;
  playbook: {
    id: string;
    name: string;
    actionType: string;
  };
}

export default function PlaybooksPage() {
  const ready = useRequireAuth();
  const { push } = useToast();
  const { formatDate } = useTimezone();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [executions, setExecutions] = useState<PlaybookExecution[]>([]);
  const [form, setForm] = useState({
    name: '',
    actionType: 'DISABLE_AGENT',
    triggerDecision: 'BLOCK',
    minRiskScore: '80',
    matchSignals: 'high_risk_action',
  });

  const load = async () => {
    try {
      const [playbookResponse, executionResponse] = await Promise.all([
        apiRequest<{ playbooks: Playbook[] }>('/playbooks'),
        apiRequest<{ executions: PlaybookExecution[] }>('/playbooks/executions'),
      ]);
      setPlaybooks(playbookResponse.playbooks);
      setExecutions(executionResponse.executions);
    } catch (error) {
      push({ title: 'Failed to load playbooks', description: (error as Error).message, tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready) {
      void load();
    }
  }, [ready]);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);

    try {
      await apiRequest('/playbooks', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          actionType: form.actionType,
          triggerDecision: form.triggerDecision || null,
          minRiskScore: Number(form.minRiskScore || 0),
          matchSignals: form.matchSignals
            .split(',')
            .map((signal) => signal.trim())
            .filter(Boolean),
          actionConfig: {},
        }),
      });

      push({ title: 'Playbook created', tone: 'success' });
      setForm({
        name: '',
        actionType: 'DISABLE_AGENT',
        triggerDecision: 'BLOCK',
        minRiskScore: '80',
        matchSignals: 'high_risk_action',
      });
      await load();
    } catch (error) {
      push({ title: 'Create failed', description: (error as Error).message, tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const togglePlaybook = async (playbook: Playbook) => {
    try {
      await apiRequest(`/playbooks/${playbook.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: !playbook.enabled,
        }),
      });
      await load();
    } catch (error) {
      push({ title: 'Update failed', description: (error as Error).message, tone: 'error' });
    }
  };

  const deletePlaybook = async (playbook: Playbook) => {
    try {
      await apiRequest(`/playbooks/${playbook.id}`, {
        method: 'DELETE',
      });
      push({ title: 'Playbook removed', tone: 'success' });
      await load();
    } catch (error) {
      push({ title: 'Delete failed', description: (error as Error).message, tone: 'error' });
    }
  };

  if (!ready || loading) {
    return <Skeleton className="h-64" />;
  }

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Automated Response Playbooks</h1>
        <p className="text-sm text-slate-600">
          Trigger automatic controls (disable agent, revoke keys, require approvals) from risk and
          anomaly conditions.
        </p>
      </div>

      <section className="panel rounded-xl border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-900">Create Playbook</h2>
        <form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={onCreate}>
          <Input
            label="Name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            required
          />
          <Select
            label="Action Type"
            value={form.actionType}
            onChange={(event) => setForm((prev) => ({ ...prev, actionType: event.target.value }))}
          >
            <option value="DISABLE_AGENT">DISABLE_AGENT</option>
            <option value="REVOKE_ACTIVE_KEYS">REVOKE_ACTIVE_KEYS</option>
            <option value="CREATE_APPROVAL">CREATE_APPROVAL</option>
            <option value="NOTIFY_WEBHOOK">NOTIFY_WEBHOOK</option>
          </Select>
          <Select
            label="Trigger Decision"
            value={form.triggerDecision}
            onChange={(event) => setForm((prev) => ({ ...prev, triggerDecision: event.target.value }))}
          >
            <option value="">Any</option>
            <option value="ALLOW">ALLOW</option>
            <option value="BLOCK">BLOCK</option>
          </Select>
          <Input
            label="Minimum Risk Score"
            type="number"
            min={0}
            max={100}
            value={form.minRiskScore}
            onChange={(event) => setForm((prev) => ({ ...prev, minRiskScore: event.target.value }))}
          />
          <div className="md:col-span-2">
            <Input
              label="Match Signals (comma separated)"
              value={form.matchSignals}
              onChange={(event) => setForm((prev) => ({ ...prev, matchSignals: event.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <Button loading={saving} type="submit">
              Create Playbook
            </Button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Configured Playbooks</h2>
        {playbooks.length === 0 ? (
          <EmptyState title="No playbooks configured yet" />
        ) : (
          <Table columns={['Name', 'Action', 'Trigger', 'Status', 'Actions']}>
            {playbooks.map((playbook) => (
              <tr key={playbook.id}>
                <td className="px-4 py-3 text-slate-700">{playbook.name}</td>
                <td className="px-4 py-3 text-slate-700">{playbook.actionType}</td>
                <td className="px-4 py-3 text-slate-700">
                  {playbook.triggerDecision ?? 'ANY'} / Risk ≥ {playbook.minRiskScore}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={playbook.enabled ? 'success' : 'danger'}>
                    {playbook.enabled ? 'ENABLED' : 'DISABLED'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => togglePlaybook(playbook)}>
                      {playbook.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button variant="danger" onClick={() => deletePlaybook(playbook)}>
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Execution Timeline</h2>
        {executions.length === 0 ? (
          <EmptyState title="No playbook executions yet" />
        ) : (
          <Table columns={['Timestamp', 'Playbook', 'Status', 'Message']}>
            {executions.slice(0, 30).map((execution) => (
              <tr key={execution.id}>
                <td className="px-4 py-3 text-slate-600">{formatDate(execution.createdAt)}</td>
                <td className="px-4 py-3 text-slate-700">{execution.playbook.name}</td>
                <td className="px-4 py-3">
                  <Badge
                    tone={
                      execution.status === 'EXECUTED'
                        ? 'success'
                        : execution.status === 'FAILED'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {execution.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-slate-700">{execution.message ?? '-'}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </main>
  );
}
