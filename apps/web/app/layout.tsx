import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { ToastProvider } from '@/components/ui/toast';
import { TimezoneProvider } from '@/lib/timezone';

export const metadata: Metadata = {
  title: 'AgentGuard | AgentSecOps Control Plane',
  description:
    'AgentGuard secures AI agents with policy simulation, kill-switch controls, and tamper-evident audit logs.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  openGraph: {
    title: 'AgentGuard',
    description: 'Control plane for governed AI agent operations',
    url: 'https://agentguard.demo',
    siteName: 'AgentGuard',
    images: [
      {
        url: '/og-default.svg',
        width: 1200,
        height: 630,
        alt: 'AgentGuard OG image placeholder',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AgentGuard',
    description: 'Policy-driven AI agent security operations',
    images: ['/og-default.svg'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TimezoneProvider>
          <ToastProvider>
            <div className="min-h-screen">
              <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
                  <Link href="/" className="text-lg font-bold text-slate-900">
                    AgentGuard
                  </Link>
                  <nav className="flex items-center gap-4 text-sm text-slate-600">
                    <Link href="/pricing" className="hover:text-slate-900">
                      Pricing
                    </Link>
                    <Link href="/security" className="hover:text-slate-900">
                      Security
                    </Link>
                    <Link href="/trust-center" className="hover:text-slate-900">
                      Trust Center
                    </Link>
                    <Link
                      href="/app/login"
                      className="rounded-lg bg-primary-600 px-3 py-1.5 font-medium text-white hover:bg-primary-700"
                    >
                      Launch App
                    </Link>
                  </nav>
                </div>
              </header>
              {children}
            </div>
          </ToastProvider>
        </TimezoneProvider>
      </body>
    </html>
  );
}
