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
import { apiBase, apiRequest } from '@/lib/api';
import { getAuthToken, getWorkspaceId, useRequireAuth } from '@/lib/auth';
import { useTimezone } from '@/lib/timezone';

interface EvidencePack {
  id: string;
  framework: 'SOC2' | 'ISO27001' | 'HIPAA' | 'GDPR';
  fromAt: string;
  toAt: string;
  sha256: string;
  createdAt: string;
}

interface TrustAttestation {
  id: string;
  title: string;
  description: string;
  status: string;
  issuedBy: string;
  issuedAt: string;
  isPublic: boolean;
  artifactUrl: string | null;
}

export default function CompliancePage() {
  const ready = useRequireAuth();
  const { push } = useToast();
  const { formatDate } = useTimezone();
  const [loading, setLoading] = useState(true);
  const [packs, setPacks] = useState<EvidencePack[]>([]);
  const [attestations, setAttestations] = useState<TrustAttestation[]>([]);
  const [packForm, setPackForm] = useState({
    framework: 'SOC2',
    from: '',
    to: '',
  });
  const [attestationForm, setAttestationForm] = useState({
    title: '',
    description: '',
    issuedBy: '',
    artifactUrl: '',
  });

  const load = async () => {
    try {
      const [packsResponse, attestationsResponse] = await Promise.all([
        apiRequest<{ packs: EvidencePack[] }>('/compliance/evidence-packs'),
        apiRequest<{ attestations: TrustAttestation[] }>('/trust-attestations'),
      ]);
      setPacks(packsResponse.packs);
      setAttestations(attestationsResponse.attestations);
    } catch (error) {
      push({ title: 'Failed to load compliance data', description: (error as Error).message, tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready) {
      void load();
    }
  }, [ready]);

  const createPack = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await apiRequest('/compliance/evidence-packs', {
        method: 'POST',
        body: JSON.stringify({
          framework: packForm.framework,
          from: new Date(packForm.from).toISOString(),
          to: new Date(packForm.to).toISOString(),
        }),
      });
      push({ title: 'Evidence pack generated', tone: 'success' });
      await load();
    } catch (error) {
      push({ title: 'Pack generation failed', description: (error as Error).message, tone: 'error' });
    }
  };

  const downloadPack = async (packId: string) => {
    try {
      const token = getAuthToken();
      const workspaceId = getWorkspaceId();
      const response = await fetch(`${apiBase}/compliance/evidence-packs/${packId}/download.json`, {
        method: 'GET',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
        },
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `evidence-pack-${packId}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      push({ title: 'Download failed', description: (error as Error).message, tone: 'error' });
    }
  };

  const createAttestation = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await apiRequest('/trust-attestations', {
        method: 'POST',
        body: JSON.stringify({
          title: attestationForm.title,
          description: attestationForm.description,
          issuedBy: attestationForm.issuedBy,
          artifactUrl: attestationForm.artifactUrl || undefined,
          isPublic: true,
        }),
      });
      setAttestationForm({
        title: '',
        description: '',
        issuedBy: '',
        artifactUrl: '',
      });
      push({ title: 'Attestation published', tone: 'success' });
      await load();
    } catch (error) {
      push({ title: 'Attestation create failed', description: (error as Error).message, tone: 'error' });
    }
  };

  if (!ready || loading) {
    return <Skeleton className="h-64" />;
  }

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Compliance Evidence</h1>
        <p className="text-sm text-slate-600">
          Generate immutable evidence packs and maintain trust attestations for audits and procurement.
        </p>
      </div>

      <section className="panel rounded-xl border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-900">Generate Evidence Pack</h2>
        <form className="mt-3 grid gap-3 md:grid-cols-3" onSubmit={createPack}>
          <Select
            label="Framework"
            value={packForm.framework}
            onChange={(event) => setPackForm((prev) => ({ ...prev, framework: event.target.value }))}
          >
            <option value="SOC2">SOC2</option>
            <option value="ISO27001">ISO27001</option>
            <option value="HIPAA">HIPAA</option>
            <option value="GDPR">GDPR</option>
          </Select>
          <Input
            type="datetime-local"
            label="From"
            value={packForm.from}
            onChange={(event) => setPackForm((prev) => ({ ...prev, from: event.target.value }))}
            required
          />
          <Input
            type="datetime-local"
            label="To"
            value={packForm.to}
            onChange={(event) => setPackForm((prev) => ({ ...prev, to: event.target.value }))}
            required
          />
          <div className="md:col-span-3">
            <Button type="submit">Generate Pack</Button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Evidence Packs</h2>
        {packs.length === 0 ? (
          <EmptyState title="No evidence packs generated yet" />
        ) : (
          <Table columns={['Framework', 'Window', 'SHA256', 'Created', 'Actions']}>
            {packs.map((pack) => (
              <tr key={pack.id}>
                <td className="px-4 py-3">
                  <Badge tone="success">{pack.framework}</Badge>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {formatDate(pack.fromAt)} to {formatDate(pack.toAt)}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">{pack.sha256.slice(0, 20)}...</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(pack.createdAt)}</td>
                <td className="px-4 py-3">
                  <Button variant="secondary" onClick={() => void downloadPack(pack.id)}>
                    Download JSON
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section className="panel rounded-xl border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-900">Publish Trust Attestation</h2>
        <form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={createAttestation}>
          <Input
            label="Title"
            value={attestationForm.title}
            onChange={(event) => setAttestationForm((prev) => ({ ...prev, title: event.target.value }))}
            required
          />
          <Input
            label="Issued By"
            value={attestationForm.issuedBy}
            onChange={(event) => setAttestationForm((prev) => ({ ...prev, issuedBy: event.target.value }))}
            required
          />
          <div className="md:col-span-2">
            <Input
              label="Description"
              value={attestationForm.description}
              onChange={(event) =>
                setAttestationForm((prev) => ({ ...prev, description: event.target.value }))
              }
              required
            />
          </div>
          <div className="md:col-span-2">
            <Input
              label="Artifact URL"
              value={attestationForm.artifactUrl}
              onChange={(event) =>
                setAttestationForm((prev) => ({ ...prev, artifactUrl: event.target.value }))
              }
              placeholder="https://..."
            />
          </div>
          <div className="md:col-span-2">
            <Button type="submit">Publish Attestation</Button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Attestations</h2>
        {attestations.length === 0 ? (
          <EmptyState title="No attestations yet" />
        ) : (
          <Table columns={['Title', 'Status', 'Issued By', 'Issued At', 'Public']}>
            {attestations.map((attestation) => (
              <tr key={attestation.id}>
                <td className="px-4 py-3 text-slate-700">{attestation.title}</td>
                <td className="px-4 py-3">
                  <Badge tone={attestation.status === 'ACTIVE' ? 'success' : 'warning'}>
                    {attestation.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-slate-700">{attestation.issuedBy}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(attestation.issuedAt)}</td>
                <td className="px-4 py-3 text-slate-700">{attestation.isPublic ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </main>
  );
}
