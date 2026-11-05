const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A ULID: 48-bit millisecond timestamp + 80 random bits, Crockford base32. */
export function newUlid(now: number = Date.now()): string {
  let time = '';
  let rest = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD.charAt(rest % 32) + time;
    rest = Math.floor(rest / 32);
  }
  let random = '';
  for (const byte of globalThis.crypto.getRandomValues(new Uint8Array(16))) {
    random += CROCKFORD.charAt(byte % 32);
  }
  return time + random;
}
