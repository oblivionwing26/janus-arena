/** Files that no agent may edit in any target, whatever the target's own allowlist says. */
const ALWAYS_DENIED = [
  /(?:^|\/)package\.json$/,
  /(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?)$/,
  /(?:^|\/)\.env(?:\.|$)/,
  /(?:^|\/)\.git\//,
  /ux_flaws/i,
];

/** `**` matches any path (slashes included), `*` anything but a slash. */
function globToRegExp(glob: string): RegExp {
  let source = '';
  for (let index = 0; index < glob.length; index++) {
    const char = glob[index] ?? '';
    if (char === '*' && glob[index + 1] === '*') {
      source += glob[index + 2] === '/' ? '(?:.*/)?' : '.*';
      index += glob[index + 2] === '/' ? 2 : 1;
    } else if (char === '*') source += '[^/]*';
    else source += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

/**
 * Which files an agent that changes code may edit in a target (F2.3, CLAUDE.md): a path must
 * match one `allow` glob and no `deny` glob, and is never a manifest, a lockfile, an env file
 * or the target's ground truth.
 */
export class EditPolicy {
  private readonly allow: readonly RegExp[];
  private readonly deny: readonly RegExp[];

  constructor(globs: { readonly allow: readonly string[]; readonly deny?: readonly string[] }) {
    this.allow = globs.allow.map(globToRegExp);
    this.deny = (globs.deny ?? []).map(globToRegExp);
  }

  canEdit(path: string): boolean {
    if (path.startsWith('/') || path.split('/').includes('..')) return false;
    if (ALWAYS_DENIED.some((rule) => rule.test(path))) return false;
    if (this.deny.some((rule) => rule.test(path))) return false;
    return this.allow.some((rule) => rule.test(path));
  }
}
