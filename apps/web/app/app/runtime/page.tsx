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

interface RuntimeConnection {
  id: string;
  provider: 'OPENAI' | 'ANTHROPIC' | 'LANGCHAIN' | 'CREWAI';
  name: string;
  active: boolean;
  hasApiKey: boolean;
  hasWebhookSecret: boolean;
  createdAt: string;
}

export default function RuntimePage() {
  const ready = useRequireAuth();
  const { push } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connections, setConnections] = useState<RuntimeConnection[]>([]);
  const [form, setForm] = useState({
    provider: 'OPENAI',
    name: '',
    apiKey: '',
    webhookSecret: '',
    active: true,
  });

  const load = async () => {
    try {
      const response = await apiRequest<{ connections: RuntimeConnection[] }>('/runtime/connections');
      setConnections(response.connections);
    } catch (error) {
      push({ title: 'Failed to load runtime connections', description: (error as Error).message, tone: 'error' });
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
      await apiRequest('/runtime/connections', {
        method: 'POST',
        body: JSON.stringify({
          provider: form.provider,
          name: form.name,
          apiKey: form.apiKey || undefined,
          webhookSecret: form.webhookSecret || undefined,
          active: form.active,
        }),
      });

      setForm({
        provider: 'OPENAI',
        name: '',
        apiKey: '',
        webhookSecret: '',
        active: true,
      });
      push({ title: 'Runtime connection created', tone: 'success' });
      await load();
    } catch (error) {
      push({ title: 'Create failed', description: (error as Error).message, tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const onToggle = async (connection: RuntimeConnection) => {
    try {
      await apiRequest(`/runtime/connections/${connection.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !connection.active }),
      });
      await load();
    } catch (error) {
      push({ title: 'Update failed', description: (error as Error).message, tone: 'error' });
    }
  };

  const onDelete = async (connectionId: string) => {
    try {
      await apiRequest(`/runtime/connections/${connectionId}`, {
        method: 'DELETE',
      });
      push({ title: 'Runtime connection removed', tone: 'success' });
      await load();
    } catch (error) {
      push({ title: 'Delete failed', description: (error as Error).message, tone: 'error' });
    }
  };

  if (!ready || loading) {
    return <Skeleton className="h-56" />;
  }

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Runtime Integrations</h1>
        <p className="text-sm text-slate-600">
          Register OpenAI, Anthropic, LangChain, and CrewAI runtime connections for in-path
          authorization.
        </p>
      </div>

      <section className="panel rounded-xl border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-900">New Runtime Connection</h2>
        <form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={onCreate}>
          <Select
            label="Provider"
            value={form.provider}
            onChange={(event) => setForm((prev) => ({ ...prev, provider: event.target.value }))}
          >
            <option value="OPENAI">OPENAI</option>
            <option value="ANTHROPIC">ANTHROPIC</option>
            <option value="LANGCHAIN">LANGCHAIN</option>
            <option value="CREWAI">CREWAI</option>
          </Select>
          <Input
            label="Connection Name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            required
          />
          <Input
            label="Provider API Key"
            value={form.apiKey}
            onChange={(event) => setForm((prev) => ({ ...prev, apiKey: event.target.value }))}
            placeholder="Optional: store hashed for validation"
          />
          <Input
            label="Webhook Secret"
            value={form.webhookSecret}
            onChange={(event) => setForm((prev) => ({ ...prev, webhookSecret: event.target.value }))}
            placeholder="Optional request signature secret"
          />
          <div className="md:col-span-2 flex gap-2">
            <Button type="submit" loading={saving}>
              Create Connection
            </Button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Registered Connections</h2>
        {connections.length === 0 ? (
          <EmptyState title="No runtime integrations configured yet" />
        ) : (
          <Table columns={['Provider', 'Name', 'Secrets', 'Status', 'Actions']}>
            {connections.map((connection) => (
              <tr key={connection.id}>
                <td className="px-4 py-3 text-slate-700">{connection.provider}</td>
                <td className="px-4 py-3 text-slate-700">{connection.name}</td>
                <td className="px-4 py-3 text-slate-700">
                  API Key: {connection.hasApiKey ? 'Yes' : 'No'} | Webhook Secret:{' '}
                  {connection.hasWebhookSecret ? 'Yes' : 'No'}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={connection.active ? 'success' : 'danger'}>
                    {connection.active ? 'ACTIVE' : 'DISABLED'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => onToggle(connection)}>
                      {connection.active ? 'Disable' : 'Enable'}
                    </Button>
                    <Button variant="danger" onClick={() => onDelete(connection.id)}>
                      Remove
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </main>
  );
}
