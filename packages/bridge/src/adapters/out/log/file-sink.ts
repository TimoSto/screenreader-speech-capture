import fs from 'node:fs';
import path from 'node:path';
import type { LogSink } from './log.js';

export interface FileSinkOptions {
  /** Rotate when the file would grow past this size. Default 10 MB. */
  maxBytes?: number;
  /** Number of rotated files to keep (`bridge.log.1` … `.<keep>`). Default 5. */
  keep?: number;
  /** Called once if writing fails; the sink then stops writing. */
  onError?: (error: Error) => void;
}

/**
 * Bridge log file (docs/operations.md#logging): no colours, includes the speech channel.
 * Writes synchronously so nothing is lost on a crash. Log volume is small.
 */
export function fileSink(file: string, options: FileSinkOptions = {}): LogSink {
  const { maxBytes = 10 * 1024 * 1024, keep = 5 } = options;
  const onError =
    options.onError ??
    ((error: Error) =>
      process.stderr.write(`screenreader-speech-capture: log file disabled: ${error.message}\n`));

  let size = 0;
  let failed = false;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    size = fs.existsSync(file) ? fs.statSync(file).size : 0;
  } catch (error) {
    failed = true;
    onError(error as Error);
  }

  const rotate = () => {
    fs.rmSync(`${file}.${keep}`, { force: true });
    for (let i = keep - 1; i >= 1; i--) {
      if (fs.existsSync(`${file}.${i}`)) fs.renameSync(`${file}.${i}`, `${file}.${i + 1}`);
    }
    if (keep >= 1) fs.renameSync(file, `${file}.1`);
    else fs.rmSync(file, { force: true });
    size = 0;
  };

  return {
    colour: false,
    speech: true,
    write(line) {
      if (failed) return;
      const data = `${line}\n`;
      const bytes = Buffer.byteLength(data);
      try {
        if (size > 0 && size + bytes > maxBytes) rotate();
        fs.appendFileSync(file, data);
        size += bytes;
      } catch (error) {
        failed = true;
        onError(error as Error);
      }
    },
  };
}
