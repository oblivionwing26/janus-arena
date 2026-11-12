import { InfrastructureError } from '../../domain/run/run-errors.js';
import { NetworkGuard } from '../../domain/scope/network-guard.js';
import type { ScopedHttpClient, ScopedHttpPort } from '../../domain/scope/scoped-http-port.js';
import type { ShopperAccount, ShopperAccountPort } from '../../domain/task/shopper-account-port.js';

/**
 * Juice Shop accounts for SynthLab shoppers (F3.5a): registered through Juice Shop's own sign-up
 * API, as its frontend does, from inside the sandbox network. With a saved checkout, the account
 * then signs in and saves its home address and card through the same APIs its forms use. A
 * probe, never an attack: the guard allows only the variant's origin.
 */
export class JuiceShopShopperAccounts implements ShopperAccountPort {
  constructor(private readonly http: ScopedHttpPort) {}

  async create(baseUrl: string, account: ShopperAccount): Promise<void> {
    const origin = new URL(baseUrl).origin;
    const client = this.http.client(
      new NetworkGuard({
        target: 'juice-shop',
        origins: [origin],
        excludedPaths: [],
        allowedTests: ['http-probe'],
        maxRequestsPerSecond: 20,
      }),
      () => Promise.resolve(),
    );
    const send = (path: string, body: unknown, token?: string) =>
      client.send({
        method: 'POST',
        url: `${origin}${path}`,
        testType: 'http-probe',
        headers: {
          'content-type': 'application/json',
          ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(body),
      });
    const reply = await send('/api/Users', {
      email: account.email,
      password: account.password,
      passwordRepeat: account.password,
      securityQuestion: { id: 1 },
      securityAnswer: account.details['security answer'] ?? 'Sintética',
    });
    if (reply.status !== 201) {
      throw new InfrastructureError(
        `Juice Shop did not create the account of ${account.email}: ${String(reply.status)}`,
      );
    }
    if (account.saveCheckout === true) await saveCheckout(send, account);
  }
}

type Send = (path: string, body: unknown, token?: string) => ReturnType<ScopedHttpClient['send']>;

async function saveCheckout(send: Send, account: ShopperAccount): Promise<void> {
  const detail = (key: string): string => {
    const value = account.details[key];
    if (value === undefined || value === '') {
      throw new InfrastructureError(`The Juice Shop shopper has no "${key}" to save`);
    }
    return value;
  };
  const [month, year] = detail('card expiry').split('/').map(Number);
  if (!month || !year) {
    throw new InfrastructureError('The Juice Shop shopper card expiry is not MM/YYYY');
  }
  const address = {
    fullName: account.name,
    mobileNum: Number(detail('mobile number')),
    zipCode: detail('zip code'),
    streetAddress: detail('address'),
    city: detail('city'),
    state: detail('state'),
    country: detail('country'),
  };
  const card = {
    fullName: account.name,
    cardNum: Number(detail('card number')),
    expMonth: month,
    expYear: year,
  };

  const login = await send('/rest/user/login', {
    email: account.email,
    password: account.password,
  });
  const token = tokenOf(login.status, login.body);
  if (token === undefined) {
    throw new InfrastructureError(
      `Juice Shop did not sign in ${account.email}: ${String(login.status)}`,
    );
  }
  for (const [path, body] of [
    ['/api/Addresss', address],
    ['/api/Cards', card],
  ] as const) {
    const saved = await send(path, body, token);
    if (saved.status !== 201) {
      throw new InfrastructureError(
        `Juice Shop did not save ${path} for ${account.email}: ${String(saved.status)}`,
      );
    }
  }
}

function tokenOf(status: number, body: string): string | undefined {
  if (status !== 200) return undefined;
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== 'object' || parsed === null || !('authentication' in parsed)) {
      return undefined;
    }
    const { authentication } = parsed;
    if (typeof authentication !== 'object' || authentication === null) return undefined;
    return 'token' in authentication && typeof authentication.token === 'string'
      ? authentication.token
      : undefined;
  } catch {
    return undefined;
  }
}
