'use client';

import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiRequest } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';

interface AgentKey {
  id: string;
  keyPrefix: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

interface Agent {
  id: string;
  name: string;
  description: string | null;
  environmentTag: string;
  status: 'ACTIVE' | 'DISABLED';
  activePolicyId: string | null;
  apiKeys: AgentKey[];
}

interface Policy {
  id: string;
  name: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
}

export default function AgentDetailsPage() {
  const ready = useRequireAuth();
  const params = useParams<{ id: string }>();
  const { push } = useToast();
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [form, setForm] = useState({ name: '', description: '', environmentTag: '', status: 'ACTIVE' });
  const [policyId, setPolicyId] = useState<string>('');
  const [newKey, setNewKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [agentResponse, policyResponse] = await Promise.all([
        apiRequest<{ agent: Agent }>(`/agents/${params.id}`),
        apiRequest<{ policies: Policy[] }>('/policies'),
      ]);

      setAgent(agentResponse.agent);
      setPolicies(policyResponse.policies);
      setPolicyId(agentResponse.agent.activePolicyId ?? '');
      setForm({
        name: agentResponse.agent.name,
        description: agentResponse.agent.description || '',
        environmentTag: agentResponse.agent.environmentTag,
        status: agentResponse.agent.status,
      });
    } catch (error) {
      push({ title: 'Failed to load agent', description: (error as Error).message, tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready && params.id) {
      void load();
    }
  }, [ready, params.id]);

  const onUpdate = async (event: FormEvent) => {
    event.preventDefault();
    if (!agent) {
      return;
    }

    try {
      const response = await apiRequest<{ agent: Agent }>(`/agents/${agent.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          environmentTag: form.environmentTag,
          status: form.status,
        }),
      });

      setAgent(response.agent);
      push({ title: 'Agent updated', tone: 'success' });
    } catch (error) {
      push({ title: 'Update failed', description: (error as Error).message, tone: 'error' });
    }
  };

  const onAssignPolicy = async () => {
    if (!agent) {
      return;
    }

    try {
      await apiRequest(`/agents/${agent.id}/assign-policy`, {
        method: 'POST',
        body: JSON.stringify({ policyId: policyId || null }),
      });
      push({ title: 'Policy assigned', tone: 'success' });
      await load();
    } catch (error) {
      push({ title: 'Assign failed', description: (error as Error).message, tone: 'error' });
    }
  };

  const onDisable = async () => {
    if (!agent) {
      return;
    }

    try {
      await apiRequest(`/agents/${agent.id}/disable`, {
        method: 'POST',
      });
      push({ title: 'Kill-switch activated', tone: 'success' });
      await load();
    } catch (error) {
      push({ title: 'Disable failed', description: (error as Error).message, tone: 'error' });
    }
  };

  const onRotate = async () => {
    if (!agent) {
      return;
    }

    try {
      const response = await apiRequest<{ apiKey: string }>(`/agents/${agent.id}/keys/rotate`, {
        method: 'POST',
      });
      setNewKey(response.apiKey);
      push({ title: 'Key rotated', tone: 'success' });
      await load();
    } catch (error) {
      push({ title: 'Rotation failed', description: (error as Error).message, tone: 'error' });
    }
  };

  if (!ready || loading || !agent) {
    return <Skeleton className="h-64" />;
  }

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">{agent.name}</h1>
        <Badge tone={agent.status === 'ACTIVE' ? 'success' : 'danger'}>{agent.status}</Badge>
      </div>

      <form onSubmit={onUpdate} className="panel space-y-3 rounded-xl border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-900">Agent Profile</h2>
        <Input
          label="Name"
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          required
        />
        <Input
          label="Description"
          value={form.description}
          onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
        />
        <Input
          label="Environment"
          value={form.environmentTag}
          onChange={(event) => setForm((prev) => ({ ...prev, environmentTag: event.target.value }))}
        />
        <Select
          label="Status"
          value={form.status}
          onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as 'ACTIVE' | 'DISABLED' }))}
        >
          <option value="ACTIVE">ACTIVE</option>
          <option value="DISABLED">DISABLED</option>
        </Select>
        <div className="flex flex-wrap gap-2">
          <Button type="submit">Save changes</Button>
          <Button type="button" variant="danger" onClick={onDisable}>
            Disable Agent
          </Button>
          <Button type="button" variant="secondary" onClick={onRotate}>
            Rotate API key
          </Button>
        </div>
      </form>

      <section className="panel rounded-xl border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-900">Assigned Policy</h2>
        <div className="mt-3 flex items-end gap-3">
          <Select label="Policy" value={policyId} onChange={(event) => setPolicyId(event.target.value)}>
            <option value="">No policy</option>
            {policies
              .filter((policy) => policy.status === 'APPROVED')
              .map((policy) => (
              <option key={policy.id} value={policy.id}>
                {policy.name}
              </option>
              ))}
          </Select>
          <Button type="button" onClick={onAssignPolicy}>
            Assign
          </Button>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">API Keys</h2>
        <Table columns={['Prefix', 'Status', 'Last Used', 'Created']}>
          {agent.apiKeys.map((key) => (
            <tr key={key.id}>
              <td className="px-4 py-3 font-mono text-sm">{key.keyPrefix}******</td>
              <td className="px-4 py-3">
                <Badge tone={key.revokedAt ? 'danger' : 'success'}>
                  {key.revokedAt ? 'REVOKED' : 'ACTIVE'}
                </Badge>
              </td>
              <td className="px-4 py-3 text-slate-600">
                {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}
              </td>
              <td className="px-4 py-3 text-slate-600">{new Date(key.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </Table>
      </section>

      <Modal open={Boolean(newKey)} title="Rotated API Key" onClose={() => setNewKey(null)}>
        <p className="mb-2 text-sm text-slate-600">This key is shown once. Copy it now.</p>
        <pre className="rounded bg-slate-100 p-3 text-xs">{newKey}</pre>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              if (newKey) {
                void navigator.clipboard.writeText(newKey);
                push({ title: 'Copied key', tone: 'success' });
              }
            }}
          >
            Copy
          </Button>
          <Button onClick={() => setNewKey(null)}>Done</Button>
        </div>
      </Modal>
    </main>
  );
}
