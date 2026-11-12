// Shared contract suite for ShopperAccountPort: the in-memory fake runs it in `pnpm test`; the
// Juice Shop adapter runs it against the real image in `pnpm test:sandbox`. Not part of the build.

import { newUlid } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { InfrastructureError } from '../domain/run/run-errors.js';
import type { ShopperAccountPort } from '../domain/task/shopper-account-port.js';

export interface ShopperAccountContractHarness {
  readonly create: () => { accounts: ShopperAccountPort; baseUrl: string };
  readonly timeoutMs?: number;
}

const account = () => ({
  name: 'Carmen Sintética',
  email: `carmen-${newUlid().toLowerCase()}@janus.test`,
  password: `pw-${newUlid().toLowerCase()}`,
  details: { 'security answer': 'Sintética' },
});

export function describeShopperAccountContract(
  name: string,
  harness: ShopperAccountContractHarness,
): void {
  const timeout = harness.timeoutMs ?? 5_000;

  describe(`${name} (ShopperAccountPort contract)`, () => {
    it(
      'creates a new shopper account',
      async () => {
        const { accounts, baseUrl } = harness.create();

        await expect(accounts.create(baseUrl, account())).resolves.toBeUndefined();
      },
      timeout,
    );

    it(
      'fails as infrastructure when the email is already taken',
      async () => {
        const { accounts, baseUrl } = harness.create();
        const twice = account();
        await accounts.create(baseUrl, twice);

        await expect(accounts.create(baseUrl, twice)).rejects.toBeInstanceOf(InfrastructureError);
      },
      timeout,
    );
  });
}
