import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { DEMO } from '@/lib/demo';

import './globals.css';

export const metadata: Metadata = {
  title: 'Janus Console',
  description: 'Runs, event timeline and replay for Janus Arena.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            Janus Console
          </Link>
          <nav aria-label="Principal">
            <Link href="/">Runs</Link>
            <Link href="/replay">Replay sin backend</Link>
          </nav>
        </header>
        {DEMO && (
          <p className="demo-banner" role="note">
            Demo: recorded runs of Janus Arena, played in your browser. No backend, no keys, no
            model calls. The console&apos;s labels are in Spanish.
          </p>
        )}
        <main>{children}</main>
      </body>
    </html>
  );
}
