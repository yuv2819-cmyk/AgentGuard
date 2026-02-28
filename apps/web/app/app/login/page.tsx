'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { apiRequest } from '@/lib/api';
import { setAuthToken, setWorkspaceId } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const { push } = useToast();
  const [email, setEmail] = useState('admin@agentguard.demo');
  const [password, setPassword] = useState('Admin123!ChangeMe');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await apiRequest<{
        token: string;
      }>('/auth/login', {
        method: 'POST',
        authenticated: false,
        body: JSON.stringify({ email, password }),
      });

      setAuthToken(response.token);

      const workspaceResponse = await apiRequest<{
        workspaces: Array<{ id: string }>;
      }>('/workspaces');

      if (workspaceResponse.workspaces[0]) {
        setWorkspaceId(workspaceResponse.workspaces[0].id);
      }

      push({ title: 'Logged in', tone: 'success' });
      router.replace('/app');
    } catch (error) {
      push({ title: 'Login failed', description: (error as Error).message, tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center px-4 py-8">
      <form className="panel w-full rounded-2xl border border-slate-200 p-6" onSubmit={onSubmit}>
        <h1 className="text-2xl font-semibold text-slate-900">Login</h1>
        <p className="mt-1 text-sm text-slate-500">Access your AgentGuard workspace.</p>

        <div className="mt-5 space-y-3">
          <Input label="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <Input
            type="password"
            label="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <Button className="mt-5 w-full" loading={loading} type="submit">
          Continue
        </Button>

        <p className="mt-4 text-sm text-slate-600">
          New account?{' '}
          <Link href="/app/signup" className="text-primary-700 hover:text-primary-800">
            Sign up
          </Link>
        </p>
      </form>
    </main>
  );
}
