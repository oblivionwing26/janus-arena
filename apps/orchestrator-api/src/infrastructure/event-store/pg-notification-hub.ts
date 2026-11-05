import pg from 'pg';

const CHANNEL = 'janus_events';

// One dedicated connection that LISTENs for appends and fans notifications out per run.
// The events table trigger sends the run id as the payload (see the init migration).
export class PgNotificationHub {
  private readonly watchers = new Map<string, Set<() => void>>();

  private constructor(private readonly client: pg.Client) {
    client.on('notification', (message) => {
      if (message.channel !== CHANNEL || message.payload === undefined) return;
      this.watchers.get(message.payload)?.forEach((notify) => {
        notify();
      });
    });
  }

  static async connect(connectionString: string): Promise<PgNotificationHub> {
    const client = new pg.Client({ connectionString });
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    return new PgNotificationHub(client);
  }

  watch(runId: string, onChange: () => void): () => void {
    let set = this.watchers.get(runId);
    if (set === undefined) {
      set = new Set();
      this.watchers.set(runId, set);
    }
    set.add(onChange);
    return () => {
      set.delete(onChange);
      if (set.size === 0) this.watchers.delete(runId);
    };
  }

  async close(): Promise<void> {
    await this.client.end();
  }
}
