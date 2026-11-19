import { LAUNCH } from '@/lib/launch-data';

import { CountUp } from './count-up';
import { LaunchSection } from './launch-section';
import { TradeoffSim } from './tradeoff-sim';

const { juiceGate, shoplabAB, strictRateLimit } = LAUNCH;

export function ProblemSection() {
  return (
    <LaunchSection
      id="problem"
      title={
        <>
          Close the hole, <em>lose the customer</em>
        </>
      }
      sources={[juiceGate.confirmed.source, shoplabAB.source, strictRateLimit.source]}
    >
      <div className="problem">
        <div className="problem__text">
          <p className="problem__lead">
            Every security fix has a second face. A rate limit, a CAPTCHA or an account lockout
            closes a hole, and quietly turns away people who were only trying to buy. Teams test
            usability and security apart, so nobody sees the trade-off until it ships.
          </p>
          <p className="problem__body">
            Janus tests both on the same pull request. Synthetic shoppers walk the app in a real
            browser while a Red Team attacks it in a sandbox. When a fix closes a hole, the same
            shoppers walk again, and the report says what the fix cost them.
          </p>
          <dl className="stats">
            <div className="stat-card">
              <dt>
                Vulnerabilities confirmed on OWASP Juice Shop, each with a proof replayed by code
              </dt>
              <dd>
                <CountUp value={juiceGate.confirmed.value} />
              </dd>
            </div>
            <div className="stat-card">
              <dt>
                Points of synthetic task success for a generated variant B, 95 % interval [
                {shoplabAB.value.low}, {shoplabAB.value.high}]
              </dt>
              <dd>
                <CountUp value={shoplabAB.value.delta} prefix="+" />
              </dd>
            </div>
            <div className="stat-card">
              <dt>For the whole gate on Juice Shop, a verified fix included</dt>
              <dd>
                <CountUp value={juiceGate.cost.value} decimals={2} suffix=" €" />
              </dd>
            </div>
          </dl>
        </div>
        <TradeoffSim />
      </div>
    </LaunchSection>
  );
}
