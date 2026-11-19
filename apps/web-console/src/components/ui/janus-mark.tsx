/**
 * The Janus mark: one ring split in two faces, UX (aurora, left) and security (ember, right),
 * looking away from a shared axis. Decorative wherever a text label sits next to it.
 */
export function JanusMark({ className = 'brand-mark' }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="janus-ux" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--face-ux)" />
          <stop offset="1" stopColor="var(--face-ux)" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id="janus-sec" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="var(--face-sec)" />
          <stop offset="1" stopColor="var(--face-sec)" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <path
        d="M15 3.2A12.8 12.8 0 0 0 15 28.8"
        fill="none"
        stroke="url(#janus-ux)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M17 3.2A12.8 12.8 0 0 1 17 28.8"
        fill="none"
        stroke="url(#janus-sec)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <line x1="16" y1="8" x2="16" y2="24" stroke="var(--fg-faint)" strokeWidth="1" />
      <circle cx="10.5" cy="13.5" r="1.7" fill="var(--face-ux)" />
      <circle cx="21.5" cy="13.5" r="1.7" fill="var(--face-sec)" />
    </svg>
  );
}
