import type { Metadata } from 'next';

import { AttackTreeSection } from '@/components/launch/attack-tree-section';
import { AvailabilitySection } from '@/components/launch/availability-section';
import { BenchmarkSection } from '@/components/launch/benchmark-section';
import { ConsoleSection } from '@/components/launch/console-section';
import { CostSection } from '@/components/launch/cost-section';
import { LatheSection } from '@/components/launch/lathe-section';
import { LimitsSection } from '@/components/launch/limits-section';
import { MonolithHero } from '@/components/launch/monolith-hero';
import { PipelineSection } from '@/components/launch/pipeline-section';
import { ProblemSection } from '@/components/launch/problem-section';
import { SealSection } from '@/components/launch/seal-section';
import { SectionRail } from '@/components/launch/section-rail';
import { TwoFacesSection } from '@/components/launch/two-faces-section';

import './launch.css';
import './pipeline.css';
import './attack-tree.css';
import './cost.css';
import './two-faces.css';
import './benchmark.css';
import './seal.css';
import './console-vista.css';
import './closing.css';
import './lathe.css';

export const metadata: Metadata = {
  title: 'Introducing Janus',
  description:
    'A pre-release gate that tests your users and your attackers on the same pull request, and tells you what every security fix costs.',
};

export default function LaunchPage() {
  return (
    <div className="launch">
      <MonolithHero />
      <SectionRail />
      <LatheSection />
      <ProblemSection />
      <PipelineSection />
      <TwoFacesSection />
      <AttackTreeSection />
      <CostSection />
      <BenchmarkSection />
      <SealSection />
      <ConsoleSection />
      <LimitsSection />
      <AvailabilitySection />
    </div>
  );
}
