import { describe, expect, it } from 'vitest';

import { scanForSecrets } from './scan-secrets.js';

const ALLOWED = ['janus.test', 'shoplab.test'];
const names = (text: string) => scanForSecrets(text, ALLOWED).map((finding) => finding.pattern);

describe('scanForSecrets (F3.12)', () => {
  it('finds each kind of credential', () => {
    expect(names('key sk-ant-api03-abcdefgh12345678')).toEqual(['anthropic-api-key']);
    expect(names(`token ghs_${'a'.repeat(30)}`)).toEqual(['github-token']);
    expect(names(`token github_pat_${'b'.repeat(30)}`)).toEqual(['github-fine-grained-token']);
    expect(names('id AKIAABCDEFGHIJKLMNOP')).toEqual(['aws-access-key']);
    expect(names('a jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcde12345')).toEqual(['jwt']);
    expect(names('-----BEGIN PRIVATE KEY-----\nMIIE')).toEqual(['private-key']);
    expect(names('{"password":"hunter2"}')).toEqual(['credential-field']);
  });

  it('allows the synthetic domains the project owns and reports any other address', () => {
    expect(names('janus-a@janus.test and carmen@shoplab.test')).toEqual([]);

    const found = scanForSecrets('someone@gmail.com, janus-a@janus.test, other@uni.es', ALLOWED);

    expect(found).toEqual([{ pattern: 'email-outside-synthetic-domains', count: 2 }]);
  });

  it('does not take ordinary text that mentions the words for a credential', () => {
    expect(
      names(
        'The password field is empty; a token budget of 5000 tokens; "tokens": 12; the key idea.',
      ),
    ).toEqual([]);
  });

  it('does not take a PoC that names the password field for a password', () => {
    expect(names('{"identity":"email","password":"password","guesses":20}')).toEqual([]);
    expect(names('{"password":"Tr0ub4dor-guess"}')).toEqual(['credential-field']);
  });

  it('never returns what it found', () => {
    const found = scanForSecrets(
      '{"password":"hunter2-very-secret"} sk-ant-api03-abcdefgh12345678',
      ALLOWED,
    );

    expect(JSON.stringify(found)).not.toContain('hunter2');
    expect(JSON.stringify(found)).not.toContain('abcdefgh');
  });
});
