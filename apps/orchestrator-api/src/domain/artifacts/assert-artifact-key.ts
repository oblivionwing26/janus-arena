import { InvalidArtifactKeyError } from './artifact-errors.js';

// The same shape page.screenshot accepts: lowercase segments, no "..", no leading slash.
const KEY = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/;

export function assertArtifactKey(key: string): void {
  if (key.length > 200 || !KEY.test(key) || key.split('/').includes('..')) {
    throw new InvalidArtifactKeyError(key);
  }
}
