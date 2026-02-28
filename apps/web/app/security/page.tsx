import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Security | AgentGuard',
  description: 'Technical security controls used by AgentGuard in day-to-day operation.',
};

export default function SecurityPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <h1 className="text-4xl font-bold text-slate-900">Security-first by architecture</h1>
      <div className="mt-8 space-y-5 text-sm leading-7 text-slate-700">
        <p>
          Policy decisions are evaluated server-side with deny rules taking precedence over allow
          rules, plus workspace-level authorization checks on every API path.
        </p>
        <p>
          Audit events are chained with `prev_hash` and a canonical event hash, making edits
          detectable during replay and forensic verification.
        </p>
        <p>
          Agent credentials are shown once, stored as salted hashes, rotatable on demand, and can
          be disabled immediately through the kill switch workflow.
        </p>
      </div>
    </main>
  );
}
