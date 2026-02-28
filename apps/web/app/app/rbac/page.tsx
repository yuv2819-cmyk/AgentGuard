'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiRequest } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';

type OverrideEffect = 'ALLOW' | 'DENY' | null;

interface MatrixPermission {
  permission: string;
  effective: boolean;
  overrideEffect: OverrideEffect;
}

interface MatrixRole {
  role: 'OWNER' | 'MEMBER';
  permissions: MatrixPermission[];
}

interface OverridesResponse {
  matrix: MatrixRole[];
}

export default function RbacPage() {
  const ready = useRequireAuth();
  const { push } = useToast();
  const [loading, setLoading] = useState(true);
  const [matrix, setMatrix] = useState<MatrixRole[]>([]);

  const load = async () => {
    try {
      const response = await apiRequest<OverridesResponse>('/rbac/permissions');
      setMatrix(response.matrix);
    } catch (error) {
      push({ title: 'Failed to load RBAC matrix', description: (error as Error).message, tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready) {
      void load();
    }
  }, [ready]);

  const permissionRows = useMemo(() => {
    const owner = matrix.find((role) => role.role === 'OWNER');
    const member = matrix.find((role) => role.role === 'MEMBER');
    if (!owner || !member) {
      return [];
    }

    return owner.permissions.map((ownerPermission) => {
      const memberPermission =
        member.permissions.find((item) => item.permission === ownerPermission.permission) ?? null;
      return {
        permission: ownerPermission.permission,
        owner: ownerPermission,
        member: memberPermission,
      };
    });
  }, [matrix]);

  const updateOverride = async (
    role: 'OWNER' | 'MEMBER',
    permission: string,
    value: OverrideEffect,
  ) => {
    try {
      await apiRequest('/rbac/permissions', {
        method: 'PUT',
        body: JSON.stringify({
          overrides: [
            {
              role,
              permission,
              effect: value,
            },
          ],
        }),
      });
      await load();
      push({ title: 'RBAC override updated', tone: 'success' });
    } catch (error) {
      push({ title: 'Update failed', description: (error as Error).message, tone: 'error' });
    }
  };

  if (!ready || loading) {
    return <Skeleton className="h-64" />;
  }

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Custom RBAC</h1>
        <p className="text-sm text-slate-600">
          Fine-grained role overrides at resource/action level. Use DEFAULT to keep built-in role behavior.
        </p>
      </div>

      <Table columns={['Permission', 'OWNER Effective', 'OWNER Override', 'MEMBER Effective', 'MEMBER Override']}>
        {permissionRows.map((row) => (
          <tr key={row.permission}>
            <td className="px-4 py-3 font-mono text-xs text-slate-700">{row.permission}</td>
            <td className="px-4 py-3">
              <Badge tone={row.owner.effective ? 'success' : 'danger'}>
                {row.owner.effective ? 'ALLOW' : 'DENY'}
              </Badge>
            </td>
            <td className="px-4 py-3">
              <Select
                value={row.owner.overrideEffect ?? 'DEFAULT'}
                onChange={(event) =>
                  void updateOverride(
                    'OWNER',
                    row.permission,
                    event.target.value === 'DEFAULT'
                      ? null
                      : (event.target.value as 'ALLOW' | 'DENY'),
                  )
                }
              >
                <option value="DEFAULT">DEFAULT</option>
                <option value="ALLOW">ALLOW</option>
                <option value="DENY">DENY</option>
              </Select>
            </td>
            <td className="px-4 py-3">
              <Badge tone={row.member?.effective ? 'success' : 'danger'}>
                {row.member?.effective ? 'ALLOW' : 'DENY'}
              </Badge>
            </td>
            <td className="px-4 py-3">
              <Select
                value={row.member?.overrideEffect ?? 'DEFAULT'}
                onChange={(event) =>
                  void updateOverride(
                    'MEMBER',
                    row.permission,
                    event.target.value === 'DEFAULT'
                      ? null
                      : (event.target.value as 'ALLOW' | 'DENY'),
                  )
                }
              >
                <option value="DEFAULT">DEFAULT</option>
                <option value="ALLOW">ALLOW</option>
                <option value="DENY">DENY</option>
              </Select>
            </td>
          </tr>
        ))}
      </Table>
    </main>
  );
}
