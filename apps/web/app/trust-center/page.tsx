'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/v1';

interface TrustAttestation {
  id: string;
  title: string;
  description: string;
  status: string;
  issuedBy: string;
  issuedAt: string;
  artifactUrl: string | null;
}

interface TrustPayload {
  updatedAt: string;
  attestations: TrustAttestation[];
  decisionSummary: Array<{ decision: 'ALLOW' | 'BLOCK'; count: number }>;
}

export default function TrustCenterPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TrustPayload | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`${API_BASE}/public/trust-center`, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('Unable to load trust center');
        }
        const payload = (await response.json()) as TrustPayload;
        setData(payload);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-12">
        <Skeleton className="h-24" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-12">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-soft">
        <h1 className="text-3xl font-bold text-slate-900">Trust Center</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          This page shows live governance evidence: recent decision counts, published attestations,
          and linked artifacts that security reviewers can verify directly.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Last updated: {data?.updatedAt ? new Date(data.updatedAt).toLocaleString() : '-'}
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {(data?.decisionSummary ?? []).map((item) => (
          <article key={item.decision} className="panel rounded-xl border border-slate-200 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">{item.decision} Decisions</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{item.count}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold text-slate-900">Attestations</h2>
        <div className="mt-4 space-y-3">
          {(data?.attestations ?? []).map((attestation) => (
            <article key={attestation.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">{attestation.title}</h3>
                <Badge tone={attestation.status === 'ACTIVE' ? 'success' : 'warning'}>
                  {attestation.status}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-slate-600">{attestation.description}</p>
              <p className="mt-2 text-xs text-slate-500">
                Issued by {attestation.issuedBy} on {new Date(attestation.issuedAt).toLocaleDateString()}
              </p>
              {attestation.artifactUrl ? (
                <a
                  href={attestation.artifactUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-sm font-medium text-primary-700 hover:text-primary-800"
                >
                  View artifact
                </a>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
