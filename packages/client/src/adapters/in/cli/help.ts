import { KEY_ALIASES, MODIFIER_KEYS, NAMED_KEYS } from '@screenreader-speech-capture/shared';
import { COMMAND_GROUPS } from './commands/index.js';
import type { Command, HelpLine } from './command.js';
import { GLOBAL_OPTIONS, NAME, OPTIONS } from './options.js';

/** Column where command descriptions start; longer usages put theirs on the next line. */
const COLUMN = 25;

/** The rows of `help`: the usage, and the description from {@link COLUMN} on. */
function rows(help: readonly HelpLine[]): string {
  return help
    .flatMap(({ usage, description }) => {
      const [first = '', ...more] = description;
      const lead = `  ${usage}`;
      const head =
        lead.length + 2 <= COLUMN
          ? [lead.padEnd(COLUMN) + first]
          : [lead, ' '.repeat(COLUMN) + first];
      return [...head, ...more.map((line) => ' '.repeat(COLUMN) + line)];
    })
    .join('\n');
}

function globalOptions(): string {
  const width = Math.max(...GLOBAL_OPTIONS.map((o) => o.flag.length)) + 1;
  return GLOBAL_OPTIONS.map((o) => `  ${o.flag.padEnd(width)}${o.description}`).join('\n');
}

const EXIT_CODES = `Exit codes: 0 success, 1 timeout / no match, 2 bridge not reachable, HTTP error or
incompatible bridge, 3 invalid usage or config, 4 internal error (a bug in this client).
With --json, exit 1 prints the command's result with a "status" (timeout, not-ready) and the
data seen; a failed command (2-4) prints {"error":{"type","message",...}} on stdout.`;

/** `<command> --help`: its usage rows and the options it takes. */
export function commandHelp(name: string, command: Command): string {
  const own = command.options.map((o) =>
    OPTIONS[o].type === 'string' ? `--${o} <value>` : `--${o}`,
  );
  const sections = [
    `Usage:\n${rows(command.help)}`,
    ...(own.length > 0 ? [`Options:\n  ${own.join('\n  ')}`] : []),
    `Global options:\n${globalOptions()}`,
    ...(name === 'press' ? [keyNames()] : []),
    `${EXIT_CODES}\n${name} --help --json describes this command and its --json output.`,
  ];
  return `${sections.join('\n\n')}\n`;
}

/** `--help`, built from the command table and the global options. */
export function helpText(): string {
  const commands = COMMAND_GROUPS.map((group) =>
    rows(Object.values(group).flatMap((command) => command.help)),
  );
  return `Usage: ${NAME} <command> [options]

Commands:
${commands.join('\n\n')}

Options:
${globalOptions()}

Typical use (one session per task, then per step):
  session start "audit checkout"   once per task; reads then see only this session
  focus                            once, and again when focus moved: brings the MCP browser
                                   to the front (fallback: focus --script / --geometry)
  press h --capture --json         a screen reader command and the speech it caused
  mark step-2                      before an action in another tool (Playwright MCP)
  wait-silence                     after that action: until the screen reader is quiet
  text --since mark:step-2 --json  what was said after the marker
  session end

seq: every entry (speech or marker) gets a number that only grows. --since <seq> means
"only entries after this one"; take it from an entry's #<seq> (mark prints one; #4712 and
4712 are the same). --since mark:<label>
starts after the newest marker with that label in the scope that is read, so no number has to
be kept between calls (exit 3 if there is none).

${keyNames()}

speech, text and wait read the current session (everything since "session start"), or the
whole buffer when no session is current. --session <id> reads another session (<id> may be
"current": an error if none is current), --all the whole buffer; clear takes the same words.
tail without --since prints only new speech.

<command> --help shows one command; --help --json describes every command and its --json
output (JSON Schema).

${EXIT_CODES}
`;
}

/** The key names `press` accepts, from the contract the bridge checks them with. */
function keyNames(): string {
  const named = NAMED_KEYS.filter((key) => !/^f\d+$/.test(key));
  return wrap(
    [
      'Keys for press (case-insensitive; chord: Insert+T; sequence: h h Insert+Down):',
      `a-z 0-9 ${named.join(' ')} f1-f12;`,
      `modifiers: ${MODIFIER_KEYS.join(' ')};`,
      `aliases: ${Object.entries(KEY_ALIASES)
        .map(([alias, key]) => `${alias}=${key}`)
        .join(' ')}`,
    ],
    '  ',
  );
}

/** The first line as it is, the rest joined and wrapped to 100 columns with `indent`. */
function wrap([first, ...rest]: string[], indent: string): string {
  const lines = [first];
  let line = indent;
  for (const word of rest.join(' ').split(' ')) {
    if (line.length + word.length + 1 > 100 && line.trim() !== '') {
      lines.push(line.trimEnd());
      line = indent;
    }
    line += `${word} `;
  }
  lines.push(line.trimEnd());
  return lines.join('\n');
}
