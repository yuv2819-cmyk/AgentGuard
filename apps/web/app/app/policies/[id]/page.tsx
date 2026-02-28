'use client';

import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiRequest } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';

interface PolicyVersion {
  id: string;
  version: number;
  mode: 'STRICT' | 'BALANCED';
  changeSummary: string | null;
  createdAt: string;
}

interface Policy {
  id: string;
  name: string;
  description: string | null;
  mode: 'STRICT' | 'BALANCED';
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  version: number;
  rejectionReason: string | null;
  rules: {
    allow_actions: string[];
    deny_actions: string[];
    allow_tools: string[];
    deny_tools: string[];
    require_approval_actions: string[];
  };
}

const toCsv = (values: string[] = []) => values.join(',');
const fromCsv = (value: string) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

export default function PolicyDetailsPage() {
  const ready = useRequireAuth();
  const params = useParams<{ id: string }>();
  const { push } = useToast();
  const [loading, setLoading] = useState(true);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [versions, setVersions] = useState<PolicyVersion[]>([]);
  const [form, setForm] = useState({
    name: '',
    description: '',
    mode: 'BALANCED' as 'BALANCED' | 'STRICT',
    allowActions: '',
    denyActions: '',
    allowTools: '',
    denyTools: '',
    requireApprovalActions: '',
    changeSummary: 'Updated controls',
  });

  const load = async () => {
    setLoading(true);
    try {
      const [policyResponse, versionResponse] = await Promise.all([
        apiRequest<{ policy: Policy }>(`/policies/${params.id}`),
        apiRequest<{ versions: PolicyVersion[] }>(`/policies/${params.id}/versions`),
      ]);

      setPolicy(policyResponse.policy);
      setVersions(versionResponse.versions);
      setForm({
        name: policyResponse.policy.name,
        description: policyResponse.policy.description || '',
        mode: policyResponse.policy.mode,
        allowActions: toCsv(policyResponse.policy.rules.allow_actions),
        denyActions: toCsv(policyResponse.policy.rules.deny_actions),
        allowTools: toCsv(policyResponse.policy.rules.allow_tools),
        denyTools: toCsv(policyResponse.policy.rules.deny_tools),
        requireApprovalActions: toCsv(policyResponse.policy.rules.require_approval_actions),
        changeSummary: 'Updated controls',
      });
    } catch (error) {
      push({ title: 'Load failed', description: (error as Error).message, tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready) {
      void load();
    }
  }, [ready]);

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!policy) {
      return;
    }

    try {
      const response = await apiRequest<{ policy: Policy }>(`/policies/${policy.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          mode: form.mode,
          changeSummary: form.changeSummary,
          rules: {
            mode: form.mode,
            allow_actions: fromCsv(form.allowActions),
            deny_actions: fromCsv(form.denyActions),
            allow_tools: fromCsv(form.allowTools),
            deny_tools: fromCsv(form.denyTools),
            require_approval_actions: fromCsv(form.requireApprovalActions),
          },
        }),
      });

      setPolicy(response.policy);
      push({ title: 'Policy saved as new draft version', tone: 'success' });
      await load();
    } catch (error) {
      push({ title: 'Save failed', description: (error as Error).message, tone: 'error' });
    }
  };

  const runWorkflow = async (action: 'submit-approval' | 'approve' | 'reject') => {
    if (!policy) {
      return;
    }

    try {
      await apiRequest(`/policies/${policy.id}/${action}`, {
        method: 'POST',
        body:
          action === 'reject'
            ? JSON.stringify({ reason: 'Rejected from dashboard approval workflow' })
            : JSON.stringify({}),
      });

      push({ title: `Policy ${action.replace('-', ' ')}`, tone: 'success' });
      await load();
    } catch (error) {
      push({ title: 'Workflow action failed', description: (error as Error).message, tone: 'error' });
    }
  };

  if (!ready || loading || !policy) {
    return <Skeleton className="h-56" />;
  }

  return (
    <main className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{policy.name}</h1>
          <p className="text-sm text-slate-600">Version v{policy.version}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={policy.mode === 'STRICT' ? 'warning' : 'neutral'}>{policy.mode}</Badge>
          <Badge
            tone={
              policy.status === 'APPROVED'
                ? 'success'
                : policy.status === 'PENDING_APPROVAL'
                  ? 'warning'
                  : policy.status === 'REJECTED'
                    ? 'danger'
                    : 'neutral'
            }
          >
            {policy.status}
          </Badge>
        </div>
      </div>

      {policy.rejectionReason ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          Rejection reason: {policy.rejectionReason}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {policy.status === 'DRAFT' || policy.status === 'REJECTED' ? (
          <Button variant="secondary" onClick={() => void runWorkflow('submit-approval')}>
            Submit for Approval
          </Button>
        ) : null}
        {policy.status === 'PENDING_APPROVAL' ? (
          <>
            <Button onClick={() => void runWorkflow('approve')}>Approve Policy</Button>
            <Button variant="danger" onClick={() => void runWorkflow('reject')}>
              Reject Policy
            </Button>
          </>
        ) : null}
      </div>

      <form className="panel space-y-3 rounded-xl border border-slate-200 p-4" onSubmit={onSave}>
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
        <Select
          label="Mode"
          value={form.mode}
          onChange={(event) => setForm((prev) => ({ ...prev, mode: event.target.value as 'STRICT' | 'BALANCED' }))}
        >
          <option value="BALANCED">BALANCED</option>
          <option value="STRICT">STRICT</option>
        </Select>
        <Input
          label="Allow Actions"
          value={form.allowActions}
          onChange={(event) => setForm((prev) => ({ ...prev, allowActions: event.target.value }))}
        />
        <Input
          label="Deny Actions"
          value={form.denyActions}
          onChange={(event) => setForm((prev) => ({ ...prev, denyActions: event.target.value }))}
        />
        <Input
          label="Allow Tools"
          value={form.allowTools}
          onChange={(event) => setForm((prev) => ({ ...prev, allowTools: event.target.value }))}
        />
        <Input
          label="Deny Tools"
          value={form.denyTools}
          onChange={(event) => setForm((prev) => ({ ...prev, denyTools: event.target.value }))}
        />
        <Input
          label="Require Human Approval Actions"
          value={form.requireApprovalActions}
          onChange={(event) => setForm((prev) => ({ ...prev, requireApprovalActions: event.target.value }))}
        />
        <Input
          label="Change Summary"
          value={form.changeSummary}
          onChange={(event) => setForm((prev) => ({ ...prev, changeSummary: event.target.value }))}
        />

        <Button type="submit">Save New Version Draft</Button>
      </form>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Version History</h2>
        <Table columns={['Version', 'Mode', 'Summary', 'Created']}>
          {versions.map((version) => (
            <tr key={version.id}>
              <td className="px-4 py-3 text-slate-700">v{version.version}</td>
              <td className="px-4 py-3 text-slate-700">{version.mode}</td>
              <td className="px-4 py-3 text-slate-600">{version.changeSummary || '-'}</td>
              <td className="px-4 py-3 text-slate-600">{new Date(version.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </Table>
      </section>
    </main>
  );
}
