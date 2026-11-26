import { CONFIG_KEYS, type ConfigKey } from '../../../domain/client-config.js';
import type { ValueSource } from '../../../domain/config-value.js';
import type { BridgeStatus, InputAvailability } from '../../../domain/bridge-status.js';
import type { Session } from '../../../domain/session.js';
import type { SpeechEntry } from '../../../domain/speech-entry.js';

/** On stderr when a read or capture lost speech to the bridge's full buffer (`truncated`). */
export const TRUNCATED_WARNING =
  "some speech was dropped because the bridge's buffer was full " +
  '(raise buffer.maxEntries); showing what is left.';

/** The flag that sets each config key for one call. */
const FLAG: Record<ConfigKey, string> = { url: '--url', output: '--json' };

/** Where a config value comes from, as `config get` and `config list` show it. */
export function sourceLabel(key: ConfigKey, source: ValueSource): string {
  switch (source) {
    case 'explicit':
      return FLAG[key];
    case 'env':
      return CONFIG_KEYS[key].env;
    case 'config':
      return 'config file';
    case 'default':
      return 'default';
  }
}

export function formatEntry(entry: SpeechEntry): string {
  return entry.kind === 'marker'
    ? `#${entry.seq} [marker] ${entry.text}`
    : `#${entry.seq} ${entry.text}`;
}

export function formatSession(session: Session, current: boolean): string {
  const run = session.run === null ? '' : ` (run ${session.run})`;
  const state = current ? 'current' : 'ended';
  const count = `${session.entries} entr${session.entries === 1 ? 'y' : 'ies'}`;
  const range =
    session.firstSeq === null
      ? ''
      : `, seq ${session.firstSeq}-${session.lastSeq ?? session.firstSeq}`;
  return `#${session.id} ${session.name}${run}: ${state}, ${count}${range}`;
}

/** A session event in `tail`. */
export function formatSessionEvent(session: Session): string {
  return (
    `--- session #${session.id} ${JSON.stringify(session.name)} ` +
    `${session.endedAt === null ? 'started' : 'ended'} ---`
  );
}

/** What a timed-out `wait` saw, appended to its error message. */
export function seenText(entries: SpeechEntry[]): string {
  if (entries.length === 0) return ' No speech arrived.';
  return ` Speech seen:\n${entries.map((e) => `  ${formatEntry(e)}`).join('\n')}`;
}

const availability = ({ available, backend, reason }: InputAvailability): string =>
  available ? `on (${backend ?? '?'})` : `off (${reason ?? 'unknown'})`;

export function formatStatus(status: BridgeStatus): string {
  const { bridge, tcp, buffer, session, input } = status;
  const connections = tcp.connections.length;
  const range =
    buffer.firstSeq === null
      ? 'empty'
      : `seq ${buffer.firstSeq}-${buffer.lastSeq ?? buffer.firstSeq}`;
  return [
    `bridge  ${bridge.version} (API ${bridge.apiVersion}), ${bridge.state}`,
    `tcp     ${tcp.host}:${tcp.port} ${tcp.listening ? 'listening' : 'not listening'}, ` +
      `${connections} voice connection${connections === 1 ? '' : 's'}, ${tcp.encoding}`,
    `buffer  ${buffer.size} of ${buffer.maxEntries} entries (${range})`,
    `session ${session.current === null ? 'none current' : `#${session.current.id} ${session.current.name}`}, ` +
      `${session.count} in the buffer`,
    `input   keys/clicks ${availability(input.native)}, focus ${availability(input.focus)}`,
  ].join('\n');
}
