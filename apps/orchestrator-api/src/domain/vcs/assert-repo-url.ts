import { InvalidRepoUrlError } from './vcs-errors.js';

/** Only https:// and file:// repositories, never an argument-looking or ssh/ext:: URL. */
export function assertRepoUrl(repoUrl: string): string {
  if (!/^(https:\/\/|file:\/\/)[^\s]+$/.test(repoUrl)) throw new InvalidRepoUrlError(repoUrl);
  return repoUrl;
}
