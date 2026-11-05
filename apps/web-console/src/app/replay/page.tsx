'use client';

import { parseRunExport } from '@janus/shared-kernel';
import { useEffect, useState } from 'react';

import { OFFLINE_RUN_KEY } from '@/components/export-actions';
import { RunViewer } from '@/components/run-viewer';
import { RecordedSource } from '@/lib/sources';

interface Loaded {
  runId: string;
  source: RecordedSource;
}

// Replays an exported run entirely in the browser: no orchestrator needed (G2 demo mode).
export default function ReplayPage() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load(text: string) {
    try {
      const run = parseRunExport(text);
      setLoaded({ runId: run.runId, source: new RecordedSource(run.events) });
      setError(null);
    } catch (caught) {
      setError(
        `No se pudo abrir el run: ${caught instanceof Error ? caught.message : String(caught)}`,
      );
    }
  }

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('from') !== 'session') return;
    try {
      const text = sessionStorage.getItem(OFFLINE_RUN_KEY);
      // Reading browser storage once on mount is an external sync, not derived state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (text !== null) load(text);
    } catch {
      // Storage unavailable: the file picker below still works.
    }
  }, []);

  return (
    <>
      <h1>Replay sin backend</h1>
      <label className="file-picker">
        Cargar un run exportado (JSON)
        <input
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) void file.text().then(load);
          }}
        />
      </label>
      {error !== null && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {loaded !== null && (
        <>
          <h2>Run {loaded.runId}</h2>
          <RunViewer key={loaded.runId} source={loaded.source} mode="replay" />
        </>
      )}
    </>
  );
}
