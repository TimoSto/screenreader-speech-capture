import { describe, expect, it } from 'vitest';
import { SeqCursor } from './seq-cursor.js';

describe('SeqCursor', () => {
  it('accepts entries after its position and moves on to them', () => {
    const cursor = new SeqCursor(10);
    expect(cursor.advance({ seq: 11 })).toBe(true);
    expect(cursor.advance({ seq: 15 })).toBe(true);
    expect(cursor.position).toBe(15);
  });

  it('rejects an entry at or before its position: it was already delivered', () => {
    const cursor = new SeqCursor(10);
    expect(cursor.advance({ seq: 10 })).toBe(false);
    expect(cursor.advance({ seq: 3 })).toBe(false);
    expect(cursor.position).toBe(10);
  });

  it('accepts anything from -Infinity', () => {
    expect(new SeqCursor(Number.NEGATIVE_INFINITY).advance({ seq: 0 })).toBe(true);
  });
});
