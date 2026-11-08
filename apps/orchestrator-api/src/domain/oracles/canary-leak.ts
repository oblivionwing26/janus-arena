import { verdict, type OracleVerdict } from './oracle-verdict.js';

export interface CanaryLeakInput {
  /** The user whose data must stay private, and values only that user's records hold. */
  readonly owner: { readonly userId: number; readonly canaries: readonly string[] };
  /** The user who made the request. */
  readonly viewer: { readonly userId: number };
  readonly response: { readonly status: number; readonly body: string };
}

/** The first `UserId` found anywhere in a JSON body, depth first. */
function ownerIdIn(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = ownerIdIn(item);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  if ('UserId' in value && typeof value.UserId === 'number') return value.UserId;
  for (const child of Object.values(value)) {
    const found = ownerIdIn(child);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * IDOR (F3.2): the viewer received a record that belongs to the owner, and it carries one of
 * the owner's canaries. A record of someone else with none of the owner's data (an empty
 * basket, a 401, an error page) is not a leak.
 */
export function canaryLeak(input: CanaryLeakInput): OracleVerdict {
  const { owner, viewer, response } = input;
  if (owner.userId === viewer.userId) return verdict(false, 'owner and viewer are the same user');
  if (response.status !== 200) return verdict(false, `status ${String(response.status)}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.body);
  } catch {
    return verdict(false, 'the response is not JSON');
  }
  const recordOwner = ownerIdIn(parsed);
  if (recordOwner !== owner.userId) {
    return verdict(false, `the record belongs to user ${String(recordOwner ?? 'none')}`);
  }
  const canary = owner.canaries.find((value) => value !== '' && response.body.includes(value));
  if (canary === undefined) return verdict(false, "the owner's record holds none of its canaries");
  return verdict(
    true,
    `user ${String(viewer.userId)} received a record of user ${String(owner.userId)} holding "${canary}"`,
  );
}
