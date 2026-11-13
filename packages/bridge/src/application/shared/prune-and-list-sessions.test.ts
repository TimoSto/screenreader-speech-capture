import { describe, expect, it, vi } from 'vitest';
import { MemorySessionRepository } from '../../adapters/out/memory/memory-session-repository.js';
import { MemorySpeechRepository } from '../../adapters/out/memory/memory-speech-repository.js';
import { pruneAndListSessions } from './prune-and-list-sessions.js';

const at = (minute: number) => new Date(Date.UTC(2026, 10, 12, 9, minute));

/** Two sessions in a buffer of two entries: `a` (ended) and `b` (current), one entry each. */
function setup() {
  const sessions = new MemorySessionRepository();
  const repository = new MemorySpeechRepository(2);
  const say = (text: string, sessionId: number) =>
    repository.add({
      kind: 'speech',
      text,
      receivedAt: at(0),
      source: 'tcp',
      voice: null,
      connectionId: 1,
      sessionId,
    });
  const a = sessions.create({ name: 'a', run: null, startedAt: at(0) });
  say('a1', a.id);
  sessions.endCurrent(at(1));
  const b = sessions.create({ name: 'b', run: null, startedAt: at(1) });
  say('b1', b.id);
  return { sessions, repository, say, a, b };
}

describe('pruneAndListSessions', () => {
  it('lists the sessions newest first with what the buffer holds of them', () => {
    const { sessions, repository } = setup();
    expect(
      pruneAndListSessions(sessions, repository).map(({ name, entries }) => ({ name, entries })),
    ).toEqual([
      { name: 'b', entries: 1 },
      { name: 'a', entries: 1 },
    ]);
  });

  it('removes an ended session from both repositories once its entries were dropped', () => {
    const { sessions, repository, say, a, b } = setup();
    say('b2', b.id); // pushes a1 out of the buffer
    const forget = vi.spyOn(repository, 'forgetSession');

    expect(pruneAndListSessions(sessions, repository).map((s) => s.id)).toEqual([b.id]);
    expect(sessions.get(a.id)).toBeUndefined();
    expect(forget).toHaveBeenCalledExactlyOnceWith(a.id);
  });

  it('keeps the current session even when the buffer holds none of its entries', () => {
    const { sessions, repository } = setup();
    repository.clear();
    expect(pruneAndListSessions(sessions, repository).map((s) => s.name)).toEqual(['b']);
  });
});
