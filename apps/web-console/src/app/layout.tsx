import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

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
        <main>{children}</main>
      </body>
    </html>
  );
}
