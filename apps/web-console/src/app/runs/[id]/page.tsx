'use client';

import { useParams } from 'next/navigation';
import { useMemo } from 'react';

import { ExportActions } from '@/components/export-actions';
import { RunViewer } from '@/components/run-viewer';
import { LiveSource } from '@/lib/sources';

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const source = useMemo(() => new LiveSource(`/api/orchestrator/runs/${id}/events`), [id]);

  return (
    <>
      <h1>Run {id}</h1>
      <RunViewer
        key={id}
        source={source}
        mode="live"
        actions={(events) => <ExportActions runId={id} events={events} />}
      />
    </>
  );
}
