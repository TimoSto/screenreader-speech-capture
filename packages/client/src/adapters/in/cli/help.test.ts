import { describe, expect, it } from 'vitest';
import { COMMANDS } from './commands/index.js';
import { helpText } from './help.js';
import { GLOBAL_OPTIONS } from './options.js';

const help = helpText();
const lines = help.split('\n');

describe('helpText', () => {
  it('lists every usage line of every command', () => {
    for (const command of Object.values(COMMANDS)) {
      for (const { usage } of command.help) {
        expect(
          lines.some((line) => line.startsWith(`  ${usage}`)),
          usage,
        ).toBe(true);
      }
    }
  });

  it('puts a short usage and its description on one line', () => {
    expect(lines).toContain('  session end            End the current session');
  });

  it('puts the description of a long usage on the next line, indented', () => {
    const at = lines.indexOf('  status [--wait-ready] [--timeout <ms>]');
    expect(at).toBeGreaterThan(-1);
    expect(lines[at + 1]).toBe(
      '                         Bridge health and versions; --wait-ready waits until it is ready',
    );
  });

  it('indents continuation lines of a description', () => {
    const at = lines.findIndex((line) => line.startsWith('  tail [--since <seq>]'));
    expect(lines[at + 1]).toMatch(/^ {25}line with --json\)/);
  });

  it('separates the config commands with a blank line', () => {
    const at = lines.findIndex((line) => line.startsWith('  config set url'));
    expect(lines[at - 1]).toBe('');
  });

  it('lists the global options in one aligned column', () => {
    for (const { flag, description } of GLOBAL_OPTIONS) {
      expect(lines).toContain(`  ${flag.padEnd(14)}${description}`);
    }
  });

  it('ends with the exit codes and a newline', () => {
    expect(help).toMatch(/3 invalid usage or config\.\n$/);
  });
});

it.each(Object.entries(COMMANDS))(
  '"%s" lists exactly the options it takes in --help',
  (name, command) => {
    const usages = command.help.map((line) => line.usage);
    expect(usages.every((usage) => usage === name || usage.startsWith(`${name} `))).toBe(true);
    const shown = new Set(
      usages.flatMap((usage) => [...usage.matchAll(/--([\w-]+)/g)].map((m) => m[1])),
    );
    expect([...shown].sort()).toEqual([...command.options].sort());
  },
);
