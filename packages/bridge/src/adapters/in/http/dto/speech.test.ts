import { describe, expect, it } from 'vitest';
import { AT_ISO, entry } from '../../../../../test/dto-fixtures.js';
import { toSpeechEntryDto, toSpeechListDto, toWaitResultDto } from './speech.js';

const entryDto = {
  seq: 4,
  kind: 'speech',
  text: 'OK button',
  receivedAt: AT_ISO,
  source: 'tcp',
  voice: 'eloquence',
  connectionId: 2,
  sessionId: 1,
};

describe('speech DTOs', () => {
  it('maps an entry, with the date as ISO 8601', () => {
    expect(toSpeechEntryDto(entry)).toEqual(entryDto);
  });

  it('maps a page with its flags', () => {
    const page = { entries: [entry], truncated: true, hasMore: false };
    expect(toSpeechListDto(page)).toEqual({
      entries: [entryDto],
      truncated: true,
      hasMore: false,
    });
  });

  it('maps a matched wait to its entry and a timeout to what was seen', () => {
    expect(toWaitResultDto({ status: 'matched', entry })).toEqual({
      matched: true,
      entry: entryDto,
    });
    expect(toWaitResultDto({ status: 'timeout', seen: [entry] })).toEqual({
      matched: false,
      entries: [entryDto],
    });
  });
});
