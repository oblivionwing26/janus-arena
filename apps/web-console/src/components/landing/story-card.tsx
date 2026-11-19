'use client';

import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';

import type { FeaturedRun } from '@/lib/backend';
import { STORY_FACE, STORY_LABEL, storyKind } from '@/lib/landing';

/** One of the demo's stories: what happened in a recorded run, and the pages that show it. */
export function StoryCard({
  story,
  index,
}: {
  readonly story: FeaturedRun;
  readonly index: number;
}) {
  const still = useReducedMotion() === true;
  const kind = storyKind(story);
  const face = STORY_FACE[kind];
  const [primary, ...rest] = story.links;
  return (
    <motion.article
      className={`story story-${face}`}
      {...(still
        ? {}
        : {
            initial: { opacity: 0, y: 22 },
            whileInView: { opacity: 1, y: 0 },
            viewport: { once: true, margin: '-40px' },
            transition: { duration: 0.65, delay: (index % 3) * 0.08, ease: [0.22, 1, 0.36, 1] },
          })}
    >
      <div className="story-head">
        <span
          className={`chip ${face === 'ux' ? 'chip-ux' : face === 'sec' ? 'chip-sec' : 'chip-accent'}`}
        >
          {STORY_LABEL[kind]}
        </span>
        <span className="story-id mono">{story.runId.slice(-8)}</span>
      </div>
      <h3>{story.title}</h3>
      <p>{story.summary}</p>
      <div className="story-links">
        {primary !== undefined && (
          <Link className="btn btn-primary" href={primary.href}>
            {primary.label}
            <span aria-hidden="true">→</span>
          </Link>
        )}
        {rest.map((link) => (
          <Link key={link.href} className="story-link" href={link.href}>
            {link.label}
          </Link>
        ))}
      </div>
    </motion.article>
  );
}
