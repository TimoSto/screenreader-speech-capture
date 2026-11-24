import { KEY_ALIASES, MODIFIER_KEYS, NAMED_KEYS } from '@screenreader-speech-capture/shared';
import { describe, expect, it } from 'vitest';
import { COMMANDS } from './commands/index.js';
import { commandHelp, helpText } from './help.js';
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

  it('warns that wait sees the whole session, and points to --since and --capture', () => {
    expect(help).toMatch(/It searches the whole session: pass --since <seq>/);
    expect(help).toMatch(/--capture prints the speech it caused/);
  });

  it('shows the typical agent loop and explains seq', () => {
    expect(help).toContain('Typical use (one session per task, then per step):');
    expect(help).toMatch(/^ {2}press h --capture --json +a screen reader command/m);
    expect(help).toMatch(/^ {2}text --since mark:step-2 --json +what was said after the marker$/m);
    expect(help).toContain('--since mark:<label>');
    expect(help).toContain('seq: every entry (speech or marker) gets a number that only grows.');
  });

  it('lists every key name press accepts, from the shared contract', () => {
    const at = help.indexOf('Keys for press');
    const block = help.slice(at, help.indexOf('\n\n', at)).split(/\s+/);
    for (const key of [...MODIFIER_KEYS, ...NAMED_KEYS.filter((k) => !/^f\d+$/.test(k))]) {
      expect(
        block.some((word) => word.replace(/;$/, '') === key),
        key,
      ).toBe(true);
    }
    for (const [alias, key] of Object.entries(KEY_ALIASES)) {
      expect(block, alias).toContain(`${alias}=${key}`);
    }
    expect(block).toContain('f1-f12;');
  });

  it('keeps every line within 100 columns', () => {
    expect(lines.filter((line) => line.length > 100)).toEqual([]);
  });

  it('separates the config commands with a blank line', () => {
    const at = lines.findIndex((line) => line.startsWith('  config set'));
    expect(lines[at - 1]).toBe('');
  });

  it('lists the global options in one aligned column', () => {
    for (const { flag, description } of GLOBAL_OPTIONS) {
      expect(lines).toContain(`  ${flag.padEnd(14)}${description}`);
    }
  });

  it('ends with the exit codes, the --json error object and a newline', () => {
    expect(help).toContain('4 internal error');
    expect(help).toMatch(/a failed command prints \{"error":.* on stdout\.\n$/);
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

describe('commandHelp', () => {
  it.each(Object.entries(COMMANDS))(
    '"%s" shows its own usage rows and options',
    (name, command) => {
      const text = commandHelp(name, command);
      expect(text).toMatch(/^Usage:\n/);
      for (const { usage } of command.help) expect(text).toContain(`  ${usage}`);
      for (const option of command.options)
        expect(text).toMatch(new RegExp(`^  --${option}\\b`, 'm'));
      for (const { flag } of GLOBAL_OPTIONS) expect(text).toContain(`  ${flag}`);
      expect(text).not.toContain('Commands:');
      expect(text.split('\n').filter((line) => line.length > 100)).toEqual([]);
    },
  );

  it('shows a value for string options, none for flags', () => {
    const text = commandHelp('press', COMMANDS.press!);
    expect(text).toContain('  --timeout <value>');
    expect(text).toMatch(/^ {2}--capture$/m);
  });

  it('lists the key names for press only', () => {
    expect(commandHelp('press', COMMANDS.press!)).toContain('Keys for press');
    expect(commandHelp('click', COMMANDS.click!)).not.toContain('Keys for press');
  });
});
