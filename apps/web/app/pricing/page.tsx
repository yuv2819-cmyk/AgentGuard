import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing | AgentGuard',
  description: 'Transparent pricing for teams governing AI agent activity in production.',
};

const plans = [
  {
    name: 'Starter',
    price: '$99/mo',
    detail: 'Up to 10 agents, 200k audited actions/month',
  },
  {
    name: 'Growth',
    price: '$399/mo',
    detail: 'Up to 75 agents, SSO, extended retention',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    detail: 'Unlimited agents, private networking, dedicated support',
  },
];

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="text-4xl font-bold text-slate-900">Pricing for real operations, not pilots</h1>
      <p className="mt-3 text-slate-600">
        Every plan includes policy simulation, audit exports, and key rotation.
      </p>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {plans.map((plan) => (
          <article key={plan.name} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
            <h2 className="text-lg font-semibold">{plan.name}</h2>
            <p className="mt-3 text-2xl font-bold text-primary-700">{plan.price}</p>
            <p className="mt-3 text-sm text-slate-600">{plan.detail}</p>
          </article>
        ))}
      </div>
    </main>
  );
}
