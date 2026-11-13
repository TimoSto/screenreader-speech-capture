import { COMMAND_GROUPS } from './commands/index.js';
import { GLOBAL_OPTIONS, NAME } from './options.js';

/** Column where command descriptions start; longer usages put theirs on the next line. */
const COLUMN = 25;

/** `--help`, built from the command table and the global options. */
export function helpText(): string {
  const commands = COMMAND_GROUPS.map((group) =>
    Object.values(group)
      .flatMap((command) => command.help)
      .flatMap(({ usage, description }) => {
        const [first = '', ...more] = description;
        const lead = `  ${usage}`;
        const head =
          lead.length + 2 <= COLUMN
            ? [lead.padEnd(COLUMN) + first]
            : [lead, ' '.repeat(COLUMN) + first];
        return [...head, ...more.map((line) => ' '.repeat(COLUMN) + line)];
      })
      .join('\n'),
  );
  const width = Math.max(...GLOBAL_OPTIONS.map((o) => o.flag.length)) + 1;
  return `Usage: ${NAME} <command> [options]

Commands:
${commands.join('\n\n')}

Options:
${GLOBAL_OPTIONS.map((o) => `  ${o.flag.padEnd(width)}${o.description}`).join('\n')}

speech, text and wait read the current session (everything since "session start"), or the
whole buffer when no session is current. --session <id> reads another session, --all the
whole buffer. --since <seq> takes a seq printed by mark (for tail, default: only new speech).

Exit codes: 0 success, 1 timeout / no match, 2 bridge not reachable, HTTP error or
incompatible bridge, 3 invalid usage or config.
`;
}
