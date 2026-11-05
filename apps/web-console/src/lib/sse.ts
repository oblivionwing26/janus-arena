export interface SseMessage {
  readonly id: string | undefined;
  readonly event: string;
  readonly data: string;
}

/**
 * Incremental text/event-stream parser. The orchestrator names each message after its event
 * type, and EventSource can only listen to names it knows in advance, so the console reads the
 * stream itself to keep unknown (future) event types.
 */
export class SseParser {
  private buffer = '';

  push(chunk: string): SseMessage[] {
    this.buffer += chunk.replace(/\r\n?/g, '\n');
    const messages: SseMessage[] = [];
    let end = this.buffer.indexOf('\n\n');
    while (end !== -1) {
      const block = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      const message = parseBlock(block);
      if (message !== null) messages.push(message);
      end = this.buffer.indexOf('\n\n');
    }
    return messages;
  }
}

function parseBlock(block: string): SseMessage | null {
  let id: string | undefined;
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line === '' || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'id') id = value;
    else if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  return data.length === 0 ? null : { id, event, data: data.join('\n') };
}
