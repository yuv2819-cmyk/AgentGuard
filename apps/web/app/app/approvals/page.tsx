'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiRequest } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { useTimezone } from '@/lib/timezone';

interface Approval {
  id: string;
  agentId: string;
  tool: string;
  action: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  riskScore: number;
  requestedAt: string;
  expiresAt: string;
  resolutionNote: string | null;
}

export default function ApprovalsPage() {
  const ready = useRequireAuth();
  const { push } = useToast();
  const { formatDate } = useTimezone();
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [approvals, setApprovals] = useState<Approval[]>([]);

  const load = async () => {
    setLoading(true);

    try {
      const response = await apiRequest<{ data: Approval[] }>(
        `/approvals?status=${encodeURIComponent(statusFilter)}&page=1&pageSize=50`,
      );

      setApprovals(response.data);
    } catch (error) {
      push({ title: 'Failed to load approvals', description: (error as Error).message, tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready) {
      void load();
    }
  }, [ready, statusFilter]);

  const resolve = async (approvalId: string, action: 'approve' | 'reject') => {
    try {
      await apiRequest(`/approvals/${approvalId}/${action}`, {
        method: 'POST',
        body: JSON.stringify({
          note: action === 'approve' ? 'Approved from control plane' : 'Rejected from control plane',
        }),
      });

      push({ title: action === 'approve' ? 'Approved request' : 'Rejected request', tone: 'success' });
      await load();
    } catch (error) {
      push({ title: 'Action failed', description: (error as Error).message, tone: 'error' });
    }
  };

  if (!ready || loading) {
    return <Skeleton className="h-56" />;
  }

  return (
    <main className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Human Approval Queue</h1>
          <p className="text-sm text-slate-600">Review and resolve high-risk action requests.</p>
        </div>
        <div className="w-48">
          <Select label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="PENDING">PENDING</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
            <option value="EXPIRED">EXPIRED</option>
          </Select>
        </div>
      </div>

      {approvals.length === 0 ? (
        <EmptyState title="No approval requests" hint="High-risk actions will appear here." />
      ) : (
        <Table columns={['Status', 'Tool/Action', 'Risk', 'Requested', 'Expires', '']}>
          {approvals.map((approval) => (
            <tr key={approval.id}>
              <td className="px-4 py-3">
                <Badge
                  tone={
                    approval.status === 'APPROVED'
                      ? 'success'
                      : approval.status === 'PENDING'
                        ? 'warning'
                        : 'danger'
                  }
                >
                  {approval.status}
                </Badge>
              </td>
              <td className="px-4 py-3 text-slate-700">
                {approval.tool} / {approval.action}
              </td>
              <td className="px-4 py-3 text-slate-700">{approval.riskScore}</td>
              <td className="px-4 py-3 text-slate-600">{formatDate(approval.requestedAt)}</td>
              <td className="px-4 py-3 text-slate-600">{formatDate(approval.expiresAt)}</td>
              <td className="px-4 py-3 text-right">
                {approval.status === 'PENDING' ? (
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => resolve(approval.id, 'approve')}>
                      Approve
                    </Button>
                    <Button variant="danger" onClick={() => resolve(approval.id, 'reject')}>
                      Reject
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-slate-500">Resolved</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </main>
  );
}
