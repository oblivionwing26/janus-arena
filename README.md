# Janus Arena

Pre-release gate that detects UX-friction regressions and security regressions in the same pull request, and measures the UX cost of every security fix.

- **SynthLab**: synthetic user personas navigate two variants of a target app; friction signals are computed by code.
- **WarRoom**: static audit, sandboxed Red Team, Blue Team patches, and re-verification of both security and UX.
- **Output**: a signed dual report attached to a human-reviewed pull request.

Status: early development (phase F0). See `CLAUDE.md` for engineering rules.
