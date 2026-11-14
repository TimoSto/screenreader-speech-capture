import { setImmediate } from 'node:timers/promises';

/**
 * A `pace` for a replay or a wait's look through the buffer (`FollowOptions`): lets other work
 * run (speech capture, other requests) every `n` entries.
 */
export function yieldEvery(n: number): () => Promise<void> | undefined {
  let count = 0;
  return () => (++count % n === 0 ? setImmediate() : undefined);
}
