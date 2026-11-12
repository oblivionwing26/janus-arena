# ADR 0012: A patched Juice Shop is the published image plus the recompiled files of the patch

- **Status:** Accepted
- **Date:** 2026-11-12
- **Step:** F3.5 (part A)

## Context

The Blue Team (F3.5) patches a confirmed finding on Juice Shop, and its three verifiers attack, test and re-run SynthLab against the patched app. Until now Juice Shop has only run from its published image, unmodified and pinned by digest (ADR 0006, F3.1). Building Juice Shop from source is heavy: `npm install` triggers the Angular frontend install and build in `postinstall`. The repository has no lockfile, so two installs a week apart can resolve different dependency versions. The image runs the compiled backend from `/juice-shop/build/` (`tsc` at the repository root) and is distroless, with no shell or package manager. The Blue Team only needs backend paths: the reference findings (the basket IDOR, the negative quantity) live in `routes/`.

Juice Shop's repository also carries its own ground truth, which ADR 0010 asked to remove before any agent reads the code: `vuln-code-snippet` comments on the vulnerable lines of 8 backend files, and 160 challenge fixes in `data/static/codefixes/` (`…_correct.ts`). The Blue Team is the first agent to read Juice Shop's source.

## Decision

A patched variant is **the pinned published image plus only the patched backend files, recompiled**: nothing else of the image changes.

- **Tools image**, built once with network, as ShopLab's images are: `node:24` pinned by digest, Juice Shop's source at the pinned tag, and `npm install --ignore-scripts --before=<tag date>`. `--ignore-scripts` skips the frontend; `--before` makes the resolution repeatable without a lockfile. Docker caches this layer, so a new patch never reinstalls.
- **Compile stage**, without network: the patched workspace is copied over the source, `tsc` runs (its type check is the build check), and only the `.js` files of the changed `.ts` files are kept.
- **Runner**: `FROM` the pinned image, copying those `.js` files over `build/`. The image's frontend, data, configuration and other compiled files stay as published. With no changed files the variant is the published image.
- The Dockerfile lives in Janus (`docker/sandboxes/`), not in Juice Shop's repository, which stays unmodified.
- **The agent's workspace** is Juice Shop's source without its ground truth: `data/static/codefixes/` is hidden, and every `// vuln-code-snippet …` comment is removed (its line too when nothing else is on it; many sit at the end of a line of code). A marker inside a string, as in Juice Shop's own snippet tests, is kept, since removing it would break the code. This is committed as the workspace's base, so the patch is the diff against it and the comments never appear in it.

## Alternatives considered

| Option                                               | Why not                                                                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Build Juice Shop from source with its own Dockerfile | Builds the Angular frontend on every variant (minutes, gigabytes) and is not repeatable without a lockfile. |
| Recompile the whole backend and replace `build/`     | Also changes every file the patch did not touch, if our `tsc` differs from the one the image used.          |
| Transpile without type checking (`tsc --noCheck`)    | Needs no dependencies, but a patch with a type error would reach the sandbox instead of failing the build.  |
| Patch the compiled `.js` in the image directly       | The agent would work on generated code, and the patch could not become a pull request to the source.        |

## Consequences

- **Positive:** a variant differs from the published image by exactly the patch, so V1 and V3 compare the fix and nothing else. Builds after the first are fast and need no network. The ground truth never reaches the Blue Team.
- **Negative:** the tools image still needs the network once and resolves dependencies by date rather than by a lockfile. A patch that needs a new dependency, a frontend change or a data change cannot be built; the edit policy refuses those paths anyway. `routes/` code still calls `challengeUtils.solveIf(...)`, which names the challenge it tracks; it stays because Juice Shop needs it to record challenges, which the orchestrator reads to check its oracles.
- **Follow-ups:** V2 (F3.5 part B) runs Juice Shop's server tests in the tools image; the tests that read `data/static/codefixes/` need the original files, outside anything the agent sees.
