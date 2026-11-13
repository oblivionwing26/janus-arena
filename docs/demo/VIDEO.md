# The 3-minute video: script

Goal: someone who has never heard of Janus understands in three minutes what it does, sees it work
and trusts the numbers. Everything shown is in the demo build, so it records the same on any
machine and needs no keys.

## Before recording

- Run the demo (`pnpm demo:build` then `pnpm --filter @janus/web-console start`, or the deployed
  URL). Browser window at 1280×720, zoom 110 %, bookmarks bar hidden, dark theme.
- Open these tabs in order, so each beat is a tab switch and not a search:
  1. the README on GitHub, scrolled to "What it found, with the numbers";
  2. `/runs/01M6VD0MWENHQCSKST7EHK0WG1/report` (the ShopLab A/B);
  3. `/runs/01M79YYR766FTNCYF5STGZ3ANY` (the Juice Shop gate, stage by stage);
  4. `/runs/01M79YYR766FTNCYF5STGZ3ANY/attack` (the same gate as an attack graph);
  5. `docs/reports/gate-01M79YYR766FTNCYF5STGZ3ANY/dual-report.md` on GitHub;
  6. a terminal in the repository, ready to run
     `pnpm janus verify docs/reports/gate-01M79YYR766FTNCYF5STGZ3ANY` (it checks the event logs
     against Postgres; add `--offline` to check only the signature and the attestation).
- Rehearse the attack graph once. The replay is 4,712 events: at 16× it plays in about a minute
  from the start, and "Ir a seq" jumps anywhere (see the 1:15 beat).

## Beats

| Time        | On screen                                 | Say                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00 – 0:20 | README tagline, then the results table    | "Teams test usability and security separately. But a rate limit or an extra verification step closes a hole and quietly hurts the people you want to keep. Janus measures that trade-off in the same pull request, before release."                                                                                                                                                                                    |
| 0:20 – 0:55 | Tab 2: the ShopLab A/B report             | "First half: synthetic users. Personas, played by a language model in a real browser, try to buy with a coupon. Code, not the model, computes the friction heatmap and the success rate. Variant B was written by an agent. Success goes from 1 of 6 to 5 of 7: plus 50 points, with an interval from 17 to 83. Wide, and we say so."                                                                                  |
| 0:55 – 1:15 | Tab 3: the gate timeline                  | "The gate runs eight stages and records each one in an event log. On Juice Shop four stages are skipped, and the log says why: there is no variant B to compare, and no pull request to open on somebody else's code. Kill it mid-run and it resumes without paying again for what already finished."                                                                                                                  |
| 1:15 – 2:05 | Tab 4: the attack graph, replay           | "This is the same run as a graph. Endpoints are nodes, attacks are edges. The Red Team engine is plain code, no model, and an attack counts only when an oracle confirms it. Watch the basket endpoint go red." Seek to 1430 and play at 16×. At the patch (seq 1517): "Amber: the Blue Team proposed a fix." Seek to 4704: "Green: three independent verifiers agree." Click the node: the PoC, the diff, the checks. |
| 2:05 – 2:30 | Tab 5, then the terminal                  | "Everything lands in a signed report attached to a pull request. A human merges it; Janus never does. `janus verify` checks the signature and the event-log hashes. Change one byte and it fails."                                                                                                                                                                                                                     |
| 2:30 – 2:52 | README: the benchmark row                 | "And the honest part. On Juice Shop's own challenge list, the Red Team solves 6 of 60, ten percent, in three identical runs. It only attacks what it was programmed for. We publish that number."                                                                                                                                                                                                                      |
| 2:52 – 3:00 | The repo URL and the demo URL, full frame | "Janus Arena is open source. Replay these runs in your browser, no keys. Link below."                                                                                                                                                                                                                                                                                                                                  |

## Notes for the narration

- Say "synthetic task success", never "conversion". The point of the project is not to claim more
  than it measured.
- If you have to cut for time, cut the 2:05 beat, not the 2:30 one: the honest numbers are the
  memorable part.
- The console's labels are in Spanish: say what the screen shows, do not read it aloud.
- The numbers are in the signed reports: `docs/reports/dual-shoplab`, the gate reports under
  `docs/reports/gate-*` and `docs/reports/benchmark-juice-shop.md`. Check them before recording.
- Post the video and put its link in the README, next to the demo link.

## To record against a live run instead

More impressive, and it costs under a euro of API:

```bash
docker compose up -d && pnpm dev
pnpm run:gate gates/juice-shop.yaml     # about 10 minutes and 0.8 € of API
```

Open `http://127.0.0.1:3012/runs/<gateRunId>/attack` while it runs: the graph grows as the stages
finish. The demo build has the same pages on recorded data, so prefer it for the final take.
