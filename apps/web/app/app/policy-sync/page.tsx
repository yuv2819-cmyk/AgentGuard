'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiRequest } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { useTimezone } from '@/lib/timezone';

interface PolicySyncConfig {
  id: string;
  provider: string;
  repoUrl: string;
  branch: string;
  path: string;
  active: boolean;
  lastSyncedCommit: string | null;
  lastSyncedAt: string | null;
}

interface PolicySyncRun {
  id: string;
  commitSha: string | null;
  importedCount: number;
  summary: string | null;
  createdAt: string;
}

const samplePolicies = JSON.stringify(
  [
    {
      name: 'GitSynced Read Policy',
      description: 'Imported from repo',
      mode: 'BALANCED',
      rules: {
        allow_actions: ['read'],
        deny_actions: ['delete'],
        allow_tools: ['crm'],
        deny_tools: ['shell'],
      },
      changeSummary: 'Sync import',
    },
  ],
  null,
  2,
);

export default function PolicySyncPage() {
  const ready = useRequireAuth();
  const { push } = useToast();
  const { formatDate } = useTimezone();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<PolicySyncConfig | null>(null);
  const [runs, setRuns] = useState<PolicySyncRun[]>([]);
  const [configForm, setConfigForm] = useState({
    provider: 'github',
    repoUrl: '',
    branch: 'main',
    path: 'policies',
    active: true,
  });
  const [syncForm, setSyncForm] = useState({
    commitSha: '',
    summary: '',
    policiesJson: samplePolicies,
  });

  const load = async () => {
    try {
      const [configResponse, runsResponse] = await Promise.all([
        apiRequest<{ config: PolicySyncConfig | null }>('/policy-sync/config'),
        apiRequest<{ runs: PolicySyncRun[] }>('/policy-sync/runs'),
      ]);
      setConfig(configResponse.config);
      setRuns(runsResponse.runs);

      if (configResponse.config) {
        setConfigForm({
          provider: configResponse.config.provider,
          repoUrl: configResponse.config.repoUrl,
          branch: configResponse.config.branch,
          path: configResponse.config.path,
          active: configResponse.config.active,
        });
      }
    } catch (error) {
      push({ title: 'Failed to load policy sync', description: (error as Error).message, tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready) {
      void load();
    }
  }, [ready]);

  const saveConfig = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await apiRequest('/policy-sync/config', {
        method: 'PUT',
        body: JSON.stringify(configForm),
      });
      push({ title: 'Policy sync config saved', tone: 'success' });
      await load();
    } catch (error) {
      push({ title: 'Config save failed', description: (error as Error).message, tone: 'error' });
    }
  };

  const runSync = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const policies = JSON.parse(syncForm.policiesJson);
      await apiRequest('/policy-sync/sync', {
        method: 'POST',
        body: JSON.stringify({
          commitSha: syncForm.commitSha || undefined,
          summary: syncForm.summary || undefined,
          policies,
        }),
      });
      push({ title: 'Policy sync run completed', tone: 'success' });
      await load();
    } catch (error) {
      push({ title: 'Sync failed', description: (error as Error).message, tone: 'error' });
    }
  };

  if (!ready || loading) {
    return <Skeleton className="h-64" />;
  }

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Policy-as-Code Sync</h1>
        <p className="text-sm text-slate-600">
          Connect a git repo, sync policies, and keep change history in signed approval workflows.
        </p>
      </div>

      <section className="panel rounded-xl border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-900">Sync Configuration</h2>
        <form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={saveConfig}>
          <Input
            label="Provider"
            value={configForm.provider}
            onChange={(event) => setConfigForm((prev) => ({ ...prev, provider: event.target.value }))}
            required
          />
          <Input
            label="Repository URL"
            value={configForm.repoUrl}
            onChange={(event) => setConfigForm((prev) => ({ ...prev, repoUrl: event.target.value }))}
            required
          />
          <Input
            label="Branch"
            value={configForm.branch}
            onChange={(event) => setConfigForm((prev) => ({ ...prev, branch: event.target.value }))}
            required
          />
          <Input
            label="Policy Path"
            value={configForm.path}
            onChange={(event) => setConfigForm((prev) => ({ ...prev, path: event.target.value }))}
            required
          />
          <div className="md:col-span-2">
            <Button type="submit">{config ? 'Update Config' : 'Save Config'}</Button>
          </div>
        </form>
      </section>

      <section className="panel rounded-xl border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-900">Run Sync Import</h2>
        <form className="mt-3 space-y-3" onSubmit={runSync}>
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label="Commit SHA"
              value={syncForm.commitSha}
              onChange={(event) => setSyncForm((prev) => ({ ...prev, commitSha: event.target.value }))}
              placeholder="optional"
            />
            <Input
              label="Summary"
              value={syncForm.summary}
              onChange={(event) => setSyncForm((prev) => ({ ...prev, summary: event.target.value }))}
              placeholder="optional"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Policies JSON</label>
            <textarea
              className="w-full rounded-xl border border-slate-300 p-3 font-mono text-xs text-slate-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              rows={16}
              value={syncForm.policiesJson}
              onChange={(event) => setSyncForm((prev) => ({ ...prev, policiesJson: event.target.value }))}
            />
          </div>
          <Button type="submit">Run Sync</Button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Recent Sync Runs</h2>
        {runs.length === 0 ? (
          <EmptyState title="No sync runs yet" />
        ) : (
          <Table columns={['Timestamp', 'Commit', 'Imported Policies', 'Summary']}>
            {runs.map((run) => (
              <tr key={run.id}>
                <td className="px-4 py-3 text-slate-600">{formatDate(run.createdAt)}</td>
                <td className="px-4 py-3 text-slate-700">{run.commitSha ?? '-'}</td>
                <td className="px-4 py-3">
                  <Badge tone="success">{run.importedCount}</Badge>
                </td>
                <td className="px-4 py-3 text-slate-700">{run.summary ?? '-'}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </main>
  );
}
