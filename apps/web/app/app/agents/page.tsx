'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { Table } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiRequest } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';

interface Agent {
  id: string;
  name: string;
  description: string | null;
  environmentTag: string;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
}

export default function AgentsPage() {
  const ready = useRequireAuth();
  const { push } = useToast();
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', environmentTag: 'production' });
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await apiRequest<{ agents: Agent[] }>('/agents');
      setAgents(response.agents);
    } catch (error) {
      push({ title: 'Failed to load agents', description: (error as Error).message, tone: 'error' });
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
    setSubmitting(true);

    try {
      const response = await apiRequest<{ apiKey: string }>('/agents', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          environmentTag: form.environmentTag,
        }),
      });

      setNewKey(response.apiKey);
      setCreateOpen(false);
      setForm({ name: '', description: '', environmentTag: 'production' });
      push({ title: 'Agent created', tone: 'success' });
      await load();
    } catch (error) {
      push({ title: 'Create failed', description: (error as Error).message, tone: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!ready || loading) {
    return <Skeleton className="h-56" />;
  }

  return (
    <main className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Agents</h1>
          <p className="text-sm text-slate-600">Manage identities, status, and API keys.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>New Agent</Button>
      </div>

      {agents.length === 0 ? (
        <EmptyState title="No agents yet" hint="Create your first guarded agent." />
      ) : (
        <Table columns={['Name', 'Environment', 'Status', 'Created', '']}>
          {agents.map((agent) => (
            <tr key={agent.id}>
              <td className="px-4 py-3">
                <div>
                  <p className="font-medium text-slate-900">{agent.name}</p>
                  <p className="text-xs text-slate-500">{agent.description || 'No description'}</p>
                </div>
              </td>
              <td className="px-4 py-3 text-slate-700">{agent.environmentTag}</td>
              <td className="px-4 py-3">
                <Badge tone={agent.status === 'ACTIVE' ? 'success' : 'danger'}>{agent.status}</Badge>
              </td>
              <td className="px-4 py-3 text-slate-600">
                {new Date(agent.createdAt).toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-right">
                <Link href={`/app/agents/${agent.id}`} className="text-sm text-primary-700 hover:text-primary-800">
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={createOpen} title="Create Agent" onClose={() => setCreateOpen(false)}>
        <form className="space-y-3" onSubmit={onCreate}>
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
            label="Environment Tag"
            value={form.environmentTag}
            onChange={(event) => setForm((prev) => ({ ...prev, environmentTag: event.target.value }))}
            required
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Create
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(newKey)} title="New Agent Key" onClose={() => setNewKey(null)}>
        <p className="mb-2 text-sm text-slate-600">This key is shown once. Copy and store securely.</p>
        <pre className="rounded-lg bg-slate-100 p-3 text-xs text-slate-800">{newKey}</pre>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (newKey) {
                void navigator.clipboard.writeText(newKey);
                push({ title: 'Copied', tone: 'success' });
              }
            }}
          >
            Copy key
          </Button>
          <Button type="button" onClick={() => setNewKey(null)}>
            Done
          </Button>
        </div>
      </Modal>
    </main>
  );
}
