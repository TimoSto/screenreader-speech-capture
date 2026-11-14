import { URL_ENV } from '../../../../domain/bridge-url.js';
import { EXIT, type Command, type HelpLine } from '../command.js';
import { SOURCE_LABEL } from '../format.js';
import { UsageError, expectArgs } from '../options.js';

const SET: HelpLine = {
  usage: 'config set url <url>',
  description: ['Store the bridge URL for this user'],
};
const GET: HelpLine = {
  usage: 'config get url',
  description: ['Show the bridge URL in use and where it comes from'],
};
const UNSET: HelpLine = {
  usage: 'config unset url',
  description: ['Remove the stored bridge URL'],
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
    const explicit = { url: values.url };

    const [action, ...rest] = args;
    switch (action) {
      case 'set': {
        const [key, value] = expectArgs(rest, 2, 'config set <key> <value>');
        const result = await config.set(key, value);
        out('config set', { ...result, file }, `Saved ${result.key} = ${result.value} to ${file}`);
        if (result.shadowedBy === 'env') {
          io.stderr(`Note: ${URL_ENV} is set and takes precedence over the config file.\n`);
        }
        return EXIT.ok;
      }
      case 'get': {
        const [key] = expectArgs(rest, 1, 'config get <key>');
        const result = await config.get(key, explicit);
        out('config get', result, `${result.value} (${SOURCE_LABEL[result.source]})`);
        return EXIT.ok;
      }
      case 'unset': {
        const [key] = expectArgs(rest, 1, 'config unset <key>');
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
            ...entries.map((e) => `${e.key} = ${e.value} (${SOURCE_LABEL[e.source]})`),
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
