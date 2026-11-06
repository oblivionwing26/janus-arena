/**
 * The route a URL belongs to, so that visits to different products or orders add up: the path
 * without query or trailing slash, matched against the target's patterns (`/products/:slug`).
 * Without a matching pattern, numeric segments become `:id`.
 */
export function routeOf(url: string, patterns: readonly string[] = []): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url.split(/[?#]/)[0] ?? url;
  }
  const segments = path.split('/').filter((segment) => segment !== '');
  for (const pattern of patterns) {
    const wanted = pattern.split('/').filter((segment) => segment !== '');
    if (
      wanted.length === segments.length &&
      wanted.every((segment, index) => segment.startsWith(':') || segment === segments[index])
    ) {
      return pattern;
    }
  }
  return `/${segments.map((segment) => (/^\d+$/.test(segment) ? ':id' : segment)).join('/')}`;
}
