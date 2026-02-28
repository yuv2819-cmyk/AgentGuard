'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiRequest } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { useTimezone } from '@/lib/timezone';

interface IdentityProvider {
  id: string;
  name: string;
  issuer: string;
  audience: string;
  domain: string | null;
  jitEnabled: boolean;
  active: boolean;
  createdAt: string;
}

interface ScimToken {
  id: string;
  tokenPrefix: string;
  description: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function IdentityPage() {
  const ready = useRequireAuth();
  const { push } = useToast();
  const { formatDate } = useTimezone();
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<IdentityProvider[]>([]);
  const [tokens, setTokens] = useState<ScimToken[]>([]);
  const [providerForm, setProviderForm] = useState({
    name: '',
    issuer: '',
    audience: '',
    domain: '',
    sharedSecret: '',
    jitEnabled: true,
    active: true,
  });
  const [scimDescription, setScimDescription] = useState('');
  const [lastScimToken, setLastScimToken] = useState<string | null>(null);

  const load = async () => {
    try {
      const [providerResponse, tokenResponse] = await Promise.all([
        apiRequest<{ providers: IdentityProvider[] }>('/sso/providers'),
        apiRequest<{ tokens: ScimToken[] }>('/scim/tokens'),
      ]);
      setProviders(providerResponse.providers);
      setTokens(tokenResponse.tokens);
    } catch (error) {
      push({ title: 'Failed to load identity controls', description: (error as Error).message, tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready) {
      void load();
    }
  }, [ready]);

  const onCreateProvider = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await apiRequest('/sso/providers', {
        method: 'POST',
        body: JSON.stringify({
          ...providerForm,
          domain: providerForm.domain || undefined,
        }),
      });
      setProviderForm({
        name: '',
        issuer: '',
        audience: '',
        domain: '',
        sharedSecret: '',
        jitEnabled: true,
        active: true,
      });
      push({ title: 'SSO provider saved', tone: 'success' });
      await load();
    } catch (error) {
      push({ title: 'Provider save failed', description: (error as Error).message, tone: 'error' });
    }
  };

  const toggleProvider = async (provider: IdentityProvider) => {
    try {
      await apiRequest(`/sso/providers/${provider.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          active: !provider.active,
        }),
      });
      await load();
    } catch (error) {
      push({ title: 'Provider update failed', description: (error as Error).message, tone: 'error' });
    }
  };

  const createScimToken = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const response = await apiRequest<{ token: { rawToken: string } }>('/scim/tokens', {
        method: 'POST',
        body: JSON.stringify({
          description: scimDescription || undefined,
        }),
      });
      setScimDescription('');
      setLastScimToken(response.token.rawToken);
      push({ title: 'SCIM token issued', tone: 'success' });
      await load();
    } catch (error) {
      push({ title: 'SCIM token issue failed', description: (error as Error).message, tone: 'error' });
    }
  };

  const revokeScimToken = async (tokenId: string) => {
    try {
      await apiRequest(`/scim/tokens/${tokenId}`, {
        method: 'DELETE',
      });
      push({ title: 'SCIM token revoked', tone: 'success' });
      await load();
    } catch (error) {
      push({ title: 'Revoke failed', description: (error as Error).message, tone: 'error' });
    }
  };

  const copyLastToken = async () => {
    if (!lastScimToken) {
      return;
    }
    await navigator.clipboard.writeText(lastScimToken);
    push({ title: 'SCIM token copied', tone: 'success' });
  };

  if (!ready || loading) {
    return <Skeleton className="h-64" />;
  }

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Identity, SSO, and SCIM</h1>
        <p className="text-sm text-slate-600">
          Configure enterprise SSO providers and lifecycle provisioning tokens with JIT access.
        </p>
      </div>

      <section className="panel rounded-xl border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-900">Add SSO Provider</h2>
        <form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={onCreateProvider}>
          <Input
            label="Provider Name"
            value={providerForm.name}
            onChange={(event) => setProviderForm((prev) => ({ ...prev, name: event.target.value }))}
            required
          />
          <Input
            label="Issuer URL"
            value={providerForm.issuer}
            onChange={(event) => setProviderForm((prev) => ({ ...prev, issuer: event.target.value }))}
            required
          />
          <Input
            label="Audience"
            value={providerForm.audience}
            onChange={(event) => setProviderForm((prev) => ({ ...prev, audience: event.target.value }))}
            required
          />
          <Input
            label="Allowed Domain"
            value={providerForm.domain}
            onChange={(event) => setProviderForm((prev) => ({ ...prev, domain: event.target.value }))}
            placeholder="example.com"
          />
          <Input
            label="Shared Secret"
            value={providerForm.sharedSecret}
            onChange={(event) => setProviderForm((prev) => ({ ...prev, sharedSecret: event.target.value }))}
            required
          />
          <Select
            label="JIT Provisioning"
            value={providerForm.jitEnabled ? 'true' : 'false'}
            onChange={(event) =>
              setProviderForm((prev) => ({ ...prev, jitEnabled: event.target.value === 'true' }))
            }
          >
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </Select>
          <div className="md:col-span-2">
            <Button type="submit">Save SSO Provider</Button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">SSO Providers</h2>
        {providers.length === 0 ? (
          <EmptyState title="No SSO providers configured yet" />
        ) : (
          <Table columns={['Name', 'Issuer', 'Domain', 'JIT', 'Status', 'Actions']}>
            {providers.map((provider) => (
              <tr key={provider.id}>
                <td className="px-4 py-3 text-slate-700">{provider.name}</td>
                <td className="px-4 py-3 text-slate-700">{provider.issuer}</td>
                <td className="px-4 py-3 text-slate-700">{provider.domain ?? 'Any'}</td>
                <td className="px-4 py-3 text-slate-700">{provider.jitEnabled ? 'Enabled' : 'Disabled'}</td>
                <td className="px-4 py-3">
                  <Badge tone={provider.active ? 'success' : 'danger'}>
                    {provider.active ? 'ACTIVE' : 'DISABLED'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Button variant="secondary" onClick={() => void toggleProvider(provider)}>
                    {provider.active ? 'Disable' : 'Enable'}
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section className="panel rounded-xl border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-900">Issue SCIM Token</h2>
        <form className="mt-3 flex flex-col gap-3 md:flex-row" onSubmit={createScimToken}>
          <div className="flex-1">
            <Input
              label="Description"
              value={scimDescription}
              onChange={(event) => setScimDescription(event.target.value)}
              placeholder="Provisioning integration token"
            />
          </div>
          <div className="pt-1">
            <Button type="submit">Issue Token</Button>
          </div>
        </form>

        {lastScimToken ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            <p className="font-medium text-amber-900">SCIM token (shown once)</p>
            <p className="mt-2 break-all font-mono text-xs text-amber-800">{lastScimToken}</p>
            <Button className="mt-3" variant="secondary" onClick={() => void copyLastToken()}>
              Copy Token
            </Button>
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">SCIM Tokens</h2>
        {tokens.length === 0 ? (
          <EmptyState title="No SCIM tokens yet" />
        ) : (
          <Table columns={['Prefix', 'Description', 'Last Used', 'Created', 'Status', 'Actions']}>
            {tokens.map((token) => (
              <tr key={token.id}>
                <td className="px-4 py-3 font-mono text-xs text-slate-700">{token.tokenPrefix}******</td>
                <td className="px-4 py-3 text-slate-700">{token.description ?? '-'}</td>
                <td className="px-4 py-3 text-slate-600">
                  {token.lastUsedAt ? formatDate(token.lastUsedAt) : 'Never'}
                </td>
                <td className="px-4 py-3 text-slate-600">{formatDate(token.createdAt)}</td>
                <td className="px-4 py-3">
                  <Badge tone={token.revokedAt ? 'danger' : 'success'}>
                    {token.revokedAt ? 'REVOKED' : 'ACTIVE'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {!token.revokedAt ? (
                    <Button variant="danger" onClick={() => void revokeScimToken(token.id)}>
                      Revoke
                    </Button>
                  ) : (
                    <span className="text-xs text-slate-500">-</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </main>
  );
}
