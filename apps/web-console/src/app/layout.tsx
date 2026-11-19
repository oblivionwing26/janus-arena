import type { Metadata, Viewport } from 'next';
import { Cinzel, Instrument_Sans, JetBrains_Mono } from 'next/font/google';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { JanusMark } from '@/components/ui/janus-mark';
import { DEMO } from '@/lib/demo';

import './tokens.css';
import './globals.css';

// Served from this site at build time (next/font): no request to a font host at run time.
const display = Cinzel({ subsets: ['latin'], variable: '--font-cinzel', display: 'swap' });
const ui = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument-sans',
  display: 'swap',
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Janus Console',
  description: 'Runs, event timeline and replay for Janus Arena.',
};

export const viewport: Viewport = { themeColor: '#0f0d0b', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${display.variable} ${ui.variable} ${mono.variable}`}>
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            <JanusMark size={30} />
            JANUS
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
