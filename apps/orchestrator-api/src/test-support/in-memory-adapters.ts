// The app wired with in-memory fakes only: no Docker, Postgres, Redis or browser. Not built.

import { ScriptedBrowser } from '../infrastructure/browser/scripted-browser.js';
import { InMemoryEventStore } from '../infrastructure/event-store/in-memory-event-store.js';
import { InMemorySessionQueue } from '../infrastructure/queue/in-memory-session-queue.js';
import { InMemorySandbox } from '../infrastructure/sandbox/in-memory-sandbox.js';
import type { AppAdapters } from '../interface/app-adapters.js';
import { SHOPLAB_PAGES } from './shoplab-pages.js';

export function inMemoryAdapters(): AppAdapters & {
  eventStore: InMemoryEventStore;
  sandbox: InMemorySandbox;
  queue: InMemorySessionQueue;
} {
  return {
    eventStore: new InMemoryEventStore(),
    sandbox: new InMemorySandbox(),
    browser: new ScriptedBrowser(SHOPLAB_PAGES),
    queue: new InMemorySessionQueue(),
  };
}
