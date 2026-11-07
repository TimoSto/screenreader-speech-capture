import fs from 'node:fs/promises';
import path from 'node:path';
import type { ConfigStore } from '../../../application/ports/out/config-store.js';
import type { ConfigPatch } from '../../../domain/config.js';

/**
 * The config file (docs/configuration.md): JSON with the settings saved so far. Only the file's
 * own settings are written, never values from flags or environment variables.
 */
export class FsConfigStore implements ConfigStore {
  constructor(readonly location: string) {}

  async load(): Promise<unknown> {
    let text: string;
    try {
      text = await fs.readFile(this.location, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw new Error(`Cannot read the config file ${this.location}: ${(error as Error).message}`, {
        cause: error,
      });
    }
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw new Error(
        `The config file ${this.location} is not valid JSON: ${(error as Error).message}`,
        { cause: error },
      );
    }
  }

  /** Writes a temporary file and renames it, so a crash never leaves half a file. */
  async save(file: ConfigPatch): Promise<void> {
    await fs.mkdir(path.dirname(this.location), { recursive: true });
    const temporary = `${this.location}.${process.pid}.tmp`;
    try {
      await fs.writeFile(temporary, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
      await fs.rename(temporary, this.location);
    } catch (error) {
      await fs.rm(temporary, { force: true });
      throw error;
    }
  }
}
