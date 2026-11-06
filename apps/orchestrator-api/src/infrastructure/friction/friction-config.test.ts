import { defaultFrictionConfig } from '@janus/friction-engine';
import { describe, expect, it } from 'vitest';

import { loadFrictionConfig, repoFrictionConfigPath } from './friction-config.js';

describe('config/friction.yaml', () => {
  it('is valid and says exactly what the engine defaults say', async () => {
    expect(await loadFrictionConfig(repoFrictionConfigPath())).toEqual(defaultFrictionConfig);
  });
});
