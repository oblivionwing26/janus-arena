function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Removes `//` comments that start with a marker (ADR 0012: Juice Shop's `vuln-code-snippet`
 * comments, which point at its vulnerable lines), and the line when nothing else is left on it.
 * A marker followed by a quote on the same line is taken to be inside a string, and kept.
 */
export function stripComments(source: string, markers: readonly string[]): string {
  if (markers.length === 0) return source;
  const comment = new RegExp(
    `[ \\t]*\\/\\/[ \\t]*(?:${markers.map(escape).join('|')})[^'"\`\\r\\n]*(?=\\r?$)`,
  );
  const lines = source.split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    const stripped = line.replace(comment, '');
    if (stripped !== line && stripped.trim() === '') continue;
    kept.push(stripped);
  }
  return kept.join('\n');
}
