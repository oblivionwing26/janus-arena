# Deploying the demo

The console has a demo build (`NEXT_PUBLIC_DEMO=1`) that replays recorded runs from
`apps/web-console/public/demo`: no backend, no keys, no model calls. Any host that runs a Next.js
build can serve it. These are the steps for Vercel (about five minutes).

## Check it locally first

```bash
pnpm demo:build
pnpm --filter @janus/web-console start     # http://127.0.0.1:3012
```

Open the home page (three stories), the attack graph of the Juice Shop gate and a SynthLab report.
In the browser's network tab there must be no request to `/api/orchestrator`: the console only
reads files under `/demo`.

## Deploy on Vercel

1. In Vercel, **Add New → Project** and import the `janus-arena` repository.
2. **Root Directory:** `apps/web-console`. Leave "Include source files outside of the Root
   Directory in the Build Step" on: the console builds the workspace packages it imports.
3. **Framework preset:** Next.js (`apps/web-console/vercel.json` sets the install and build
   commands, and the build script sets `NEXT_PUBLIC_DEMO=1` itself). No environment variables are
   needed.
4. **Node.js version:** 22.x or 24.x (Settings → General).
5. Deploy. If the production URL asks you to sign in to Vercel, turn off Deployment Protection for
   Production (Settings → Deployment Protection).
6. Open the URL and run the same check as above.

## After deploying

- Put the URL in the README, where the comment says so, and in the video's description.
- To refresh the demo with new runs, edit `config/demo.yaml`, run `pnpm demo:export` against your
  event log, and commit `apps/web-console/public/demo`. The export refuses to write anything if a
  file carries a credential or an address outside the project's synthetic domains.

## What the demo does not have

- **Screenshots.** The recorded runs keep their events but not their images (`.artifacts/` is
  200 MB), so the heatmap shows its zones and legend without the page captures.
- **Live runs.** It plays what was recorded; starting a run needs the orchestrator, Docker and an
  API key.
- **English labels.** The console's interface is in Spanish; the demo's banner and stories are in
  English.
