import { describe, expect, it } from 'vitest';
import type { NewSpeechEntry } from '../../../domain/speech-entry.js';
import { MemorySpeechRepository } from './memory-speech-repository.js';

const draft = (text: string): NewSpeechEntry => ({
  kind: 'speech',
  text,
  receivedAt: new Date(0),
  source: 'tcp',
  voice: null,
  connectionId: 1,
});

function fill(repo: MemorySpeechRepository, count: number) {
  for (let i = 1; i <= count; i++) repo.add(draft(`t${i}`));
}

const texts = (repo: MemorySpeechRepository, since: number, limit = 100) =>
  repo.list(since, limit).entries.map((e) => e.text);

describe('MemorySpeechRepository', () => {
  it('assigns increasing seq and lists entries after since', () => {
    const repo = new MemorySpeechRepository(10);
    fill(repo, 3);
    expect(repo.list(0, 100).entries.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(texts(repo, 1)).toEqual(['t2', 't3']);
    expect(texts(repo, 0, 2)).toEqual(['t1', 't2']);
    expect(texts(repo, 3)).toEqual([]);
  });

  it('drops the oldest entries when full and reports truncated', () => {
    const repo = new MemorySpeechRepository(3);
    fill(repo, 5);
    expect(texts(repo, 0)).toEqual(['t3', 't4', 't5']);
    expect(repo.list(0, 100).truncated).toBe(true);
    expect(repo.list(1, 100).truncated).toBe(true);
    expect(repo.list(2, 100).truncated).toBe(false);
    expect(repo.stats()).toEqual({ size: 3, maxEntries: 3, firstSeq: 3, lastSeq: 5 });
  });

  it('stays correct over many overflows', () => {
    const repo = new MemorySpeechRepository(4);
    fill(repo, 1000);
    expect(texts(repo, 0)).toEqual(['t997', 't998', 't999', 't1000']);
    expect(texts(repo, 998)).toEqual(['t999', 't1000']);
  });

  it('keeps counting seq after clear, and clear is not truncation', () => {
    const repo = new MemorySpeechRepository(2);
    fill(repo, 3);
    repo.clear();
    expect(repo.stats()).toEqual({ size: 0, maxEntries: 2, firstSeq: null, lastSeq: null });
    const next = repo.add(draft('after'));
    expect(next.seq).toBe(4);
    expect(repo.list(0, 100)).toEqual({ entries: [next], truncated: false });
  });

  it('drops entries when resized smaller', () => {
    const repo = new MemorySpeechRepository(5);
    fill(repo, 5);
    repo.resize(2);
    expect(texts(repo, 0)).toEqual(['t4', 't5']);
    expect(repo.list(3, 100).truncated).toBe(false);
    expect(repo.list(2, 100).truncated).toBe(true);
  });
});
