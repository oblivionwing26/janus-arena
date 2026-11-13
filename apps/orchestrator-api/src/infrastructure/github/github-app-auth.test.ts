import { generateKeyPairSync, verify } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { appJwt } from './github-app-auth.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const decode = (part: string) =>
  JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;

describe('appJwt (F3.8)', () => {
  it('is an RS256 JWT issued by the app, backdated a minute and valid for ten', () => {
    const token = appJwt('123456', privatePem, 1_700_000_000);
    const [header = '', payload = '', signature = ''] = token.split('.');

    expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decode(payload)).toEqual({ iss: '123456', iat: 1_699_999_940, exp: 1_700_000_540 });
    expect(
      verify(
        'sha256',
        Buffer.from(`${header}.${payload}`),
        publicKey,
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true);
  });
});
