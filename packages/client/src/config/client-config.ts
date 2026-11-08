import fs from 'node:fs/promises';
import path from 'node:path';
import { clientConfigFile } from './paths.js';

/** Bridge URL used when nothing else is configured. */
export const DEFAULT_BRIDGE_URL = 'http://localhost:5151';

/** Environment variable with the bridge URL. */
export const URL_ENV = 'SR_SPEECH_URL';

/** Settings stored in the client's config file. */
export interface ClientConfig {
  url?: string;
}

/** Where the effective value came from, highest precedence first. */
export type ValueSource = 'explicit' | 'env' | 'config' | 'default';

export interface Resolved {
  value: string;
  source: ValueSource;
}

/** The config file or a configured value is invalid. */
export class ClientConfigError extends Error {
  override name = 'ClientConfigError';
}

/**
 * Checks a bridge URL and returns it normalised: only `http:` / `https:`, no trailing slash, so
 * API paths can be appended directly.
 */
export function normalizeBridgeUrl(input: string, origin = 'URL'): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new ClientConfigError(`${origin} "${input}" is not a valid URL (e.g. http://my-vm:5151)`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ClientConfigError(`${origin} "${input}" must start with http:// or https://`);
  }
  if (url.search !== '' || url.hash !== '') {
    throw new ClientConfigError(`${origin} "${input}" must not contain a query or fragment`);
  }
  return url.href.replace(/\/+$/, '');
}

/** Reads the raw file: `{}` if it doesn't exist. Unknown keys are kept for {@link writeClientConfig}. */
async function readRaw(file: string): Promise<Record<string, unknown>> {
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new ClientConfigError(
      `Cannot read the client config file ${file}: ${(error as Error).message}`,
      { cause: error },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ClientConfigError(
      `The client config file ${file} is not valid JSON: ${(error as Error).message}`,
      { cause: error },
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ClientConfigError(`The client config file ${file} must contain a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

/** Reads and checks the client config file. A missing file is an empty config. */
export async function readClientConfig(file: string = clientConfigFile()): Promise<ClientConfig> {
  const raw = await readRaw(file);
  if (raw.url === undefined) return {};
  if (typeof raw.url !== 'string') {
    throw new ClientConfigError(`"url" in the client config file ${file} must be a string`);
  }
  return { url: normalizeBridgeUrl(raw.url, `"url" in ${file}`) };
}

/**
 * Applies `patch` to the config file: a value sets the key, `undefined` removes it. Keys this
 * version doesn't know are kept. Writes a temporary file and renames it, so a crash never leaves
 * half a file.
 */
export async function writeClientConfig(
  patch: { [K in keyof ClientConfig]-?: ClientConfig[K] | undefined },
  file: string = clientConfigFile(),
): Promise<void> {
  const raw = await readRaw(file);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete raw[key];
    else raw[key] = value;
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

export interface ResolveOptions {
  /** Passed in code (`baseUrl`, fixture option) or on the command line (`--url`). */
  explicit?: string | undefined;
  env?: NodeJS.ProcessEnv;
  file?: string;
}

/**
 * The bridge URL to use: explicit value, then `SR_SPEECH_URL`, then the config file, then
 * {@link DEFAULT_BRIDGE_URL}. The file is only read when nothing above it is set.
 */
export async function resolveBridgeUrl(options: ResolveOptions = {}): Promise<Resolved> {
  const env = options.env ?? process.env;
  if (options.explicit !== undefined && options.explicit !== '') {
    return { value: normalizeBridgeUrl(options.explicit), source: 'explicit' };
  }
  const fromEnv = env[URL_ENV];
  if (fromEnv !== undefined && fromEnv !== '') {
    return { value: normalizeBridgeUrl(fromEnv, URL_ENV), source: 'env' };
  }
  const { url } = await readClientConfig(options.file ?? clientConfigFile(undefined, env));
  if (url !== undefined) return { value: url, source: 'config' };
  return { value: DEFAULT_BRIDGE_URL, source: 'default' };
}
