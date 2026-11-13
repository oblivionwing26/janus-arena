'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';

import { ExportActions } from '@/components/export-actions';
import { RunLinks } from '@/components/run-links';
import { RunViewer } from '@/components/run-viewer';
import { DEMO } from '@/lib/demo';
import { DemoRunSource, LiveSource } from '@/lib/sources';

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const source = useMemo(
    () => (DEMO ? new DemoRunSource(id) : new LiveSource(`/api/orchestrator/runs/${id}/events`)),
    [id],
  );

  return (
    <>
      <h1>Run {id}</h1>
      <p>
        <Link href={`/runs/${id}/report`}>Informe SynthLab: heatmap y embudo →</Link>
      </p>
      <RunViewer
        key={id}
        source={source}
        mode={DEMO ? 'replay' : 'live'}
        actions={(events) => (
          <>
            <RunLinks runId={id} events={events} />
            <ExportActions runId={id} events={events} />
          </>
        )}
      />
    </>
  );
}
