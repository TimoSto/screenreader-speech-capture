import type { Logger } from '../src/application/ports/out/logger.js';

/** Logger that keeps its messages, as `"<level> <message>"`. */
export class MemoryLogger implements Logger {
  readonly lines: string[] = [];
  error = (message: string) => void this.lines.push(`error ${message}`);
  warn = (message: string) => void this.lines.push(`warn ${message}`);
  info = (message: string) => void this.lines.push(`info ${message}`);
  debug = (message: string) => void this.lines.push(`debug ${message}`);
}
