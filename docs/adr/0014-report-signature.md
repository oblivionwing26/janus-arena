# ADR 0014: Janus signs its reports with node:crypto, in formats cosign verifies

- **Status:** Accepted
- **Date:** 2026-11-12
- **Step:** F3.7

## Context

The dual report (F3.7) must be signed, with an in-toto attestation whose subject binds the report to the commits it judged, the event logs it was built from and the tool versions. The roadmap names cosign (`sign-blob`) and in-toto. Running the cosign binary means another pinned tool image, and signing inside a container means copying the private key into it and passing its password as an environment variable through the Docker CLI. Janus works offline and its reports are private, so Sigstore's keyless flow (Fulcio, Rekor) does not fit either.

## Decision

Janus signs with `node:crypto`, in the formats cosign itself produces and verifies:

- **Key:** an ECDSA P-256 pair, the kind `cosign generate-key-pair` makes. `pnpm janus keygen` writes the private key to `.janus/keys/janus.key` (gitignored, never logged) and the public key to `keys/janus.pub`, committed so anyone can verify.
- **Signature:** `dual-report.json.sig` is the base64 DER ECDSA signature over SHA-256 of the report's bytes: what `cosign sign-blob` prints, and what `cosign verify-blob --key keys/janus.pub --insecure-ignore-tlog` checks.
- **Attestation:** an in-toto Statement v1 in a DSSE envelope signed with the same key. Its subjects are the report's SHA-256, each event log's SHA-256 and the git commits (Janus's and each fix's); its predicate holds the tool versions.
- **No transparency log:** nothing is uploaded to Rekor.
- `pnpm janus verify` checks the signature, the envelope, that every subject matches, and, when the event store is reachable, that each event log still hashes the same.

## Alternatives considered

| Option                              | Why not                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| The cosign binary in a pinned image | One more tool image, and the private key and its password would go into a container.          |
| Keyless Sigstore (Fulcio + Rekor)   | Needs the network and publishes an entry for every report in a public log.                    |
| A homemade signature format         | Nobody but Janus could check it; cosign's formats keep the verification independent of Janus. |

## Consequences

- **Positive:** no new dependency; the report can be checked with Janus or with cosign alone. A sandbox test verifies both files with cosign's pinned image.
- **Negative:** Janus owns the signing code, so it must follow cosign's formats exactly; the sandbox test is the guard. Keys are managed by hand: losing `.janus/keys/janus.key` means a new pair and a new committed public key.
- **Follow-ups:** F3.8 attaches the four files to the pull request.
