import { describe, expect, it } from 'vitest';
import { SpeechLog, type SpeechDraft } from './speech-log.js';

const at = (ms: number) => new Date(ms);

const draft = (text: string): SpeechDraft => ({
  kind: 'speech',
  text,
  receivedAt: at(0),
  source: 'tcp',
  voice: null,
  connectionId: 1,
});

function fill(log: SpeechLog, count: number) {
  for (let i = 1; i <= count; i++) log.append(draft(`t${i}`));
}

const texts = (log: SpeechLog, since: number, limit = 100, sessionId?: number | null) =>
  log.page(since, limit, sessionId).entries.map((e) => e.text);

const start = (log: SpeechLog, name: string, ms = 0) =>
  log.startSession({ name, run: null, client: null, startedAt: at(ms) }).started;

const names = (log: SpeechLog) => log.sessions().map((s) => s.name);

describe('SpeechLog', () => {
  describe('entries', () => {
    it('assigns increasing seq and pages the entries after since', () => {
      const log = new SpeechLog(10);
      fill(log, 3);
      expect(log.page(0, 100).entries.map((e) => e.seq)).toEqual([1, 2, 3]);
      expect(texts(log, 1)).toEqual(['t2', 't3']);
      expect(texts(log, 0, 2)).toEqual(['t1', 't2']);
      expect(texts(log, 3)).toEqual([]);
    });

    it('starts seq at firstSeq', () => {
      const log = new SpeechLog(10, 1_000);
      expect(log.append(draft('a')).seq).toBe(1_000);
      expect(log.page(999).entries.map((e) => e.text)).toEqual(['a']);
    });

    it('reports hasMore while entries after the page remain', () => {
      const log = new SpeechLog(10);
      fill(log, 3);
      expect(log.page(0, 2).hasMore).toBe(true);
      expect(log.page(2, 2).hasMore).toBe(false);
      expect(log.page(0, 3).hasMore).toBe(false);
      expect(log.page(3, 2).hasMore).toBe(false);
    });

    it('drops the oldest entries when full and reports truncated', () => {
      const log = new SpeechLog(3);
      fill(log, 5);
      expect(texts(log, 0)).toEqual(['t3', 't4', 't5']);
      expect(log.page(0, 100).truncated).toBe(true);
      expect(log.page(1, 100).truncated).toBe(true);
      expect(log.page(2, 100).truncated).toBe(false);
      expect(log.stats()).toEqual({ size: 3, maxEntries: 3, firstSeq: 3, lastSeq: 5 });
    });

    it('stays correct over many overflows', () => {
      const log = new SpeechLog(4);
      fill(log, 10_000);
      expect(texts(log, 0)).toEqual(['t9997', 't9998', 't9999', 't10000']);
      expect(texts(log, 9998)).toEqual(['t9999', 't10000']);
    });

    it('drops the oldest entries at once when maxEntries shrinks, and keeps more when it grows', () => {
      const log = new SpeechLog(5);
      fill(log, 5);
      log.resize(2);
      expect(log.stats()).toEqual({ size: 2, maxEntries: 2, firstSeq: 4, lastSeq: 5 });
      expect(log.page(0).truncated).toBe(true);
      log.resize(4);
      fill(log, 2);
      expect(log.stats()).toMatchObject({ size: 4, firstSeq: 4, lastSeq: 7 });
    });

    it('keeps counting seq after clear, and clear is not truncation', () => {
      const log = new SpeechLog(2);
      fill(log, 3);
      log.clear();
      expect(log.stats()).toEqual({ size: 0, maxEntries: 2, firstSeq: null, lastSeq: null });
      const next = log.append(draft('after'));
      expect(next.seq).toBe(4);
      expect(log.page(0, 100)).toEqual({ entries: [next], truncated: false, hasMore: false });
    });

    it('stays fast with a full buffer of a million entries', () => {
      const log = new SpeechLog(1_000_000);
      const s = start(log, 'big');
      fill(log, 1_100_000);
      const began = performance.now();
      for (let i = 0; i < 1000; i++) {
        log.append(draft('more'));
        log.stats();
        log.sessions();
        log.page(log.stats().lastSeq! - 10, 100, s.id);
      }
      expect(performance.now() - began).toBeLessThan(500);
      expect(log.stats().size).toBe(1_000_000);
    });
  });

  describe('sessions', () => {
    it('gives increasing ids, makes the new session current and ends the previous one', () => {
      const log = new SpeechLog(10);
      expect(log.currentSession()).toBeNull();
      const a = start(log, 'a', 1);
      expect(a).toEqual({
        id: 1,
        name: 'a',
        run: null,
        client: null,
        startedAt: at(1),
        endedAt: null,
        startSeq: 0,
        firstSeq: null,
        lastSeq: null,
        entries: 0,
      });
      log.append(draft('a1'));
      const { ended, started } = log.startSession({
        name: 'b',
        run: 'r',
        client: null,
        startedAt: at(2),
      });
      expect(ended).toMatchObject({ id: 1, endedAt: at(2), firstSeq: 1, lastSeq: 1, entries: 1 });
      expect(started).toMatchObject({ id: 2, run: 'r', endedAt: null, startSeq: 1 });
      expect(log.page(started.startSeq, 100, started.id).entries).toEqual([]);
      expect(log.currentSession()?.id).toBe(2);
      expect(log.sessions().map((s) => s.id)).toEqual([2, 1]);
    });

    it('ends the current session once', () => {
      const log = new SpeechLog(10);
      start(log, 'a', 1);
      expect(log.endSession(at(2))).toMatchObject({ id: 1, endedAt: at(2), entries: 0 });
      expect(log.currentSession()).toBeNull();
      expect(log.endSession(at(3))).toBeNull();
    });

    it('records entries in the current session and pages one session', () => {
      const log = new SpeechLog(10);
      log.append(draft('before'));
      const a = start(log, 'a');
      log.append(draft('a1'));
      log.append(draft('a2'));
      log.endSession(at(1));
      log.append(draft('between'));
      const b = start(log, 'b');
      log.append(draft('b1'));
      expect(log.sessions()).toMatchObject([
        { id: b.id, firstSeq: 5, lastSeq: 5, entries: 1 },
        { id: a.id, firstSeq: 2, lastSeq: 3, entries: 2 },
      ]);
      expect(texts(log, 0, 100, a.id)).toEqual(['a1', 'a2']);
      expect(texts(log, 2, 100, a.id)).toEqual(['a2']);
      expect(log.page(0, 1, a.id).hasMore).toBe(true);
      expect(texts(log, 0, 100, null)).toEqual(['before', 'between']);
    });

    it('reports truncated only for the session that lost entries', () => {
      const log = new SpeechLog(3);
      const a = start(log, 'a');
      log.append(draft('a1'));
      log.append(draft('a2'));
      const b = start(log, 'b').id;
      log.append(draft('b1'));
      log.append(draft('b2'));
      expect(log.sessions().find((s) => s.id === a.id)).toMatchObject({
        firstSeq: 2,
        lastSeq: 2,
        entries: 1,
      });
      expect(log.page(0, 100, a.id)).toMatchObject({ truncated: true });
      expect(log.page(1, 100, a.id)).toMatchObject({ truncated: false });
      expect(log.page(0, 100, b)).toMatchObject({ truncated: false });

      log.append(draft('b3'));
      expect(log.page(0, 100, a.id)).toEqual({ entries: [], truncated: true, hasMore: false });
    });

    it('pages the entries outside sessions, truncated only when one of them was dropped', () => {
      const log = new SpeechLog(3);
      start(log, 'a');
      log.append(draft('a1'));
      log.endSession(at(1));
      log.append(draft('o1'));
      start(log, 'b');
      log.append(draft('b1'));
      log.endSession(at(2));
      log.append(draft('o2'));
      // a1 was dropped: not an outside entry.
      expect(log.page(0, 100, null)).toEqual({
        entries: [expect.objectContaining({ text: 'o1' }), expect.objectContaining({ text: 'o2' })],
        truncated: false,
        hasMore: false,
      });

      start(log, 'c');
      log.append(draft('c1'));
      expect(log.page(0, 100, null)).toMatchObject({ truncated: true });
      expect(log.page(2, 100, null)).toMatchObject({ truncated: false });

      log.clear();
      expect(log.page(0, 100, null)).toEqual({ entries: [], truncated: false, hasMore: false });
    });

    it('forgets an ended session once its last entry is dropped, keeps the current one', () => {
      const log = new SpeechLog(2);
      start(log, 'a');
      log.append(draft('a1'));
      start(log, 'b');
      log.append(draft('b1'));
      expect(names(log)).toEqual(['b', 'a']);
      log.append(draft('b2')); // pushes a1 out
      expect(names(log)).toEqual(['b']);
      log.append(draft('b3'));
      log.append(draft('b4'));
      expect(names(log)).toEqual(['b']);
    });

    it('forgets a session ended without entries, but its id stays taken', () => {
      const log = new SpeechLog(10);
      start(log, 'empty');
      expect(log.endSession(at(1))).toMatchObject({ name: 'empty', entries: 0 });
      expect(log.sessions()).toEqual([]);
      expect(start(log, 'next').id).toBe(2);
      expect(log.resolveFilter(1)).toBe(1);
      expect(log.page(0, 100, 1)).toEqual({ entries: [], truncated: false, hasMore: false });
    });

    it('clear forgets the ended sessions and keeps the current one', () => {
      const log = new SpeechLog(10);
      start(log, 'a');
      log.append(draft('a1'));
      start(log, 'b');
      log.append(draft('b1'));
      log.clear();
      expect(log.sessions()).toMatchObject([{ name: 'b', entries: 0, firstSeq: null }]);
      expect(log.page(0, 100, 1).truncated).toBe(false);
    });
  });

  describe('resolveFilter', () => {
    it('is undefined without a filter', () => {
      expect(new SpeechLog(1).resolveFilter(undefined)).toBeUndefined();
    });

    it('resolves current to the current id, NOT_FOUND when none is current', () => {
      const log = new SpeechLog(1);
      expect(() => log.resolveFilter('current')).toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' }) as Error,
      );
      start(log, 'a');
      expect(log.resolveFilter('current')).toBe(1);
    });

    it('resolves none to null', () => {
      const log = new SpeechLog(1);
      expect(log.resolveFilter('none')).toBeNull();
      start(log, 'a');
      expect(log.resolveFilter('none')).toBeNull();
    });

    it('accepts any id given out so far, NOT_FOUND for later ones', () => {
      const log = new SpeechLog(1);
      start(log, 'a');
      start(log, 'b');
      log.endSession(at(1));
      expect(log.resolveFilter(1)).toBe(1);
      expect(log.resolveFilter(2)).toBe(2);
      expect(() => log.resolveFilter(3)).toThrow(
        expect.objectContaining({ code: 'NOT_FOUND', details: { session: 3 } }) as Error,
      );
    });

    it.each([0, -1, 1.5])('is INVALID_REQUEST for %d', (id) => {
      expect(() => new SpeechLog(1).resolveFilter(id)).toThrow(
        expect.objectContaining({
          code: 'INVALID_REQUEST',
          details: { field: 'session' },
        }) as Error,
      );
    });
  });
});
