/** What a published demo run must not carry (F3.12). Names only: a match is never returned. */
export interface SecretFinding {
  readonly pattern: string;
  readonly count: number;
}

const PATTERNS: readonly { readonly name: string; readonly regex: RegExp }[] = [
  { name: 'anthropic-api-key', regex: /sk-ant-[A-Za-z0-9_-]{8,}/g },
  { name: 'github-token', regex: /\bgh[pousr]_[A-Za-z0-9]{20,}/g },
  { name: 'github-fine-grained-token', regex: /github_pat_[A-Za-z0-9_]{20,}/g },
  { name: 'aws-access-key', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'slack-token', regex: /\bxox[abpr]-[A-Za-z0-9-]{10,}/g },
  { name: 'jwt', regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g },
  { name: 'private-key', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
];

/** A credential-looking JSON field with a value: not a field that only names another field. */
const CREDENTIAL_FIELD =
  /"(?:password|passwd|secret|api[_-]?key|authorization|access[_-]?token)"s*:s*"([^"]+)"/gi;
const FIELD_NAMES = new Set(['password', 'passwd', 'pass', 'secret', 'token', 'email', 'username']);

const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

/**
 * Looks for credentials and real addresses in text about to be published. The synthetic domains
 * the project owns are the only addresses allowed; anything else is reported, by pattern and
 * count, never by value (a finding must not leak what it found).
 */
export function scanForSecrets(
  text: string,
  allowedEmailDomains: readonly string[],
): SecretFinding[] {
  const allowed = new Set(allowedEmailDomains.map((domain) => domain.toLowerCase()));
  const findings: SecretFinding[] = [];
  for (const { name, regex } of PATTERNS) {
    const count = [...text.matchAll(regex)].length;
    if (count > 0) findings.push({ pattern: name, count });
  }
  // A PoC names the password field ("password": "password"); a value that is more is a credential.
  const credentials = [...text.matchAll(CREDENTIAL_FIELD)].filter(
    (match) => !FIELD_NAMES.has((match[1] ?? '').toLowerCase()),
  ).length;
  if (credentials > 0) findings.push({ pattern: 'credential-field', count: credentials });
  const foreign = [...text.matchAll(EMAIL)].filter(
    (match) => !allowed.has((match[1] ?? '').toLowerCase()),
  ).length;
  if (foreign > 0) findings.push({ pattern: 'email-outside-synthetic-domains', count: foreign });
  return findings;
}
