import { z } from 'zod';

import type { VictimDataPort } from '../../domain/attack/attack-target.js';
import type { TestSession } from '../../domain/attack/test-user-port.js';
import type { ScopedHttpClient } from '../../domain/scope/scoped-http-port.js';

const basket = z.object({
  data: z.object({ Products: z.array(z.object({ name: z.string() })) }),
});

/**
 * The victim's data on Juice Shop (F3.3): one product in the victim's own basket. Its name, as
 * the shop shows it to the victim, is the canary the IDOR oracle looks for.
 */
export class JuiceShopVictimData implements VictimDataPort {
  constructor(
    private readonly client: ScopedHttpClient,
    private readonly origin: string,
  ) {}

  async seed(victim: TestSession): Promise<readonly string[]> {
    if (victim.basketId === null) throw new Error(`${victim.user.email} has no basket`);
    const headers = {
      authorization: `Bearer ${victim.token}`,
      cookie: `token=${victim.token}`,
      'content-type': 'application/json',
    };
    const added = await this.client.send({
      method: 'POST',
      url: `${this.origin}/api/BasketItems`,
      testType: 'http-probe',
      headers,
      body: JSON.stringify({ ProductId: 1, BasketId: victim.basketId, quantity: 1 }),
    });
    if (added.status !== 200) {
      throw new Error(`Juice Shop did not fill the victim's basket: ${String(added.status)}`);
    }
    const own = await this.client.send({
      method: 'GET',
      url: `${this.origin}/rest/basket/${String(victim.basketId)}`,
      testType: 'http-probe',
      headers,
    });
    const names = basket.parse(JSON.parse(own.body)).data.Products.map((product) => product.name);
    if (names.length === 0) throw new Error("The victim's basket is still empty");
    return names;
  }
}
