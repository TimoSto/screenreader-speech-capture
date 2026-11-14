import { SpeechTimeoutError } from '../../../../domain/errors.js';
import { EXIT, type Command, type HelpLine } from '../command.js';
import {
  formatEntry,
  formatSession,
  formatSessionEvent,
  formatStatus,
  seenText,
} from '../format.js';
import { NAME, UsageError, expectArgs, optionalInt, scope } from '../options.js';

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
  async run(args, { values, speech, out }) {
    expectArgs(args, 0, STATUS.usage);
    const timeout = optionalInt(values, 'timeout', 0);
    if (!values['wait-ready'] && timeout !== undefined) {
      throw new UsageError('--timeout needs --wait-ready.');
    }
    const result = values['wait-ready']
      ? await speech().waitForReady({ timeout })
      : await speech().status();
    out(result, formatStatus(result));
    return EXIT.ok;
  },
};

const SESSION_START: HelpLine = {
  usage: 'session start <name> [--run <label>]',
  description: ['Start a session (the previous one ends) and print its id'],
};
const SESSION_END: HelpLine = { usage: 'session end', description: ['End the current session'] };
const SESSION_LIST: HelpLine = {
  usage: 'session list',
  description: ['The sessions in the buffer, newest first'],
};

export const session: Command = {
  options: ['run'],
  help: [SESSION_START, SESSION_END, SESSION_LIST],
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
        out(started, String(started.id));
        return EXIT.ok;
      }
      case 'end':
        expectArgs(rest, 0, SESSION_END.usage);
        await speech().endSession();
        out({ ended: true }, 'Session ended.');
        return EXIT.ok;
      case 'list': {
        expectArgs(rest, 0, SESSION_LIST.usage);
        const list = await speech().sessions();
        out(
          list,
          list.sessions.length === 0
            ? 'No sessions.'
            : list.sessions.map((s) => formatSession(s, s.id === list.currentId)).join('\n'),
        );
        return EXIT.ok;
      }
      case undefined:
        throw new UsageError('Missing session action: start, end or list.');
      default:
        throw new UsageError(`Unknown session action "${action}": use start, end or list.`);
    }
  },
};

const CLEAR: HelpLine = {
  usage: 'clear',
  description: ['Wipe the whole speech buffer, all sessions (for manual use)'],
};

export const clear: Command = {
  options: [],
  help: [CLEAR],
  async run(args, { speech, out }) {
    expectArgs(args, 0, CLEAR.usage);
    await speech().clear();
    out({ cleared: true }, 'Speech buffer cleared.');
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
  async run(args, { values, speech, out }) {
    expectArgs(args, 0, SPEECH.usage);
    const client = speech();
    // Options are checked before the bridge is asked for the current session.
    const entries = await client.getSpeech({
      since: optionalInt(values, 'since', 0) ?? 0,
      limit: optionalInt(values, 'limit', 1),
      includeMarkers: values['include-markers'] ?? false,
      session: await scope(values, client),
    });
    out({ entries }, entries.map(formatEntry).join('\n'));
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
  async run(args, { values, speech, out }) {
    expectArgs(args, 0, TEXT.usage);
    const client = speech();
    const joined = await client.getText({
      since: optionalInt(values, 'since', 0) ?? 0,
      separator: values.separator,
      session: await scope(values, client),
    });
    out({ text: joined }, joined);
    return EXIT.ok;
  },
};

const WAIT: HelpLine = {
  usage:
    'wait <text> [--regex] [--normalize] [--since <seq>] [--timeout <ms>] [--session <id> | --all]',
  description: [
    'Wait until speech contains <text> (or matches the regex);',
    'also finds speech that arrived before the call (default timeout 5000)',
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
    const options = {
      since: optionalInt(values, 'since', 0) ?? 0,
      timeout: optionalInt(values, 'timeout', 0),
      normalize: values.normalize ?? false,
      session: await scope(values, client),
    };
    try {
      const entry = await client.waitForOutput(match, options);
      out({ matched: true, entry }, formatEntry(entry));
      return EXIT.ok;
    } catch (error) {
      if (!(error instanceof SpeechTimeoutError)) throw error;
      if (json)
        io.stdout(
          `${JSON.stringify({ matched: false, entries: error.entries, truncated: error.truncated })}\n`,
        );
      io.stderr(`${NAME}: ${error.message}.${seenText(error.entries)}\n`);
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
  async run(args, { values, speech, out, io }) {
    expectArgs(args, 0, WAIT_SILENCE.usage);
    const quietFor = optionalInt(values, 'quiet-for', 1);
    const timeout = optionalInt(values, 'timeout', 0);
    try {
      await speech().waitForSilence({ quietFor, timeout });
      out({ silent: true }, 'Silent.');
      return EXIT.ok;
    } catch (error) {
      if (!(error instanceof SpeechTimeoutError)) throw error;
      io.stderr(`${NAME}: ${error.message}.\n`);
      return EXIT.timeout;
    }
  },
};

const MARK: HelpLine = {
  usage: 'mark <label>',
  description: ['Insert a marker and print its seq, for --since'],
};

export const mark: Command = {
  options: [],
  help: [MARK],
  async run(args, { speech, out }) {
    const [label] = expectArgs(args, 1, MARK.usage);
    const entry = await speech().mark(label);
    out(entry, String(entry.seq));
    return EXIT.ok;
  },
};

const TAIL: HelpLine = {
  usage: 'tail [--since <seq>]',
  description: [
    'Print speech live as it arrives, until Ctrl+C (one JSON event per',
    'line with --json); --since first prints the buffered entries after <seq>',
  ],
};

export const tail: Command = {
  options: ['since'],
  help: [TAIL],
  async run(args, { values, speech, out, io, json }) {
    expectArgs(args, 0, TAIL.usage);
    const since = optionalInt(values, 'since', 0);
    const client = speech();
    // Unreachable or incompatible: exit 2 at once, like every other command. Later connection
    // problems are retried.
    await client.status();
    const signal = io.interrupt();
    return new Promise<number>((resolve) => {
      const finish = (code: number) => {
        signal.removeEventListener('abort', interrupted);
        stop();
        resolve(code);
      };
      const interrupted = () => finish(EXIT.ok);
      const stop = client.onSpeech((entry) => out({ type: 'entry', entry }, formatEntry(entry)), {
        since,
        includeMarkers: true,
        onSession: (s) => out({ type: 'session', session: s }, formatSessionEvent(s)),
        onClear: () => out({ type: 'clear' }, '--- buffer cleared ---'),
        onTruncated: () => {
          if (json) out({ type: 'truncated' }, '');
          io.stderr(
            `${NAME}: some entries were dropped from the bridge's buffer before they could be shown.\n`,
          );
        },
        onError: (error, { retrying }) => {
          io.stderr(`${NAME}: ${error.message}${retrying ? ', reconnecting' : ''}\n`);
          if (!retrying) finish(EXIT.bridge);
        },
      });
      if (signal.aborted) finish(EXIT.ok);
      else signal.addEventListener('abort', interrupted, { once: true });
    });
  },
};
