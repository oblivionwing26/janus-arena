import { describe, expect, it } from 'vitest';

import { MASK, maskSecrets } from './mask-secrets.js';

describe('maskSecrets', () => {
  const tree = [
    {
      role: 'main',
      children: [
        'Contraseña',
        { role: 'textbox', name: 'Contraseña', text: 'hunter22' },
        { role: 'textbox', name: 'Email', text: 'ana@shop.test' },
        { role: 'paragraph', text: 'hunter22 is not shown here either' },
      ],
    },
  ];

  it('replaces password values wherever they appear, and nothing else', () => {
    const masked = maskSecrets({ tree, aria: '- textbox "Contraseña": hunter22' }, ['hunter22']);

    expect(JSON.stringify(masked.tree)).not.toContain('hunter22');
    expect(masked.tree).toEqual([
      {
        role: 'main',
        children: [
          'Contraseña',
          { role: 'textbox', name: 'Contraseña', text: MASK },
          { role: 'textbox', name: 'Email', text: 'ana@shop.test' },
          { role: 'paragraph', text: `${MASK} is not shown here either` },
        ],
      },
    ]);
    expect(masked.aria).toBe(`- textbox "Contraseña": ${MASK}`);
  });

  it('leaves the page alone when no password was typed', () => {
    expect(maskSecrets({ tree, aria: 'x' }, ['', ''])).toEqual({ tree, aria: 'x' });
  });
});
