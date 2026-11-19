import type { Metadata } from 'next';

import { JanusHero } from '@/components/janus/janus-hero';
import { PipelineSection } from '@/components/launch/pipeline-section';
import { ProblemSection } from '@/components/launch/problem-section';
import { SectionRail } from '@/components/launch/section-rail';

import './launch.css';
import './pipeline.css';

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
    </div>
  );
}
