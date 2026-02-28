'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiRequest } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';

interface Policy {
  id: string;
  name: string;
  description: string | null;
  mode: 'STRICT' | 'BALANCED';
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  version: number;
  createdAt: string;
}

const splitCsv = (value: string): string[] =>
  value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

export default function PoliciesPage() {
  const ready = useRequireAuth();
  const { push } = useToast();
  const [loading, setLoading] = useState(true);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    mode: 'BALANCED',
    allowActions: 'read,list,search',
    denyActions: 'delete,drop',
    allowTools: 'knowledge_base,crm',
    denyTools: 'prod_db_shell',
    requireApprovalActions: 'transfer_funds,delete',
  });

  const load = async () => {
    setLoading(true);
    try {
      const response = await apiRequest<{ policies: Policy[] }>('/policies');
      setPolicies(response.policies);
    } catch (error) {
      push({ title: 'Failed to load policies', description: (error as Error).message, tone: 'error' });
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

    try {
      await apiRequest('/policies', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          mode: form.mode,
          rules: {
            mode: form.mode,
            allow_actions: splitCsv(form.allowActions),
            deny_actions: splitCsv(form.denyActions),
            allow_tools: splitCsv(form.allowTools),
            deny_tools: splitCsv(form.denyTools),
            require_approval_actions: splitCsv(form.requireApprovalActions),
          },
        }),
      });

      push({ title: 'Policy draft created', tone: 'success' });
      setOpen(false);
      setForm({
        name: '',
        description: '',
        mode: 'BALANCED',
        allowActions: 'read,list,search',
        denyActions: 'delete,drop',
        allowTools: 'knowledge_base,crm',
        denyTools: 'prod_db_shell',
        requireApprovalActions: 'transfer_funds,delete',
      });
      await load();
    } catch (error) {
      push({ title: 'Create failed', description: (error as Error).message, tone: 'error' });
    }
  };

  if (!ready || loading) {
    return <Skeleton className="h-60" />;
  }

  return (
    <main className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Policies</h1>
          <p className="text-sm text-slate-600">Versioned policy-as-code with approval workflow.</p>
        </div>
        <Button onClick={() => setOpen(true)}>New Policy Draft</Button>
      </div>

      {policies.length === 0 ? (
        <EmptyState title="No policies yet" hint="Define policy rules and assign to agents." />
      ) : (
        <Table columns={['Name', 'Mode', 'Status', 'Version', 'Created', '']}>
          {policies.map((policy) => (
            <tr key={policy.id}>
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">{policy.name}</div>
                <div className="text-xs text-slate-500">{policy.description || 'No description'}</div>
              </td>
              <td className="px-4 py-3">
                <Badge tone={policy.mode === 'STRICT' ? 'warning' : 'neutral'}>{policy.mode}</Badge>
              </td>
              <td className="px-4 py-3">
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
              </td>
              <td className="px-4 py-3 text-slate-700">v{policy.version}</td>
              <td className="px-4 py-3 text-slate-600">{new Date(policy.createdAt).toLocaleDateString()}</td>
              <td className="px-4 py-3 text-right">
                <Link href={`/app/policies/${policy.id}`} className="text-sm text-primary-700 hover:text-primary-800">
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={open} title="Create Policy Draft" onClose={() => setOpen(false)}>
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
          <Select
            label="Mode"
            value={form.mode}
            onChange={(event) => setForm((prev) => ({ ...prev, mode: event.target.value as 'STRICT' | 'BALANCED' }))}
          >
            <option value="BALANCED">BALANCED</option>
            <option value="STRICT">STRICT</option>
          </Select>
          <Input
            label="Allow Actions (comma separated)"
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
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create</Button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
