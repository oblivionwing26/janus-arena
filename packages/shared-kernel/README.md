# @oblivionwing26/shared-kernel

The event envelope and the zod schemas of [Janus Arena](https://github.com/oblivionwing26/janus-arena):
the vocabulary in which a run of synthetic users and attacks is recorded. Every event has an id, a
run, a sequence number, a timestamp, an actor, a type and a payload; each type has a versioned schema.

This package exists so that [`@oblivionwing26/friction-engine`](https://www.npmjs.com/package/@oblivionwing26/friction-engine)
can be installed on its own. You normally install that one, not this.

```js
import { parseEvent } from '@oblivionwing26/shared-kernel';
```

Unknown event types are kept, not rejected: a reader of an older log must not crash on a newer
event. MIT licensed.
