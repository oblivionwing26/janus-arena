import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import type { ReactNode } from 'react';

import { SiteHeader } from '@/components/site-header';
import { THEME_SCRIPT } from '@/components/ui/theme-toggle';
import { DEMO } from '@/lib/demo';

import './tokens.css';
import './base.css';
import './globals.css';
import './landing.css';

// Served from this site at build time (next/font): no request to a font host at run time.
const sans = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });
const display = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Janus Arena', template: '%s · Janus Arena' },
  description:
    'A pre-release gate: synthetic users and sandboxed attacks on the same pull request, and what each security fix costs the people it protects.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#06080c' },
    { media: '(prefers-color-scheme: light)', color: '#f5f6f8' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${sans.variable} ${mono.variable} ${display.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SiteHeader demo={DEMO} />
        {DEMO && (
          <div className="demo-strip" role="note">
            <p>
              <strong>Live demo.</strong> Recorded runs of Janus Arena, replayed in your browser: no
              backend, no keys, no model calls.
            </p>
          </div>
        )}
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
