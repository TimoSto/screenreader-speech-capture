import fs from 'node:fs/promises';
import path from 'node:path';
import {
  parseClientConfig,
  type ClientConfig,
  type ClientConfigPatch,
} from '../../../domain/client-config.js';
import { ClientConfigError } from '../../../domain/errors.js';
import type { ClientConfigStore } from '../../../application/ports/out/client-config-store.js';

/**
 * The client config file (docs/client.md#bridge-url): JSON, one per user. Keys this version
 * doesn't know are kept when saving.
 */
export class FsClientConfigStore implements ClientConfigStore {
  constructor(readonly location: string) {}

  async load(): Promise<ClientConfig> {
    return parseClientConfig(await this.readRaw(), this.location);
  }

  /**
   * Writes a temporary file and renames it, so a crash never leaves half a file. Values already
   * in the file aren't checked, so `config set` can repair an invalid one.
   */
  async save(patch: ClientConfigPatch): Promise<void> {
    const raw = await this.readRaw();
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new ClientConfigError(
        `The client config file ${this.location} must contain a JSON object`,
      );
    }
    const next = { ...(raw as Record<string, unknown>) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete next[key];
      else next[key] = value;
    }
    await fs.mkdir(path.dirname(this.location), { recursive: true });
    const temporary = `${this.location}.${process.pid}.tmp`;
    try {
      await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
      await fs.rename(temporary, this.location);
    } catch (error) {
      await fs.rm(temporary, { force: true });
      throw error;
    }
  }

  /** The parsed file, `{}` if it doesn't exist. */
  private async readRaw(): Promise<unknown> {
    let text: string;
    try {
      text = await fs.readFile(this.location, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw new ClientConfigError(
        `Cannot read the client config file ${this.location}: ${(error as Error).message}`,
        { cause: error },
      );
    }
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw new ClientConfigError(
        `The client config file ${this.location} is not valid JSON: ${(error as Error).message}`,
        { cause: error },
      );
    }
  }
}
