// The artifact each pipeline station shows: real data from the gate reports and persona files.

import {
  JUICE_FINDINGS,
  JUICE_SYNTHLAB_A,
  JUICE_VERIFIERS,
  PERSONAS,
  SHOPLAB_AUDIT_RESULT,
  SHOPLAB_GATE_AB,
  SHOPLAB_PATCHES,
} from '@/lib/pipeline-data';
import { LAUNCH } from '@/lib/launch-data';

function Dots({ n, of = 5 }: { n: number; of?: number }) {
  return (
    <span className="lit-dots" aria-label={`digital literacy ${n} of ${of}`}>
      {Array.from({ length: of }, (_, i) => (
        <i key={i} data-on={i < n} />
      ))}
    </span>
  );
}

export function PersonaCard() {
  return (
    <>
      <ul className="persona-grid">
        {PERSONAS.map((p) => (
          <li key={p.name} className="persona">
            <span className="persona__avatar" aria-hidden>
              {p.name[0]}
            </span>
            <span className="persona__name">{p.name}</span>
            <span className="persona__trait">{p.trait}</span>
            <span className="persona__meta">
              <span>{p.device}</span>
              <Dots n={p.literacy} />
            </span>
          </li>
        ))}
      </ul>
      <p className="station__fact">
        On Juice Shop, <b>{JUICE_SYNTHLAB_A.value.personas}</b> personas bought the item; the
        competent baseline, <b>{JUICE_SYNTHLAB_A.value.baseline}</b>. A model picks each click; code
        measures the friction.
      </p>
    </>
  );
}

export function VariantCard() {
  return (
    <>
      <ol className="zones">
        {SHOPLAB_PATCHES.value.map((z, i) => (
          <li key={z.page} className="zone">
            <span className="zone__rank">
              <span className="zone__heat" style={{ opacity: 0.95 - i * 0.3 }} aria-hidden />#
              {i + 1} friction zone · <code>{z.page}</code>
            </span>
            <span className="zone__problem">{z.problem}</span>
            <span className="zone__patch">
              <b>Patch</b> {z.patch}
            </span>
            <span className="zone__checks">✓ {z.checks}</span>
          </li>
        ))}
      </ol>
      <p className="station__fact">
        The UI Engineer agent patches the two most intense zones on its own branch, frontend only:
        at most 5 files and 200 lines, no auth, API or <code>package.json</code>.
      </p>
    </>
  );
}

export function AuditCard() {
  const r = SHOPLAB_AUDIT_RESULT.value;
  return (
    <>
      <div className="audit">
        {(
          [
            ['New findings', r.findings],
            ['New HTTP endpoints', r.endpoints],
            ['High severity', r.high],
            ['Critical', r.critical],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="audit__row">
            <span>{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
      <p className="station__verdict" data-tone="aurora">
        B introduces nothing: the gate lets it through
      </p>
      <p className="station__fact">
        Semgrep and the HTTP surface map compare A with B. If B adds a finding or an endpoint, the
        gate stops here and says why.
      </p>
    </>
  );
}

export function ABCard() {
  const { a, b, delta, low, high } = SHOPLAB_GATE_AB.value;
  return (
    <>
      <div className="ab">
        {(
          [
            ['A', a],
            ['B', b],
          ] as const
        ).map(([label, [won, of]]) => (
          <div key={label} className="ab__row">
            <span className="ab__label">{label}</span>
            <span className="ab__track">
              {Array.from({ length: of }, (_, i) => (
                <i key={i} data-won={i < won} />
              ))}
            </span>
            <span className="ab__val">
              {won}/{of}
            </span>
          </div>
        ))}
      </div>
      <figure
        className="interval"
        aria-label={`B minus A: +${delta} points, 95 % interval ${low} to ${high}`}
      >
        <div className="interval__axis">
          <span className="interval__band" style={{ left: `${low}%`, width: `${high - low}%` }} />
          <span className="interval__point" style={{ left: `${delta}%` }} />
          <span className="interval__zero" />
        </div>
        <figcaption>
          <span>0</span>
          <b>
            B − A: +{Math.round(delta)} points, 95 % [{low}, {high}]
          </b>
          <span>+100</span>
        </figcaption>
      </figure>
      <p className="station__fact">
        Paired by persona and seed, with a bootstrap interval. Synthetic task success, not
        conversion.
      </p>
    </>
  );
}

export function RedTeamCard() {
  return (
    <>
      <ol className="findings">
        {JUICE_FINDINGS.value.map((f, i) => (
          <li key={i} className="finding" style={{ ['--i' as string]: i }}>
            <span className="finding__sev" data-sev={f.severity}>
              {f.severity}
            </span>
            <span className="finding__kind">{f.kind}</span>
            <code className="finding__where">{f.where}</code>
            <span className="finding__oracle">{f.oracle}</span>
          </li>
        ))}
      </ol>
      <p className="station__fact">
        Attacks are generated by code, inside a sandbox with no internet. A finding counts only when
        a deterministic oracle sees it, and its proof is replayed with fresh test users.
      </p>
    </>
  );
}

export function BlueTeamCard() {
  return (
    <>
      <ol className="verifiers">
        {JUICE_VERIFIERS.value.map((v, i) => (
          <li key={v.name} className="verifier" style={{ ['--i' as string]: i }}>
            <span className="verifier__check" aria-hidden>
              ✓
            </span>
            <span className="verifier__label">{v.label}</span>
            <span className="verifier__detail">{v.detail}</span>
          </li>
        ))}
      </ol>
      <p className="station__fact">
        The basket IDOR, fixed in <b>1</b> iteration of at most 3. A patch is accepted only when all
        three verifiers pass; otherwise the finding stays open.
      </p>
    </>
  );
}

export function SealCard() {
  return (
    <>
      <div className="seal-mini" aria-hidden>
        <span className="seal-mini__ring" />
        <span className="seal-mini__core">J</span>
      </div>
      <pre className="station__code">
        <code>
          {[
            'pnpm janus verify <report folder>',
            '# or with cosign alone:',
            'cosign verify-blob --key keys/janus.pub \\',
            '  --signature dual-report.json.sig dual-report.json',
          ].join('\n')}
        </code>
      </pre>
      <p className="station__fact">
        One report for both faces, signed (ECDSA P-256), with an in-toto attestation and the hash of
        every event log it was built from. Whole gate on Juice Shop:{' '}
        <b>{LAUNCH.juiceGate.cost.value.toFixed(2)} €</b>.
      </p>
    </>
  );
}

export function MergeCard() {
  return (
    <>
      <div className="pr">
        <div className="pr__head">
          <span className="pr__state">Open</span>
          <span className="pr__title">The change, with the signed dual report attached</span>
        </div>
        <div className="pr__rows">
          <span>
            <i data-tone="aurora" /> UX A/B · signed
          </span>
          <span>
            <i data-tone="ember" /> Security findings · PoCs replayed
          </span>
          <span>
            <i data-tone="gold" /> Review required · 1 approval
          </span>
        </div>
        <div className="pr__merge">
          <span>Merge</span>
          <small>only a person can press this</small>
        </div>
      </div>
      <p className="station__fact">
        Janus opens the pull request as its GitHub App and stops: it never approves and never
        merges. (An illustration: Juice Shop is upstream code, so its gate opens no pull request.)
      </p>
    </>
  );
}
