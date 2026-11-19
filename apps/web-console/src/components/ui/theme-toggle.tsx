'use client';

import { useSyncExternalStore } from 'react';

type Theme = 'dark' | 'light';

/** The key the head script reads before paint, so the page never flashes the wrong theme. */
export const THEME_KEY = 'janus-theme';

/** The theme on <html>, kept in step with any change to its data-theme attribute. */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => {
    observer.disconnect();
  };
}
const current = (): Theme =>
  document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

/** Switches between the dark observatory and the light theme, and remembers the choice. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, current, () => 'dark' as const);

  const toggle = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private mode or blocked storage: the choice lasts for this page only.
    }
  };

  const label = theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
  return (
    <button
      type="button"
      className="btn-ghost theme-toggle"
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
        {theme === 'light' ? (
          <path
            d="M15.5 12.2A6.5 6.5 0 0 1 7.8 4.5a6.5 6.5 0 1 0 7.7 7.7Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        ) : (
          <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="10" cy="10" r="3.4" />
            <path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3 6 14M14 6l1.3-1.3" />
          </g>
        )}
      </svg>
    </button>
  );
}

/** Runs before the page paints: the stored theme, or the dark observatory by default. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem('${THEME_KEY}');document.documentElement.dataset.theme=t==='light'?'light':'dark'}catch(e){document.documentElement.dataset.theme='dark'}`;
