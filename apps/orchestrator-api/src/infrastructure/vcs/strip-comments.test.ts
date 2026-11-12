import { describe, expect, it } from 'vitest';

import { stripComments } from './strip-comments.js';

const markers = ['vuln-code-snippet'];

describe('stripComments (ADR 0012)', () => {
  it('removes a whole-line marker comment, line included', () => {
    expect(stripComments('a\n// vuln-code-snippet start x\nb\n', markers)).toBe('a\nb\n');
  });

  it('keeps the code before a trailing marker comment', () => {
    expect(
      stripComments("    path: 'administration', // vuln-code-snippet vuln-line x\n", markers),
    ).toBe("    path: 'administration',\n");
  });

  it('leaves the marker alone inside a string, where removing it would break the code', () => {
    const source = "const s = '// vuln-code-snippet start k\\n some code\\n' // Missing end\n";

    expect(stripComments(source, markers)).toBe(source);
  });

  it('keeps other comments and lines without a marker, and Windows line endings', () => {
    const source = '// plain comment\r\nreturn id // vuln-code-snippet neutral-line x\r\n';

    expect(stripComments(source, markers)).toBe('// plain comment\r\nreturn id\r\n');
  });

  it('changes nothing without markers', () => {
    expect(stripComments('// vuln-code-snippet x\n', [])).toBe('// vuln-code-snippet x\n');
  });
});
