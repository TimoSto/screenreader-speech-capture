import { URL_ENV, type ValueSource } from '../../../domain/bridge-url.js';
import type { BridgeStatus, Session, SpeechEntry } from '../../../domain/speech-entry.js';

export const SOURCE_LABEL: Record<ValueSource, string> = {
  explicit: '--url',
  env: URL_ENV,
  config: 'config file',
  default: 'default',
};

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

export function formatStatus(status: BridgeStatus): string {
  const { bridge, tcp, buffer, input, session } = status;
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
    `input   ${input.enabled ? 'enabled' : 'disabled'}`,
    ...(session === undefined
      ? []
      : [
          `session ${session.current === null ? 'none current' : `#${session.current.id} ${session.current.name}`}, ` +
            `${session.count} in the buffer`,
        ]),
  ].join('\n');
}
