'use client';

import { getAuthToken, getWorkspaceId } from './auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/v1';

interface ApiRequestOptions extends RequestInit {
  workspaceId?: string;
  authenticated?: boolean;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  if (options.authenticated !== false) {
    const token = getAuthToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const workspaceId = options.workspaceId ?? getWorkspaceId();
  if (workspaceId) {
    headers.set('X-Workspace-Id', workspaceId);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    cache: 'no-store',
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? 'API request failed');
  }

  return data as T;
}

export async function downloadCsv(path: string): Promise<Blob> {
  const headers = new Headers();
  const token = getAuthToken();
  const workspaceId = getWorkspaceId();

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (workspaceId) {
    headers.set('X-Workspace-Id', workspaceId);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || 'CSV export failed');
  }

  return response.blob();
}

export const apiBase = API_BASE;
