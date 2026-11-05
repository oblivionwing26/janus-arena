import { describeBrowserContract } from '../../test-support/browser-contract.js';
import { SHOPLAB_PAGES } from '../../test-support/shoplab-pages.js';
import { ScriptedBrowser } from './scripted-browser.js';

describeBrowserContract('ScriptedBrowser', {
  browser: () => new ScriptedBrowser(SHOPLAB_PAGES),
  baseUrl: () => 'http://janus-test-app:3100',
  page: '/login',
  field: { label: 'Email' },
  link: { role: 'link', name: 'Crea una' },
  linkTarget: /\/register$/,
});
