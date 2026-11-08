'use client';

import { useEffect, useState } from 'react';

import type { ConsoleEvent } from '@/lib/console-event';
import { fetchRunEvents } from '@/lib/run-events';

/** A run's recorded events, loaded once; null while loading. */
export function useRunEvents(runId: string | null): {
  events: ConsoleEvent[] | null;
  error: string | null;
} {
  const [events, setEvents] = useState<ConsoleEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (runId === null) return;
    let cancelled = false;
    fetchRunEvents(runId).then(
      (loaded) => {
        if (!cancelled) setEvents(loaded);
      },
      (caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [runId]);

  return { events, error };
}
