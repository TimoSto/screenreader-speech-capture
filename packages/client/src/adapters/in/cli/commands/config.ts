import { CONFIG_KEYS } from '../../../../domain/client-config.js';
import { EXIT, type Command, type HelpLine } from '../command.js';
import { sourceLabel } from '../format.js';
import { UsageError, expectArgs } from '../options.js';

const SET: HelpLine = {
  usage: 'config set <key> <value>',
  description: [
    'Store a setting for this user: url <bridge URL>,',
    'or output json|text (the output without --json)',
  ],
};
const GET: HelpLine = {
  usage: 'config get <key>',
  description: ['Show a setting in use and where it comes from'],
};
const UNSET: HelpLine = {
  usage: 'config unset <key>',
  description: ['Remove a stored setting'],
};
const LIST: HelpLine = {
  usage: 'config list',
  description: ['Show all settings and where they come from'],
};
const PATH: HelpLine = { usage: 'config path', description: ['Show the path of the config file'] };

/** The per-user settings; works without a reachable bridge or a valid bridge URL. */
export const config: Command = {
  options: [],
  help: [SET, GET, UNSET, LIST, PATH],
  async run(args, { values, io, out }) {
    const { config } = io;
    const file = config.location;
    const explicit = { url: values.url, output: values.json ? 'json' : undefined };

    const [action, ...rest] = args;
    switch (action) {
      case 'set': {
        const [key, value] = expectArgs(rest, 2, SET.usage);
        const result = await config.set(key, value);
        out('config set', { ...result, file }, `Saved ${result.key} = ${result.value} to ${file}`);
        if (result.shadowedBy === 'env') {
          const env = CONFIG_KEYS[result.key].env;
          io.stderr(`Note: ${env} is set and takes precedence over the config file.\n`);
        }
        return EXIT.ok;
      }
      case 'get': {
        const [key] = expectArgs(rest, 1, GET.usage);
        const result = await config.get(key, explicit);
        out('config get', result, `${result.value} (${sourceLabel(result.key, result.source)})`);
        return EXIT.ok;
      }
      case 'unset': {
        const [key] = expectArgs(rest, 1, UNSET.usage);
        const result = await config.unset(key);
        out('config unset', { ...result, file }, `Removed ${result.key} from ${file}`);
        return EXIT.ok;
      }
      case 'list': {
        expectArgs(rest, 0, LIST.usage);
        const entries = await config.list(explicit);
        out(
          'config list',
          { file, settings: entries },
          [
            `# ${file}`,
            ...entries.map((e) => `${e.key} = ${e.value} (${sourceLabel(e.key, e.source)})`),
          ].join('\n'),
        );
        return EXIT.ok;
      }
      case 'path':
        expectArgs(rest, 0, PATH.usage);
        out('config path', { file }, file);
        return EXIT.ok;
      case undefined:
        throw new UsageError('Missing config action: set, get, unset, list or path.');
      default:
        throw new UsageError(
          `Unknown config action "${action}": use set, get, unset, list or path.`,
        );
    }
  },
};
