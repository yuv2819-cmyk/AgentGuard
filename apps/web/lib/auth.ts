'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const TOKEN_KEY = 'agentguard_token';
const WORKSPACE_KEY = 'agentguard_workspace_id';
const TIMEZONE_KEY = 'agentguard_timezone';

export const storageKeys = {
  token: TOKEN_KEY,
  workspace: WORKSPACE_KEY,
  timezone: TIMEZONE_KEY,
};

export const getAuthToken = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem(TOKEN_KEY);
};

export const setAuthToken = (token: string): void => {
  localStorage.setItem(TOKEN_KEY, token);
};

export const clearAuthSession = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(WORKSPACE_KEY);
};

export const getWorkspaceId = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem(WORKSPACE_KEY);
};

export const setWorkspaceId = (workspaceId: string): void => {
  localStorage.setItem(WORKSPACE_KEY, workspaceId);
};

export const getTimezone = (): string => {
  if (typeof window === 'undefined') {
    return 'Asia/Kolkata';
  }
  return localStorage.getItem(TIMEZONE_KEY) || 'Asia/Kolkata';
};

export const setTimezone = (timezone: string): void => {
  localStorage.setItem(TIMEZONE_KEY, timezone);
};

export const useRequireAuth = (enabled = true) => {
  const router = useRouter();
  const [ready, setReady] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setReady(true);
      return;
    }

    const token = getAuthToken();
    if (!token) {
      setReady(false);
      router.replace('/app/login');
      return;
    }

    setReady(true);
  }, [enabled, router]);

  return ready;
};
