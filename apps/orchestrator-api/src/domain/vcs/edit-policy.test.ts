import { describe, expect, it } from 'vitest';

import { exceedsLimits } from './change-limits.js';
import { EditPolicy } from './edit-policy.js';

// ShopLab's policy, as docker/sandboxes/shoplab.yaml declares it.
const shoplab = new EditPolicy({
  allow: ['src/app/**/page.tsx', 'src/app/**/*.css', 'src/components/**'],
  deny: ['src/app/api/**'],
});

describe('EditPolicy', () => {
  it('allows frontend pages, styles and components', () => {
    for (const path of [
      'src/app/page.tsx',
      'src/app/cart/page.tsx',
      'src/app/products/[slug]/page.tsx',
      'src/app/globals.css',
      'src/components/totals-table.tsx',
      'src/components/forms/coupon.tsx',
    ]) {
      expect(shoplab.canEdit(path)).toBe(true);
    }
  });

  it('refuses the API, business and auth code, manifests, env files and the ground truth', () => {
    for (const path of [
      'src/app/api/cart/route.ts',
      'src/app/api/auth/page.tsx',
      'src/lib/sessions.ts',
      'src/lib/pricing.ts',
      'package.json',
      'src/components/package.json',
      'pnpm-lock.yaml',
      'prisma/schema.prisma',
      'src/components/.env.local',
      'src/components/UX_FLAWS.md',
      '../src/components/x.tsx',
      '/src/components/x.tsx',
      'src/app/layout.tsx',
    ]) {
      expect(shoplab.canEdit(path)).toBe(false);
    }
  });
});

describe('exceedsLimits', () => {
  const stats = (files: number, added: number, removed: number) => ({
    files: [],
    filesChanged: files,
    added,
    removed,
  });

  it('accepts up to 5 files and 200 changed lines', () => {
    expect(exceedsLimits(stats(5, 150, 50))).toBeNull();
  });

  it('says which limit a change breaks', () => {
    expect(exceedsLimits(stats(6, 1, 1))).toBe('6 files changed, the limit is 5');
    expect(exceedsLimits(stats(1, 150, 51))).toBe('201 lines changed, the limit is 200');
  });
});
