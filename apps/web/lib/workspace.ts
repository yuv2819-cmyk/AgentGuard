'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from './api';
import { getWorkspaceId, setWorkspaceId } from './auth';

export interface WorkspaceItem {
  id: string;
  name: string;
  timezone: string;
  role: 'OWNER' | 'MEMBER';
  createdAt: string;
}

export const useWorkspace = (enabled = true) => {
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setWorkspaces([]);
      setSelectedWorkspaceId(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const load = async () => {
      try {
        const response = await apiRequest<{ workspaces: WorkspaceItem[] }>('/workspaces');
        setWorkspaces(response.workspaces);
        const existing = getWorkspaceId();
        const selected =
          existing && response.workspaces.some((item) => item.id === existing)
            ? existing
            : response.workspaces[0]?.id || null;

        if (selected) {
          setWorkspaceId(selected);
          setSelectedWorkspaceId(selected);
        }
      } catch {
        setWorkspaces([]);
        setSelectedWorkspaceId(null);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [enabled]);

  return {
    workspaces,
    selectedWorkspaceId,
    setSelectedWorkspaceId: (workspaceId: string) => {
      setWorkspaceId(workspaceId);
      setSelectedWorkspaceId(workspaceId);
    },
    loading,
  };
};
