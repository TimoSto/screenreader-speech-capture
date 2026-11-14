import { describe, expect, it } from 'vitest';
import { AT, AT_ISO, session } from '../../../../../test/dto-fixtures.js';
import { toSessionDto, toSessionListDto } from './session.js';

describe('session DTOs', () => {
  it('maps a current session with endedAt null', () => {
    expect(toSessionDto(session())).toEqual({
      id: 1,
      name: 'checkout',
      run: 'nightly',
      client: null,
      startedAt: AT_ISO,
      endedAt: null,
      startSeq: 2,
      firstSeq: 3,
      lastSeq: 4,
      entries: 2,
    });
  });

  it('maps an ended session with endedAt as ISO 8601', () => {
    expect(toSessionDto(session(AT)).endedAt).toBe(AT_ISO);
  });

  it('maps the list with the current id', () => {
    expect(toSessionListDto({ sessions: [session()], currentId: 1 })).toEqual({
      sessions: [toSessionDto(session())],
      currentId: 1,
    });
  });
});
