import { checkDto } from '@screenreader-speech-capture/shared';
import type { InferOutput } from 'valibot';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { commandOf } from '../../../../test/cli-output.js';
import type { ConfigValue } from '../../../application/ports/in/manage-client-config.js';
import type { BridgeStatus } from '../../../domain/bridge-status.js';
import type { Session, SessionList, StartedSession } from '../../../domain/session.js';
import type { SpeechEntry } from '../../../domain/speech-entry.js';
import { CLI_OUTPUT } from './output.js';
import type {
  BridgeStatusOutput,
  ConfigValueOutput,
  SessionListOutput,
  SessionOutput,
  SpeechEntryOutput,
  StartedSessionOutput,
} from './output.js';

describe('CLI output schemas', () => {
  it('describe exactly the types the commands print', () => {
    // Both directions: a field added to the domain type, or to the schema, fails to compile.
    expectTypeOf<InferOutput<typeof SpeechEntryOutput>>().toEqualTypeOf<SpeechEntry>();
    expectTypeOf<InferOutput<typeof SessionOutput>>().toEqualTypeOf<Session>();
    expectTypeOf<InferOutput<typeof StartedSessionOutput>>().toEqualTypeOf<StartedSession>();
    expectTypeOf<InferOutput<typeof SessionListOutput>>().toEqualTypeOf<SessionList>();
    expectTypeOf<InferOutput<typeof BridgeStatusOutput>>().toEqualTypeOf<BridgeStatus>();
    expectTypeOf<InferOutput<typeof ConfigValueOutput>>().toEqualTypeOf<ConfigValue>();
  });

  it('reject a shape that differs, for example a wait timeout without truncated', () => {
    expect(checkDto(CLI_OUTPUT.wait, { matched: false, entries: [] })).toMatchObject({
      ok: false,
      field: 'truncated',
    });
    expect(
      checkDto(CLI_OUTPUT.wait, { matched: false, entries: [], truncated: false }),
    ).toMatchObject({ ok: true });
  });

  it('are found by the command line the tests run', () => {
    expect(commandOf(['wait', 'Submit', '--json'])).toBe('wait');
    expect(commandOf(['--url', 'http://vm:1', 'session', 'start', 'x', '--json'])).toBe(
      'session start',
    );
    expect(commandOf(['config', 'path', '--json'])).toBe('config path');
    expect(commandOf(['wait-silence', '--json'])).toBe('wait-silence');
    expect(commandOf(['--help'])).toBeUndefined();
  });
});
