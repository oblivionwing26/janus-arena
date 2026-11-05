import type { Timeline } from '@/lib/timeline';

const time = new Intl.DateTimeFormat('es-ES', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  fractionalSecondDigits: 1,
});

export function TimelineView({ timeline }: { timeline: Timeline }) {
  if (timeline.lanes.length === 0) {
    return <p className="empty">Todavía no hay eventos.</p>;
  }
  return (
    <div className="lanes">
      {timeline.lanes.map((lane) => (
        <section key={lane.agentId} className="lane" aria-label={`Agente ${lane.agentId}`}>
          <h3>
            {lane.agentId} <span className="role">{lane.role}</span>
          </h3>
          <ol>
            {lane.items.map((item) => (
              <li key={item.seq} className={`item tone-${item.tone}`} data-known={item.known}>
                <span className="seq">#{item.seq}</span>
                <time dateTime={item.ts}>{time.format(new Date(item.ts))}</time>
                <span className="type">{item.type}</span>
                <span className="label">{item.label}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
