'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { apiRequest } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { useTimezone } from '@/lib/timezone';
import { useWorkspace } from '@/lib/workspace';

interface Integration {
  id: string;
  type: 'GENERIC_WEBHOOK';
  webhookUrl: string;
  active: boolean;
}

interface DeploymentProfile {
  region: string;
  privateDeploymentMode: boolean;
  topology: string;
  recommendations: string[];
}

export default function SettingsPage() {
  const ready = useRequireAuth();
  const { push } = useToast();
  const { timezone, setTz } = useTimezone();
  const { workspaces, selectedWorkspaceId, setSelectedWorkspaceId, loading } = useWorkspace();
  const [form, setForm] = useState({ name: '', timezone: 'Asia/Kolkata' });
  const [submitting, setSubmitting] = useState(false);
  const [integrationForm, setIntegrationForm] = useState({ webhookUrl: '', signingSecret: '' });
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [integrationSaving, setIntegrationSaving] = useState(false);
  const [deploymentProfile, setDeploymentProfile] = useState<DeploymentProfile | null>(null);

  const onCreateWorkspace = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const response = await apiRequest<{ workspace: { id: string } }>('/workspaces', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          timezone: form.timezone,
        }),
      });

      setSelectedWorkspaceId(response.workspace.id);
      setForm({ name: '', timezone: 'Asia/Kolkata' });
      push({ title: 'Workspace created', tone: 'success' });
      window.location.reload();
    } catch (error) {
      push({ title: 'Create failed', description: (error as Error).message, tone: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const loadIntegration = async () => {
    try {
      const response = await apiRequest<{ integrations: Integration[] }>('/integrations');
      const webhook = response.integrations.find((item) => item.type === 'GENERIC_WEBHOOK') ?? null;
      setIntegration(webhook);
      setIntegrationForm({
        webhookUrl: webhook?.webhookUrl ?? '',
        signingSecret: '',
      });
    } catch {
      setIntegration(null);
    }
  };

  useEffect(() => {
    if (ready && selectedWorkspaceId) {
      void loadIntegration();
      void apiRequest<DeploymentProfile>('/deployment/profile')
        .then((profile) => setDeploymentProfile(profile))
        .catch(() => setDeploymentProfile(null));
    }
  }, [ready, selectedWorkspaceId]);

  const onSaveIntegration = async (event: FormEvent) => {
    event.preventDefault();
    setIntegrationSaving(true);

    try {
      const response = await apiRequest<{ integration: Integration }>('/integrations/webhook', {
        method: 'POST',
        body: JSON.stringify({
          webhookUrl: integrationForm.webhookUrl,
          signingSecret: integrationForm.signingSecret || undefined,
          active: true,
        }),
      });

      setIntegration(response.integration);
      push({ title: 'Webhook integration saved', tone: 'success' });
    } catch (error) {
      push({ title: 'Integration save failed', description: (error as Error).message, tone: 'error' });
    } finally {
      setIntegrationSaving(false);
    }
  };

  const onDeleteIntegration = async () => {
    if (!integration) {
      return;
    }

    try {
      await apiRequest(`/integrations/${integration.id}`, {
        method: 'DELETE',
      });

      setIntegration(null);
      setIntegrationForm({ webhookUrl: '', signingSecret: '' });
      push({ title: 'Integration removed', tone: 'success' });
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
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-600">Workspace, integrations, and display preferences.</p>
      </div>

      <section className="panel rounded-xl border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-900">Workspace</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Select
            label="Active Workspace"
            value={selectedWorkspaceId ?? ''}
            onChange={(event) => setSelectedWorkspaceId(event.target.value)}
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name} ({workspace.role})
              </option>
            ))}
          </Select>
        </div>
      </section>

      <section className="panel rounded-xl border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-900">Create Workspace</h2>
        <form onSubmit={onCreateWorkspace} className="mt-3 grid gap-3 md:grid-cols-2">
          <Input
            label="Workspace Name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            required
          />
          <Select
            label="Timezone"
            value={form.timezone}
            onChange={(event) => setForm((prev) => ({ ...prev, timezone: event.target.value }))}
          >
            <option value="Asia/Kolkata">Asia/Kolkata</option>
            <option value="UTC">UTC</option>
            <option value="America/New_York">America/New_York</option>
          </Select>
          <div className="md:col-span-2">
            <Button type="submit" loading={submitting}>
              Create Workspace
            </Button>
          </div>
        </form>
      </section>

      <section className="panel rounded-xl border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-900">SIEM / Webhook Integration</h2>
        <p className="mt-1 text-sm text-slate-600">
          Stream audit events to your SIEM via signed webhook callbacks.
        </p>
        <form onSubmit={onSaveIntegration} className="mt-3 grid gap-3 md:grid-cols-2">
          <Input
            label="Webhook URL"
            value={integrationForm.webhookUrl}
            onChange={(event) => setIntegrationForm((prev) => ({ ...prev, webhookUrl: event.target.value }))}
            placeholder="https://siem.example.com/hooks/agentguard"
            required
          />
          <Input
            label="Signing Secret"
            value={integrationForm.signingSecret}
            onChange={(event) => setIntegrationForm((prev) => ({ ...prev, signingSecret: event.target.value }))}
            placeholder="optional-shared-secret"
          />
          <div className="md:col-span-2 flex gap-2">
            <Button type="submit" loading={integrationSaving}>
              {integration ? 'Update Integration' : 'Save Integration'}
            </Button>
            {integration ? (
              <Button type="button" variant="danger" onClick={onDeleteIntegration}>
                Remove
              </Button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="panel rounded-xl border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-900">Date & Time Display</h2>
        <div className="mt-3 max-w-sm">
          <Select label="Preferred Timezone" value={timezone} onChange={(event) => setTz(event.target.value)}>
            <option value="Asia/Kolkata">Asia/Kolkata</option>
            <option value="UTC">UTC</option>
          </Select>
        </div>
      </section>

      <section className="panel rounded-xl border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-900">Deployment Profile</h2>
        {deploymentProfile ? (
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <p>
              <span className="font-medium">Region:</span> {deploymentProfile.region}
            </p>
            <p>
              <span className="font-medium">Topology:</span> {deploymentProfile.topology}
            </p>
            <p>
              <span className="font-medium">Private Deployment:</span>{' '}
              {deploymentProfile.privateDeploymentMode ? 'Enabled' : 'Disabled'}
            </p>
            <ul className="list-disc space-y-1 pl-5 text-slate-600">
              {deploymentProfile.recommendations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Deployment profile unavailable.</p>
        )}
      </section>
    </main>
  );
}
