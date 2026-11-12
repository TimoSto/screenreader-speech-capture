import { describe, expect, it } from 'vitest';
import { MemorySessionRepository } from './memory-session-repository.js';

const at = (ms: number) => new Date(ms);

describe('MemorySessionRepository', () => {
  it('gives increasing ids, makes the new session current and lists newest first', () => {
    const repo = new MemorySessionRepository();
    expect(repo.current()).toBeNull();
    expect(repo.lastId()).toBe(0);
    const first = repo.create({ name: 'a', run: null, startedAt: at(1) });
    expect(first).toEqual({ id: 1, name: 'a', run: null, startedAt: at(1), endedAt: null });
    repo.endCurrent(at(2));
    const second = repo.create({ name: 'b', run: 'r', startedAt: at(3) });
    expect(second.id).toBe(2);
    expect(repo.current()).toEqual(second);
    expect(repo.lastId()).toBe(2);
    expect(repo.list().map((s) => s.id)).toEqual([2, 1]);
    expect(repo.get(1)?.endedAt).toEqual(at(2));
  });

  it('ends the current session once', () => {
    const repo = new MemorySessionRepository();
    repo.create({ name: 'a', run: null, startedAt: at(1) });
    expect(repo.endCurrent(at(2))).toMatchObject({ id: 1, endedAt: at(2) });
    expect(repo.current()).toBeNull();
    expect(repo.endCurrent(at(3))).toBeNull();
  });

  it('removes ended sessions that are not kept, never the current one', () => {
    const repo = new MemorySessionRepository();
    for (const name of ['a', 'b', 'c']) {
      repo.endCurrent(at(0));
      repo.create({ name, run: null, startedAt: at(0) });
    }
    const removed = repo.removeEnded((session) => session.id === 2);
    expect(removed.map((s) => s.id)).toEqual([1]);
    expect(repo.list().map((s) => s.id)).toEqual([3, 2]);
    repo.removeEnded(() => false);
    expect(repo.list().map((s) => s.id)).toEqual([3]);
    expect(repo.lastId()).toBe(3);
  });
});
