'use client';

import { useState } from 'react';

import { FINOPS, LINKS, NPM_INSTALL, PRICES } from '@/lib/closing-data';

import { JanusMark } from '../ui/janus-mark';
import { LaunchSection } from './launch-section';

const QUICKSTART = ['pnpm install', 'pnpm demo:build', 'pnpm --filter @janus/web-console start'];

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="copy"
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1600);
          })
          .catch(() => setDone(false));
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}

export function AvailabilitySection() {
  return (
    <>
      <LaunchSection
        id="availability"
        title={
          <>
            Open, and <em>ready to run</em>
          </>
        }
        lede="Janus is open source under the MIT licence. The demo, the video and the friction engine are public today; a whole gate costs less than a coffee in model spend."
        sources={[FINOPS, 'README.md']}
      >
        <div className="avail">
          <a className="avail__card glass" href={LINKS.repo} target="_blank" rel="noreferrer">
            <span className="eyebrow">Source · MIT</span>
            <b>github.com/oblivionwing26/janus-arena</b>
            <span>The gate, the console, the reports and every run behind this page.</span>
          </a>
          <a className="avail__card glass" href={LINKS.demo} target="_blank" rel="noreferrer">
            <span className="eyebrow">Live demo</span>
            <b>janus-arena.vercel.app</b>
            <span>Recorded runs replayed in the browser. Nothing to install.</span>
          </a>
          <a className="avail__card glass" href={LINKS.video} target="_blank" rel="noreferrer">
            <span className="eyebrow">Video · 3 minutes</span>
            <b>Watch it work</b>
            <span>From the pull request to the signed report.</span>
          </a>
          <div className="avail__card glass">
            <span className="eyebrow">On npm</span>
            <b>@oblivionwing26/friction-engine</b>
            <span>The friction detectors as a pure package: events in, signals out.</span>
            <code className="avail__cmd">{NPM_INSTALL}</code>
            <Copy text={NPM_INSTALL} label="Copy" />
          </div>
        </div>

        <div className="pricing glass">
          <header>
            <p className="eyebrow">What a run costs · model spend</p>
            <h3>Priced per run, measured, not estimated</h3>
          </header>
          <table>
            <tbody>
              {PRICES.map((p) => (
                <tr key={p.what}>
                  <th scope="row">
                    {p.what}
                    <span>{p.note}</span>
                  </th>
                  <td>
                    <b>{p.eur}</b> €
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="pricing__note">
            From the FinOps ledger in the repository. Every run declares a budget; the gateway warns
            at 80 % and stops at 100 %. Your own sandbox and browser time are not included.
          </p>
        </div>

        <div className="avail__bottom">
          <div className="quick">
            <p className="eyebrow">Run the demo yourself</p>
            <pre>
              <code>{QUICKSTART.join('\n')}</code>
            </pre>
            <Copy text={QUICKSTART.join('\n')} label="Copy the commands" />
          </div>
          <div className="reading">
            <p className="eyebrow">Read more</p>
            <ul>
              {LINKS.articles.map((a) => (
                <li key={a.href}>
                  <a href={a.href} target="_blank" rel="noreferrer">
                    {a.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </LaunchSection>

      <footer className="finale">
        <JanusMark size={120} />
        <p className="finale__line">Every release has two faces.</p>
        <p className="finale__sub">Janus looks at both before you ship.</p>
        <div className="finale__cta">
          <a className="app__solid" href={LINKS.demo} target="_blank" rel="noreferrer">
            Open the live demo
          </a>
          <a className="app__ghost" href={LINKS.repo} target="_blank" rel="noreferrer">
            Read the code
          </a>
        </div>
      </footer>
    </>
  );
}
