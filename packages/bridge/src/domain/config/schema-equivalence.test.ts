import { checkDto, ConfigPatchSchema } from '@screenreader-speech-capture/shared';
import { describe, expect, it } from 'vitest';
import { validatePatch } from './merge.js';

// The shared schema is the contract (it feeds the OpenAPI file and the client), the bridge's
// checks enforce it: both must accept and reject the same bodies.
const cases: [string, unknown][] = [
  ['empty', {}],
  ['port', { tcp: { port: 4450 } }],
  ['port too high', { tcp: { port: 70000 } }],
  ['port as string', { tcp: { port: '1' } }],
  ['host', { tcp: { host: '0.0.0.0' } }],
  ['empty host', { tcp: { host: '' } }],
  ['blank host', { http: { host: '  ' } }],
  ['empty log file', { log: { file: '' } }],
  ['blank log file', { log: { file: ' ' } }],
  ['null log file', { log: { file: null } }],
  ['log file', { log: { file: 'a.log' } }],
  ['encoding', { tcp: { encoding: 'windows-1252' } }],
  ['unknown encoding', { tcp: { encoding: 'klingon' } }],
  ['utf-16', { tcp: { encoding: 'utf-16le' } }],
  ['line bytes too small', { tcp: { maxLineBytes: 10 } }],
  ['allowed hosts', { http: { allowedHosts: ['*', 'vm-1'] } }],
  ['allowed hosts with port', { http: { allowedHosts: ['vm:80'] } }],
  ['playwright version', { playwright: { version: '1.56.1' } }],
  ['playwright range', { playwright: { version: '^1.56.1' } }],
  ['playwright null version', { playwright: { version: null } }],
  ['mcp version', { mcp: { version: '1.0.0' } }],
  ['log level', { log: { level: 'debug' } }],
  ['bad log level', { log: { level: 'trace' } }],
  ['buffer', { buffer: { maxEntries: 0 } }],
  ['unknown section', { nope: {} }],
  ['unknown key', { tcp: { nope: 1 } }],
  ['prototype key', JSON.parse('{"tcp":{"valueOf":1}}') as unknown],
];

describe('shared config schema and bridge checks agree', () => {
  it.each(cases)('%s', (_name, body) => {
    const shared = checkDto(ConfigPatchSchema, body).ok;
    let bridge = true;
    try {
      validatePatch(body);
    } catch {
      bridge = false;
    }
    expect(bridge).toBe(shared);
  });
});
