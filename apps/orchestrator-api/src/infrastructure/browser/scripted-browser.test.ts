import { describeBrowserContract } from '../../test-support/browser-contract.js';
import { SHOPLAB_PAGES } from '../../test-support/shoplab-pages.js';
import { ScriptedBrowser } from './scripted-browser.js';

describeBrowserContract('ScriptedBrowser', {
  browser: () =>
    new ScriptedBrowser(SHOPLAB_PAGES, { '/api/health': { status: 200, body: '{"status":"ok"}' } }),
  fetchable: '/api/health',
  baseUrl: () => 'http://janus-test-app:3100',
  page: '/login',
  field: { label: 'Email' },
  secret: { label: 'Contraseña' },
  link: { role: 'link', name: 'Crea una' },
  linkTarget: /\/register$/,
  choice: {
    page: '/products/taza-ceramica',
    target: { role: 'combobox', name: 'Cantidad' },
    option: '2',
  },
});
