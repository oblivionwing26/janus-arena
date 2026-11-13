# ADR 0015: Janus opens pull requests as a GitHub App, with fetch and git, without Octokit

- **Status:** Accepted
- **Date:** 2026-11-13
- **Step:** F3.8

## Context

F3.8 publishes a variant or fix branch and opens a pull request carrying the signed dual report. The roadmap names an Octokit adapter. Janus needs four REST calls: an installation token, the repository's default branch, the open pull requests for a branch, and creating one. It also needs one `git push`. The credential must be as narrow as possible, and it must never appear in a URL, an argument list, an error or a log. Janus must have no way to merge or approve.

## Decision

- **Identity:** a GitHub App installed only on `janus-shoplab`. It has Contents (read and write), Pull requests (read and write) and Metadata (read), and no webhook. Its private key stays outside the repositories. `JANUS_GITHUB_APP_ID`, `JANUS_GITHUB_APP_KEY` (a path) and `JANUS_GITHUB_INSTALLATION_ID` name it.
- **Authentication without an SDK:**
  - `appJwt` signs the app's RS256 JWT with `node:crypto`. The JWT is backdated a minute and valid for ten.
  - The JWT buys an installation token narrowed to the one repository, with only `contents` and `pull_requests`.
  - Requests go through `fetch`.
  - A failure reports the status and GitHub's own message, never the credentials.
- **Push:** `git push` to `https://github.com/<owner>/<repo>.git`.
  - The token travels in an `http.extraheader` passed through the environment (`GIT_CONFIG_COUNT`), never in the URL or the arguments.
  - The push runs with no credential helper and no terminal prompt.
- **Port:** `PullRequestPort.open` only pushes and opens into the default branch. If a pull request is already open for the branch, it returns that one. It accepts only `janus/…` branches. The contract suite checks that the port has nothing named merge, approve or review. The pull request has `maintainer_can_modify: false`.
- **CLI:** `pnpm janus pr` refuses a report that does not verify. It commits the four signed files and the public key to `janus-report/` on the branch, then opens the pull request with the Markdown report as its body.

## Alternatives considered

| Option                         | Why not                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Octokit (`@octokit/app`, etc.) | A dependency tree for four REST calls. Its convenience methods include merge and review, which Janus must never reach. |
| A personal access token        | It acts as the user and is not tied to one repository. The PR would look self-made rather than Janus's.                |
| Token in the push URL          | It ends up in git's remote config, in error messages and in process lists.                                             |

## Consequences

- **Positive:** no new dependency. The token is short-lived, scoped to one repository and never written down. Every PR is authored by the App's bot account, so a human review is always someone else's.
- **Negative:** Janus owns a small amount of GitHub API code: the JWT, the token request and error handling. It has no paging or retries yet. The scripted-GitHub tests and the contract suite are its guard.
- **Follow-ups:** F3.9 calls the same port at the end of the gate.
