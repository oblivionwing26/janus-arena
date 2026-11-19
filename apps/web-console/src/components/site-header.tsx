'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { JanusMark } from './ui/janus-mark';
import { ThemeToggle } from './ui/theme-toggle';

const REPO = 'https://github.com/oblivionwing26/janus-arena';

/** The sticky glass header: the mark, the main places and the theme switch. */
export function SiteHeader({ demo }: { readonly demo: boolean }) {
  const path = usePathname();
  const current = (href: string) =>
    (href === '/' ? path === '/' : path.startsWith(href)) ? ('page' as const) : undefined;
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand" aria-label="Janus Arena, home">
          <JanusMark />
          <span>Janus Arena</span>
          {demo && <small>demo</small>}
        </Link>
        <nav className="site-nav" aria-label="Main">
          <Link href="/" aria-current={current('/')}>
            Runs
          </Link>
          <Link href="/replay" aria-current={current('/replay')}>
            Replay a file
          </Link>
          <a href={REPO} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
