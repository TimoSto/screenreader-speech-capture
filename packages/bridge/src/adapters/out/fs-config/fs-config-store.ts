import fs from 'node:fs/promises';
import path from 'node:path';
import type { ConfigStore } from '../../../application/ports/out/config-store.js';
import type { ConfigPatch } from '../../../domain/config/index.js';

/**
 * The config file (docs/usage/configuration.md): JSON with the settings saved so far. Only the
 * file's own settings are written, never values from flags or environment variables.
 */
export class FsConfigStore implements ConfigStore {
  constructor(readonly location: string) {}

  async load(): Promise<unknown> {
    const text = await this.read(this.location);
    if (text === undefined) return undefined;
    try {
      return parseJson(text);
    } catch (error) {
      // A hard reset can leave an empty or cut-off file: the last good save is the `.bak`.
      const backup = await this.readBackup();
      if (backup !== undefined) return backup;
      throw new Error(
        `The config file ${this.location} is not valid JSON: ${(error as Error).message}`,
        { cause: error },
      );
    }
  }

  /**
   * Writes a temporary file, flushes it to disk and renames it, so a crash never leaves half a
   * file. The previous file is kept as `config.json.bak` for `load` to fall back on.
   */
  async save(file: ConfigPatch): Promise<void> {
    await fs.mkdir(path.dirname(this.location), { recursive: true });
    const temporary = `${this.location}.${process.pid}.tmp`;
    try {
      const handle = await fs.open(temporary, 'w');
      try {
        await handle.writeFile(`${JSON.stringify(file, null, 2)}\n`, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      // Only a file that parses replaces the backup, so a broken one never overwrites a good one.
      if (await this.isValid(this.location)) {
        await fs.copyFile(this.location, `${this.location}.bak`);
      }
      await fs.rename(temporary, this.location);
    } catch (error) {
      await fs.rm(temporary, { force: true });
      throw error;
    }
  }

  private async read(file: string): Promise<string | undefined> {
    try {
      return await fs.readFile(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw new Error(`Cannot read the config file ${file}: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }

  private async readBackup(): Promise<unknown> {
    try {
      const text = await this.read(`${this.location}.bak`);
      return text === undefined ? undefined : parseJson(text);
    } catch {
      return undefined;
    }
  }

  private async isValid(file: string): Promise<boolean> {
    try {
      const text = await this.read(file);
      if (text === undefined) return false;
      parseJson(text);
      return true;
    } catch {
      return false;
    }
  }
}

/** `JSON.parse` that accepts a leading byte order mark (Notepad and PowerShell write one). */
function parseJson(text: string): unknown {
  return JSON.parse(text.replace(/^\uFEFF/, '')) as unknown;
}
