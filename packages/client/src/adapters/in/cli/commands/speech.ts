import { createTextTest } from '@screenreader-speech-capture/shared';
import {
  BridgeNotReadyError,
  SpeechTimeoutError,
  SpeechTruncatedError,
} from '../../../../domain/errors.js';
import type { SpeechEntry } from '../../../../domain/speech-entry.js';
import type { CliIo } from '../command.js';
import { EXIT, type Command, type HelpLine } from '../command.js';
import { reportError } from '../errors.js';
import {
  formatEntry,
  formatSession,
  formatSessionEvent,
  formatStatus,
  seenText,
  TRUNCATED_WARNING,
} from '../format.js';
import {
  NAME,
  UsageError,
  expectArgs,
  intArg,
  optionalInt,
  resolveSince,
  scope,
  sessionOption,
  sinceOption,
} from '../options.js';

// The commands that talk to the bridge. Each one's `help` is also its usage error.

const STATUS: HelpLine = {
  usage: 'status [--wait-ready] [--timeout <ms>]',
  description: [
    'Bridge health and versions; --wait-ready waits until it is ready',
    '(default timeout 120000)',
  ],
};

export const status: Command = {
  options: ['wait-ready', 'timeout'],
  help: [STATUS],
  async run(args, { values, speech, out, io, json }) {
    expectArgs(args, 0, STATUS.usage);
    const timeout = optionalInt(values, 'timeout', 0);
    if (!values['wait-ready'] && timeout !== undefined) {
      throw new UsageError('--timeout needs --wait-ready.');
    }
    if (!values['wait-ready']) {
      const result = await speech().status();
      out('status', result, formatStatus(result));
      return EXIT.ok;
    }
    try {
      const result = await speech().waitForReady({ timeout });
      out('status', { status: 'ready', ...result }, formatStatus(result));
      return EXIT.ok;
    } catch (error) {
      // Not ready in time is a result (exit 1), not an error object.
      if (!(error instanceof BridgeNotReadyError)) throw error;
      if (json) out('status', { status: 'not-ready', reason: error.message }, '');
      io.stderr(`${NAME}: ${error.message}\n`);
      return EXIT.timeout;
    }
  },
};

const SESSION_START: HelpLine = {
  usage: 'session start <name> [--run <label>]',
  description: ['Start a session (the previous one ends) and print its id'],
};
const SESSION_END: HelpLine = { usage: 'session end', description: ['End the current session'] };
const SESSION_DELETE: HelpLine = {
  usage: 'session delete <id>',
  description: ['Delete an ended session and its speech'],
};
const SESSION_LIST: HelpLine = {
  usage: 'session list',
  description: ['The sessions in the buffer, newest first'],
};

export const session: Command = {
  options: ['run'],
  help: [SESSION_START, SESSION_END, SESSION_DELETE, SESSION_LIST],
  async run(args, { values, speech, out, io }) {
    const [action, ...rest] = args;
    if (action !== 'start' && values.run !== undefined) {
      throw new UsageError('--run only goes with "session start".');
    }
    switch (action) {
      case 'start': {
        const [name] = expectArgs(rest, 1, SESSION_START.usage);
        if (name.trim() === '') throw new UsageError('The session name must not be empty.');
        if (values.run?.trim() === '') throw new UsageError('--run must not be empty.');
        const started = await speech().startSession(name, { run: values.run });
        const { replaced } = started;
        if (replaced) {
          io.stderr(
            `Warning: this ended session ${replaced.id} "${replaced.name}" of another client ` +
              `(${replaced.client ?? 'unknown'}).\n`,
          );
        }
        out('session start', started, String(started.id));
        return EXIT.ok;
      }
      case 'end':
        expectArgs(rest, 0, SESSION_END.usage);
        await speech().endSession();
        out('session end', { ended: true }, 'Session ended.');
        return EXIT.ok;
      case 'delete': {
        const [raw] = expectArgs(rest, 1, SESSION_DELETE.usage);
        const id = intArg(raw, 1, `The session id must be an integer >= 1, got "${raw}".`);
        await speech().deleteSession(id);
        out('session delete', { deleted: true }, `Session ${id} deleted.`);
        return EXIT.ok;
      }
      case 'list': {
        expectArgs(rest, 0, SESSION_LIST.usage);
        const list = await speech().sessions();
        out(
          'session list',
          list,
          list.sessions.length === 0
            ? 'No sessions.'
            : list.sessions.map((s) => formatSession(s, s.id === list.currentId)).join('\n'),
        );
        return EXIT.ok;
      }
      case undefined:
        throw new UsageError('Missing session action: start, end, delete or list.');
      default:
        throw new UsageError(`Unknown session action "${action}": use start, end, delete or list.`);
    }
  },
};

const CLEAR: HelpLine = {
  usage: 'clear (--all | --session <id> | --outside)',
  description: [
    'Delete recorded speech: --all the whole buffer, all sessions (for manual',
    "use); --session one session's speech (it keeps running); --outside the",
    'speech outside sessions',
  ],
};

export const clear: Command = {
  options: ['all', 'session', 'outside'],
  help: [CLEAR],
  async run(args, { values, speech, out }) {
    expectArgs(args, 0, CLEAR.usage);
    // No default scope: wiping every session of every client must be asked for (--all).
    const session = sessionOption(values);
    const scopes = [values.all, session !== undefined, values.outside].filter(Boolean);
    if (scopes.length === 0) {
      throw new UsageError(
        'clear needs a scope: --all (the whole buffer, all sessions), --session <id|current> ' +
          'or --outside. To start fresh, prefer "session start".',
      );
    }
    if (scopes.length > 1) throw new UsageError('Use only one of --all, --session or --outside.');
    if (values.outside) {
      await speech().clear({ session: 'none' });
      out('clear', { cleared: true }, 'Speech outside sessions cleared.');
    } else if (session !== undefined) {
      await speech().clear({ session });
      const which = session === 'current' ? 'the current session' : `session ${session}`;
      out('clear', { cleared: true }, `Speech of ${which} cleared.`);
    } else {
      await speech().clear();
      out('clear', { cleared: true }, 'Speech buffer cleared.');
    }
    return EXIT.ok;
  },
};

const SPEECH: HelpLine = {
  usage: 'speech [--since <seq>] [--limit <n>] [--include-markers] [--session <id> | --all]',
  description: ['Recorded speech entries, oldest first'],
};

export const speech: Command = {
  options: ['since', 'limit', 'include-markers', 'session', 'all'],
  help: [SPEECH],
  async run(args, { values, json, speech, out, io }) {
    expectArgs(args, 0, SPEECH.usage);
    const client = speech();
    // Options are checked before the bridge is asked for the current session.
    const since = sinceOption(values);
    const limit = optionalInt(values, 'limit', 1);
    const session = await scope(values, client);
    const options = {
      since: (await resolveSince(since, client, session)) ?? 0,
      limit,
      includeMarkers: values['include-markers'] ?? false,
      session,
    };
    const read = await readAll(io, () => client.getSpeech(options));
    if (json || read.entries.length > 0) {
      out('speech', read, read.entries.map(formatEntry).join('\n'));
    }
    if (read.entries.length === 0) io.stderr(`${NAME}: no speech.\n`);
    return EXIT.ok;
  },
};

const TEXT: HelpLine = {
  usage: 'text [--since <seq>] [--separator <s>] [--session <id> | --all]',
  description: ['All speech joined into one text (one line per entry)'],
};

export const text: Command = {
  options: ['since', 'separator', 'session', 'all'],
  help: [TEXT],
  async run(args, { values, json, speech, out, io }) {
    expectArgs(args, 0, TEXT.usage);
    const client = speech();
    const since = sinceOption(values);
    const session = await scope(values, client);
    const options = { since: (await resolveSince(since, client, session)) ?? 0, session };
    // `getText` is `getSpeech` joined; reading the entries keeps what is left on truncation.
    const { entries, truncated } = await readAll(io, () => client.getSpeech(options));
    const joined = entries.map((e) => e.text).join(values.separator ?? '\n');
    // Text mode prints nothing for no speech, rather than an empty line.
    if (json || entries.length > 0) out('text', { text: joined, truncated }, joined);
    if (entries.length === 0) io.stderr(`${NAME}: no speech.\n`);
    return EXIT.ok;
  },
};

const WAIT: HelpLine = {
  usage:
    'wait <text> [--regex] [--normalize] [--since <seq>] [--timeout <ms>] [--session <id> | --all]',
  description: [
    'Wait until speech contains <text> (or matches the regex);',
    'also finds speech that arrived before the call (default timeout 5000).',
    'It searches the whole session: pass --since <seq> or --since mark:<label>',
    '(from mark) to see only newer speech, or use press --capture',
  ],
};

export const wait: Command = {
  options: ['regex', 'normalize', 'since', 'timeout', 'session', 'all'],
  help: [WAIT],
  async run(args, { values, speech, out, io, json }) {
    const [needle] = expectArgs(args, 1, WAIT.usage);
    if (needle.trim() === '') throw new UsageError('The text to wait for must not be empty.');
    let match: string | RegExp = needle;
    if (values.regex) {
      try {
        match = new RegExp(needle, 'u');
      } catch (error) {
        throw new UsageError(`Invalid --regex: ${(error as Error).message}`);
      }
    }
    const client = speech();
    const since = sinceOption(values);
    const timeout = optionalInt(values, 'timeout', 0);
    const session = await scope(values, client);
    const options = {
      since: (await resolveSince(since, client, session)) ?? 0,
      timeout,
      normalize: values.normalize ?? false,
      session,
    };
    try {
      const entry = await client.waitForOutput(match, options);
      out('wait', { status: 'matched', entry }, formatEntry(entry));
      return EXIT.ok;
    } catch (error) {
      if (!(error instanceof SpeechTimeoutError)) throw error;
      printTimeout(io, json, error, (result) => out('wait', result, ''));
      // The wording depends on the screen reader and its verbosity: point at --normalize when it
      // is what made the difference.
      const normalized = values.normalize ? undefined : createTextTest(match, true);
      const near = normalized && error.entries.find((e) => normalized(e.text));
      if (near) io.stderr(`Hint: with --normalize it matches ${formatEntry(near)}.\n`);
      return EXIT.timeout;
    }
  },
};

const WAIT_SILENCE: HelpLine = {
  usage: 'wait-silence [--quiet-for <ms>] [--timeout <ms>]',
  description: ['Wait until nothing was spoken for --quiet-for ms (default 500, 10000)'],
};

export const waitSilence: Command = {
  options: ['quiet-for', 'timeout'],
  help: [WAIT_SILENCE],
  async run(args, { values, speech, out, io, json }) {
    expectArgs(args, 0, WAIT_SILENCE.usage);
    const quietFor = optionalInt(values, 'quiet-for', 1);
    const timeout = optionalInt(values, 'timeout', 0);
    try {
      await speech().waitForSilence({ quietFor, timeout });
    } catch (error) {
      if (!(error instanceof SpeechTimeoutError)) throw error;
      printTimeout(io, json, error, (result) => out('wait-silence', result, ''));
      return EXIT.timeout;
    }
    out('wait-silence', { status: 'silent' }, 'Silent.');
    return EXIT.ok;
  },
};

const MARK: HelpLine = {
  usage: 'mark <label>',
  description: [
    'Insert a marker and print its seq, for --since; --since mark:<label>',
    'reads from the newest marker with that label (no seq to keep)',
  ],
};

export const mark: Command = {
  options: [],
  help: [MARK],
  async run(args, { speech, out }) {
    const [label] = expectArgs(args, 1, MARK.usage);
    const entry = await speech().mark(label);
    out('mark', entry, String(entry.seq));
    return EXIT.ok;
  },
};

const TAIL: HelpLine = {
  usage: 'tail [--since <seq>]',
  description: [
    'Print speech live as it arrives, until Ctrl+C (one JSON event per',
    'line with --json); --since first prints the buffered entries after <seq>.',
    'For people watching; agents use wait, wait-silence or --capture',
  ],
};

export const tail: Command = {
  options: ['since'],
  help: [TAIL],
  async run(args, { values, speech, out, io, json }) {
    expectArgs(args, 0, TAIL.usage);
    const client = speech();
    // Unreachable or incompatible: exit 2 at once, like every other command. Later connection
    // problems are retried. `tail` follows every session, so a marker is looked for everywhere.
    const since = await resolveSince(sinceOption(values), client, undefined);
    await client.status();
    const signal = io.interrupt();
    return new Promise<number>((resolve) => {
      const finish = (code: number) => {
        signal.removeEventListener('abort', interrupted);
        stop();
        resolve(code);
      };
      const interrupted = () => finish(EXIT.ok);
      const stop = client.onSpeech(
        (entry) => out('tail', { type: 'entry', entry }, formatEntry(entry)),
        {
          since,
          includeMarkers: true,
          onSession: (s) => out('tail', { type: 'session', session: s }, formatSessionEvent(s)),
          onClear: () => out('tail', { type: 'clear' }, '--- buffer cleared ---'),
          onTruncated: () => {
            if (json) out('tail', { type: 'truncated' }, '');
            io.stderr(
              `${NAME}: some entries were dropped from the bridge's buffer before they could be shown.\n`,
            );
          },
          onError: (error, { retrying }) => {
            // The feed stopped for good: the error ends the output, as for any other command.
            if (retrying) io.stderr(`${NAME}: ${error.message}, reconnecting\n`);
            else finish(reportError(error, io, json));
          },
        },
      );
      if (signal.aborted) finish(EXIT.ok);
      else signal.addEventListener('abort', interrupted, { once: true });
    });
  },
};

/**
 * A read that shows what is left when some of the speech was dropped from the bridge's full
 * buffer, with a warning on stderr: a person or agent reading the CLI wants the rest, and
 * `truncated` in the --json output says it is incomplete.
 */
async function readAll(
  io: CliIo,
  read: () => Promise<SpeechEntry[]>,
): Promise<{ entries: SpeechEntry[]; truncated: boolean }> {
  try {
    return { entries: await read(), truncated: false };
  } catch (error) {
    if (!(error instanceof SpeechTruncatedError)) throw error;
    io.stderr(`${NAME}: ${TRUNCATED_WARNING}\n`);
    return { entries: error.entries, truncated: true };
  }
}

/**
 * A wait that timed out: a result with `status: 'timeout'` and the speech seen (exit 1), only
 * with --json; the message and that speech always go to stderr.
 */
function printTimeout(
  io: CliIo,
  json: boolean,
  error: SpeechTimeoutError,
  print: (result: { status: 'timeout'; entries: SpeechEntry[]; truncated: boolean }) => void,
): void {
  if (json) print({ status: 'timeout', entries: error.entries, truncated: error.truncated });
  io.stderr(`${NAME}: ${error.message}.${seenText(error.entries)}\n`);
}
