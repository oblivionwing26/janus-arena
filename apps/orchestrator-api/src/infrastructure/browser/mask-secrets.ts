export const MASK = '••••••••';

function maskText(text: string, secrets: readonly string[]): string {
  return secrets.reduce((masked, secret) => masked.split(secret).join(MASK), text);
}

function maskNode(node: unknown, secrets: readonly string[]): unknown {
  if (typeof node === 'string') return maskText(node, secrets);
  if (Array.isArray(node)) return node.map((child) => maskNode(child, secrets));
  if (typeof node === 'object' && node !== null) {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [key, maskNode(value, secrets)]),
    );
  }
  return node;
}

/**
 * Hides the values of password fields before a snapshot leaves the browser adapter: Playwright's
 * aria snapshot shows what was typed into them, and no LLM or event may ever see it.
 */
export function maskSecrets<T extends { tree: unknown; aria: string }>(
  snapshot: T,
  secrets: readonly string[],
): T {
  const values = secrets.filter((secret) => secret !== '');
  if (values.length === 0) return snapshot;
  return {
    ...snapshot,
    tree: maskNode(snapshot.tree, values),
    aria: maskText(snapshot.aria, values),
  };
}
