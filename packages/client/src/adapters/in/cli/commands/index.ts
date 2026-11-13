import type { Command } from '../command.js';
import { config } from './config.js';
import { clear, mark, session, speech, status, tail, text, wait, waitSilence } from './speech.js';

/** The commands by name, grouped as `--help` lists them. */
export const COMMAND_GROUPS: readonly Readonly<Record<string, Command>>[] = [
  { status, session, clear, speech, text, wait, 'wait-silence': waitSilence, mark, tail },
  { config },
];

export const COMMANDS: Readonly<Record<string, Command>> = Object.fromEntries(
  COMMAND_GROUPS.flatMap((group) => Object.entries(group)),
);
