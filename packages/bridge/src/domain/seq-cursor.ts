import type { Sequenced } from './seq-queue.js';

/**
 * A follower's position in the speech log. `SpeechLog` gives every entry the next `seq`, strictly
 * rising, so an entry at or below the position was already delivered. A replay from the log and
 * the live events may therefore overlap in any timing without a duplicate.
 */
export class SeqCursor {
  #position: number;

  /** `position`: the last `seq` already delivered. `-Infinity` accepts every entry. */
  constructor(position: number) {
    this.#position = position;
  }

  get position(): number {
    return this.#position;
  }

  /** `true`, and moves on to it, if the entry comes after the position; `false` if it was delivered. */
  advance(entry: Sequenced): boolean {
    if (entry.seq <= this.#position) return false;
    this.#position = entry.seq;
    return true;
  }
}
