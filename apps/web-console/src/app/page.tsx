import type { Metadata } from 'next';

import { JanusHero } from '@/components/janus/janus-hero';
import { AttackTreeSection } from '@/components/launch/attack-tree-section';
import { BenchmarkSection } from '@/components/launch/benchmark-section';
import { CostSection } from '@/components/launch/cost-section';
import { PipelineSection } from '@/components/launch/pipeline-section';
import { ProblemSection } from '@/components/launch/problem-section';
import { SectionRail } from '@/components/launch/section-rail';
import { TwoFacesSection } from '@/components/launch/two-faces-section';

import './launch.css';
import './pipeline.css';
import './attack-tree.css';
import './cost.css';
import './two-faces.css';
import './benchmark.css';

export const metadata: Metadata = {
  title: 'Introducing Janus',
  description:
    'A pre-release gate that tests your users and your attackers on the same pull request, and tells you what every security fix costs.',
};

export default function LaunchPage() {
  return (
    <div className="launch">
      <JanusHero />
      <SectionRail />
      <ProblemSection />
      <PipelineSection />
      <TwoFacesSection />
      <AttackTreeSection />
      <CostSection />
      <BenchmarkSection />
    </div>
  );
}
