// The lathe's stills for reduced motion and browsers without WebGL: the live wireframe, captured
// from the running console at rest on each face, without the text over it, as WebP.
//   NEXT_PUBLIC_DEMO=1 pnpm --filter @janus/web-console dev   (port 3012), then
//   node assets/janus/stills.cjs [http://127.0.0.1:3012]
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const { chromium } = require(
  require.resolve('playwright-core', { paths: [path.join(REPO, 'apps', 'orchestrator-api')] }),
);
const OUT = path.join(REPO, 'apps', 'web-console', 'public', 'models');
const BASE = process.argv[2] ?? 'http://127.0.0.1:3012';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.addStyleTag({
    content:
      '.lathe__text, .lathe__hud, .lathe__credit, .site-header { opacity: 0 !important } nextjs-portal { display: none !important }',
  });
  for (const [face, progress] of [
    ['attack', 0.05],
    ['defense', 0.95],
  ]) {
    await page.evaluate((p) => {
      const el = document.querySelector('.lathe');
      const top = el.getBoundingClientRect().top + scrollY;
      scrollTo(0, top + p * (el.offsetHeight - innerHeight));
    }, progress);
    await page.waitForTimeout(3500);
    const png = await page.locator('.lathe__head').screenshot();
    // Chrome encodes WebP; Node has no encoder of its own here
    const webp = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/webp', 0.86).split(',')[1];
    }, png.toString('base64'));
    const file = path.join(OUT, `janus-${face}.webp`);
    fs.writeFileSync(file, Buffer.from(webp, 'base64'));
    console.log(face, fs.statSync(file).size, 'bytes');
  }
  await browser.close();
})();
