import { sign } from 'node:crypto';

const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

/**
 * The JSON Web Token a GitHub App authenticates with (F3.8): RS256 over its private key, issued
 * by its app id, backdated a minute for clock skew and valid for ten, GitHub's maximum. It only
 * buys an installation token; the token is what pushes and opens pull requests.
 */
export function appJwt(appId: string, privatePem: string, nowSeconds: number): string {
  const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({
    iss: appId,
    iat: nowSeconds - 60,
    exp: nowSeconds + 540,
  })}`;
  return `${unsigned}.${sign('sha256', Buffer.from(unsigned), privatePem).toString('base64url')}`;
}
