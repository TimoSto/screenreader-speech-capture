/** Items whose `seq` rises with every one added. */
export interface Sequenced {
  readonly seq: number;
}

/** Once this many dropped items sit at the front, and they are at least half the array, compact. */
const COMPACT_AFTER = 1024;

/**
 * A FIFO of items in rising `seq` order: adding at the end and dropping the oldest are O(1)
 * (amortized), finding the items after a `seq` is O(log n).
 */
export class SeqQueue<T extends Sequenced> {
  #items: T[] = [];
  /** Index of the oldest item still in the queue. The ones before it were dropped. */
  #head = 0;

  get size(): number {
    return this.#items.length - this.#head;
  }

  first(): T | undefined {
    return this.size === 0 ? undefined : this.#items[this.#head];
  }

  last(): T | undefined {
    return this.size === 0 ? undefined : this.#items.at(-1);
  }

  /** Adds an item. Its `seq` must be higher than the last one's. */
  push(item: T): void {
    this.#items.push(item);
  }

  /** Drops and returns the oldest item. */
  shift(): T | undefined {
    if (this.size === 0) return undefined;
    const item = this.#items[this.#head++];
    if (this.size === 0) this.clear();
    else if (this.#head >= COMPACT_AFTER && this.#head * 2 >= this.#items.length) {
      this.#items = this.#items.slice(this.#head);
      this.#head = 0;
    }
    return item;
  }

  /**
   * The items with `seq > since`, oldest first, at most `limit` (all without it), and whether
   * more follow.
   */
  after(since: number, limit?: number): { items: T[]; hasMore: boolean } {
    const items = this.#items;
    let low = this.#head;
    let high = items.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (items[middle]!.seq > since) high = middle;
      else low = middle + 1;
    }
    const available = items.length - low;
    if (limit === undefined || available <= limit) {
      return { items: items.slice(low), hasMore: false };
    }
    return { items: items.slice(low, low + limit), hasMore: true };
  }

  clear(): void {
    this.#items = [];
    this.#head = 0;
  }
}
