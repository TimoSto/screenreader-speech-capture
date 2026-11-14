import { describe, expect, it } from 'vitest';
import { SeqQueue } from './seq-queue.js';

const queueOf = (...seqs: number[]) => {
  const queue = new SeqQueue<{ seq: number }>();
  for (const seq of seqs) queue.push({ seq });
  return queue;
};
const seqs = (items: { seq: number }[]) => items.map((item) => item.seq);

describe('SeqQueue', () => {
  it('finds the items after a seq, with gaps between the seqs', () => {
    const queue = queueOf(2, 5, 9, 10);
    expect(seqs(queue.after(0).items)).toEqual([2, 5, 9, 10]);
    expect(seqs(queue.after(5).items)).toEqual([9, 10]);
    expect(seqs(queue.after(6).items)).toEqual([9, 10]);
    expect(seqs(queue.after(10).items)).toEqual([]);
  });

  it('limits a page and says whether more follow', () => {
    const queue = queueOf(1, 2, 3);
    expect(queue.after(0, 2)).toEqual({ items: [{ seq: 1 }, { seq: 2 }], hasMore: true });
    expect(queue.after(0, 3).hasMore).toBe(false);
    expect(queue.after(1, 2).hasMore).toBe(false);
  });

  it('drops the oldest first and stays correct across compactions', () => {
    const queue = queueOf();
    for (let seq = 1; seq <= 5000; seq++) {
      queue.push({ seq });
      if (queue.size > 3) queue.shift();
    }
    expect(queue.size).toBe(3);
    expect(queue.first()?.seq).toBe(4998);
    expect(queue.last()?.seq).toBe(5000);
    expect(seqs(queue.after(0).items)).toEqual([4998, 4999, 5000]);
    expect(seqs(queue.after(4998).items)).toEqual([4999, 5000]);
  });

  it('is empty after its last item is dropped or after clear', () => {
    const queue = queueOf(1);
    expect(queue.shift()).toEqual({ seq: 1 });
    expect(queue.shift()).toBeUndefined();
    expect([queue.size, queue.first(), queue.last()]).toEqual([0, undefined, undefined]);
    queue.push({ seq: 2 });
    queue.clear();
    expect(queue.after(0).items).toEqual([]);
  });
});
