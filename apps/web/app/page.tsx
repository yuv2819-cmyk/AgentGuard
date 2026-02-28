import Link from 'next/link';

const bullets = [
  'Centralized policy engine with simulation before production rollout',
  'Workspace-level multi-tenancy with role-based membership',
  'One-time agent key issuance, rotation, and revocation controls',
  'Tamper-evident audit ledger with hash-chain verification',
  'Real-time kill-switch to disable compromised agents instantly',
];

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-16">
      <section className="grid gap-10 md:grid-cols-[1.25fr_1fr] md:items-center">
        <div>
          <p className="mb-3 inline-flex rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-800">
            Built for security and platform teams
          </p>
          <h1 className="text-4xl font-bold leading-tight text-slate-900 md:text-5xl">
            Secure every AI agent action before it reaches production.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">
            AgentGuard gives you one place to control agent access, enforce policy decisions, and
            investigate every action with tamper-evident logs.
          </p>
          <div className="mt-8 flex gap-3">
            <Link
              href="/app/signup"
              className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
            >
              Start Demo
            </Link>
            <Link
              href="/security"
              className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Security Brief
            </Link>
          </div>
        </div>

        <div className="panel rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900">What you get on day one</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-600">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2">
                <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-14 rounded-2xl border border-slate-200 bg-white p-8 shadow-soft">
        <h2 className="text-xl font-semibold text-slate-900">Why investors care</h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          Enterprise teams are already shipping AI agents, but governance is still fragmented
          across scripts, ad-hoc rules, and spreadsheets. AgentGuard turns that gap into a single,
          recurring control layer for policy enforcement, incident response, and audit readiness.
        </p>
      </section>
    </main>
  );
}
