const PAGE = /^(?:src\/)?app\/(?:(.*)\/)?page\.(?:tsx|ts|jsx|js)$/;
const SOURCE = /\.(?:tsx|ts|jsx|js)$/;

/**
 * The Next.js app-router page files that render a route (F2.2): `src/app/cart/page.tsx` for
 * `/cart`, `src/app/products/[slug]/page.tsx` for `/products/:slug` or `/products/taza`.
 * Route groups `(shop)` do not count as segments.
 */
export function pageFilesFor(route: string, files: readonly string[]): string[] {
  const wanted = route.split('/').filter((segment) => segment !== '');
  return files.filter((file) => {
    const match = PAGE.exec(file);
    if (match === null) return false;
    const segments = (match[1] ?? '')
      .split('/')
      .filter((segment) => segment !== '' && !/^\(.*\)$/.test(segment));
    if (segments.some((segment) => segment.startsWith('[...'))) {
      const fixed = segments.slice(0, -1);
      return (
        wanted.length > fixed.length && fixed.every((segment, i) => matches(segment, wanted[i]))
      );
    }
    return (
      segments.length === wanted.length &&
      segments.every((segment, index) => matches(segment, wanted[index]))
    );
  });
}

function matches(fileSegment: string, routeSegment: string | undefined): boolean {
  if (routeSegment === undefined) return false;
  return /^\[.+\]$/.test(fileSegment) || fileSegment === routeSegment;
}

/**
 * The project files a module imports directly (F2.2): `@/x` resolves to `src/x`, relative
 * paths to their folder, with the usual extensions and `index` files. Packages are left out.
 */
export function localImports(path: string, content: string, files: readonly string[]): string[] {
  const available = new Set(files);
  const folder = path.split('/').slice(0, -1);
  const found = new Set<string>();
  for (const [, specifier] of content.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
    if (specifier === undefined) continue;
    let base: string[] | null = null;
    if (specifier.startsWith('@/')) base = ['src', ...specifier.slice(2).split('/')];
    else if (specifier.startsWith('.')) {
      base = [...folder];
      for (const part of specifier.split('/')) {
        if (part === '..') base.pop();
        else if (part !== '.') base.push(part);
      }
    }
    if (base === null) continue;
    const stem = base.join('/');
    const candidates = SOURCE.test(stem)
      ? [stem]
      : ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts'].map((ext) => stem + ext);
    const hit = candidates.find((candidate) => available.has(candidate));
    if (hit !== undefined && hit !== path) found.add(hit);
  }
  return [...found].sort();
}
