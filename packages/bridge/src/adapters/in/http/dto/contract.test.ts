// Every answer the bridge builds matches the API contract (the valibot schemas in
// packages/shared), which the client checks every answer against.
import {
  checkDto,
  ConfigResponseSchema,
  type DtoSchema,
  SessionListSchema,
  SessionSchema,
  SpeechEntrySchema,
  SpeechListSchema,
  StartSessionResponseSchema,
  StatusSchema,
  WaitResultSchema,
} from '@screenreader-speech-capture/shared';
import { describe, expect, it } from 'vitest';
import { entry, session, status } from '../../../../../test/dto-fixtures.js';
import { DEFAULT_CONFIG } from '../../../../domain/config/index.js';
import { toConfigResponseDto } from './config.js';
import { toSessionDto, toSessionListDto, toStartSessionResponseDto } from './session.js';
import { toSpeechEntryDto, toSpeechListDto, toWaitResultDto } from './speech.js';
import { toStatusDto } from './status.js';

const cases: [string, DtoSchema, unknown][] = [
  ['speech entry', SpeechEntrySchema, toSpeechEntryDto(entry)],
  [
    'marker',
    SpeechEntrySchema,
    toSpeechEntryDto({ ...entry, kind: 'marker', source: 'api', voice: null, connectionId: null }),
  ],
  [
    'speech list',
    SpeechListSchema,
    toSpeechListDto({ entries: [entry], truncated: true, hasMore: false }),
  ],
  ['wait match', WaitResultSchema, toWaitResultDto({ status: 'matched', entry })],
  [
    'wait timeout',
    WaitResultSchema,
    toWaitResultDto({ status: 'timeout', seen: [entry], omitted: 2 }),
  ],
  ['ended session', SessionSchema, toSessionDto(session(new Date('2026-11-12T10:00:00Z')))],
  [
    'started session',
    StartSessionResponseSchema,
    toStartSessionResponseDto({ session: session(), replaced: session(new Date()) }),
  ],
  ['session list', SessionListSchema, toSessionListDto({ sessions: [session()], currentId: 1 })],
  ['status', StatusSchema, toStatusDto(status(session()))],
  ['status without a session', StatusSchema, toStatusDto(status(null))],
  [
    'config',
    ConfigResponseSchema,
    toConfigResponseDto({ config: DEFAULT_CONFIG, restartRequired: ['tcp.port'] }),
  ],
];

describe('HTTP answers match the API contract', () => {
  it.each(cases)('%s', (_, schema, dto) => {
    expect(checkDto(schema, dto)).toMatchObject({ ok: true });
  });
});
