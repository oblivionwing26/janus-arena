import { describe, expect, it } from 'vitest';

import { SseParser } from './sse';

describe('SseParser', () => {
  it('parses named events across arbitrary chunk boundaries', () => {
    const parser = new SseParser();
    const stream =
      'id: 0\nevent: run.started\ndata: {"seq":0}\n\nid: 1\nevent: x.y\ndata: {"seq":1}\n\n';

    const chunks = [stream.slice(0, 7), stream.slice(7, 40), stream.slice(40)];
    const messages = chunks.flatMap((chunk) => parser.push(chunk));

    expect(messages).toEqual([
      { id: '0', event: 'run.started', data: '{"seq":0}' },
      { id: '1', event: 'x.y', data: '{"seq":1}' },
    ]);
  });

  it('joins multi-line data, accepts CRLF and skips comments', () => {
    const parser = new SseParser();

    expect(parser.push(': keep-alive\r\ndata: a\r\ndata: b\r\n\r\n')).toEqual([
      { id: undefined, event: 'message', data: 'a\nb' },
    ]);
  });
});
