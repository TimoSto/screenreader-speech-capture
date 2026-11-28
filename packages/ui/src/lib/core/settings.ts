import type { ConfigDto, ConfigPatchDto } from '@screenreader-speech-capture/shared';
import { parsePlaywrightVersion, parsePort, pendingFields } from './config.js';

// The bridge settings the Settings page edits, as data: what each one is called, how its value is
// shown and read, and what to say about it. The components only render this.

/** The settings with a UI element, by dotted path. */
export type SettingPath = 'tcp.port' | 'playwright.version';

export type SettingValue = string | number | boolean | null;

/** What the texts of a setting need besides its value. */
export interface SettingContext {
  /** The version the Playwright server runs (from the status); `null` while unknown. */
  runningPlaywright: string | null;
}

/** A piece of a text: plain, or a command name. */
export type Fragment = string | { code: string };

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

export interface Setting<T = SettingValue> {
  path: SettingPath;
  label: string;
  /** What the messages call the value (`port`). */
  noun: string;
  control: { kind: 'text'; inputmode: 'text' | 'numeric' };
  /** The text under the control; `active` is the value in use. */
  help(active: T, context: SettingContext): string;
  /** A value as the control holds it. */
  format(value: T): string;
  /** Reads what the control holds; a refused text has a message and is not saved. */
  parse(text: string): Parsed<T>;
  /** A value in words. */
  describe(value: T, context: SettingContext): string;
  /** What to know before the restart that applies `saved` instead of `active`. */
  consequence(saved: T, active: T): Fragment[];
}

export const TCP_PORT: Setting<number> = {
  path: 'tcp.port',
  label: 'TCP port',
  noun: 'port',
  control: { kind: 'text', inputmode: 'numeric' },
  help: () => "The port the screen reader's speech voice sends to. Default 4449.",
  format: String,
  parse(text) {
    const parsed = parsePort(text);
    return parsed.ok ? { ok: true, value: parsed.port } : parsed;
  },
  describe: String,
  consequence: (saved) => [
    `The speech voice on the VM sends to a fixed port, so also add a voice for ${saved} (`,
    { code: 'text-to-socket-engine-add-voice' },
    ') and select it in the screen reader.',
  ],
};

const bundled = ({ runningPlaywright }: SettingContext) =>
  runningPlaywright === null ? 'bundled version' : `bundled version (${runningPlaywright})`;

export const PLAYWRIGHT_VERSION: Setting<string | null> = {
  path: 'playwright.version',
  label: 'Playwright version',
  noun: 'version',
  control: { kind: 'text', inputmode: 'text' },
  // The running version is the bundled one only while no version is configured.
  help: (active, { runningPlaywright }) =>
    'The exact version of the Playwright server, like 1.65.0. Use the version your tests use. ' +
    'Leave empty for the bundled version' +
    (active === null && runningPlaywright !== null ? ` (${runningPlaywright}).` : '.'),
  format: (version) => version ?? '',
  parse(text) {
    const parsed = parsePlaywrightVersion(text);
    return parsed.ok ? { ok: true, value: parsed.version } : parsed;
  },
  describe: (version, context) => version ?? bundled(context),
  consequence: () => [
    'The first start of a new version installs it, which can take a minute or two. Your test ' +
      'projects need the same version.',
  ],
};

/** The value of a setting in a configuration. */
export function readSetting(config: ConfigDto, path: SettingPath): SettingValue {
  const [section, key] = path.split('.') as [keyof ConfigDto, string];
  return (config[section] as Record<string, SettingValue>)[key];
}

/** What was typed or chosen, by setting; a setting nobody touched has no draft. */
export type Drafts = Partial<Record<SettingPath, string>>;

/** The settings whose draft differs from the saved value. */
export function changedSettings(
  settings: readonly Setting[],
  drafts: Drafts,
  saved: ConfigDto,
): Setting[] {
  return settings.filter((setting) => {
    const draft = drafts[setting.path];
    return draft !== undefined && draft.trim() !== setting.format(readSetting(saved, setting.path));
  });
}

export type PatchResult =
  { ok: true; patch: ConfigPatchDto } | { ok: false; errors: Partial<Record<SettingPath, string>> };

/**
 * The patch that saves the changed settings, and only those: an untouched value must not end up in
 * the config file. One unreadable draft means nothing is saved.
 */
export function buildPatch(
  settings: readonly Setting[],
  drafts: Drafts,
  saved: ConfigDto,
): PatchResult {
  const patch: Record<string, Record<string, SettingValue>> = {};
  const errors: Partial<Record<SettingPath, string>> = {};
  for (const setting of changedSettings(settings, drafts, saved)) {
    const parsed = setting.parse(drafts[setting.path]!);
    if (!parsed.ok) {
      errors[setting.path] = parsed.message;
      continue;
    }
    const [section, key] = setting.path.split('.') as [string, string];
    (patch[section] ??= {})[key] = parsed.value;
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, patch };
}

/** The settings with a UI element. */
export const SETTINGS: readonly Setting[] = [TCP_PORT, PLAYWRIGHT_VERSION];

/** Whether the saved value of a setting waits for a restart. A flag or variable keeps winning. */
export function isPending(
  path: SettingPath,
  active: ConfigDto,
  saved: ConfigDto,
  overrides: Readonly<Record<string, string>>,
): boolean {
  return overrides[path] === undefined && readSetting(active, path) !== readSetting(saved, path);
}

/** A saved change that the next start of the bridge applies. */
export interface PendingChange {
  path: string;
  /** The setting's label, or its dotted path if the page has no field for it. */
  label: string;
  from: string;
  to: string;
  consequence: Fragment[];
}

const valueAt = (config: ConfigDto, path: string): unknown => {
  const [section, key] = path.split('.') as [keyof ConfigDto, string];
  return (config[section] as Record<string, unknown>)[key];
};

/**
 * Everything that waits for a restart, also settings saved through the API that have no field
 * here.
 */
export function waitingForRestart(
  active: ConfigDto,
  saved: ConfigDto,
  overrides: Readonly<Record<string, string>>,
  context: SettingContext,
): PendingChange[] {
  return pendingFields(active, saved)
    .filter((path) => overrides[path] === undefined)
    .map((path) => {
      const setting = SETTINGS.find((candidate) => candidate.path === path);
      if (setting === undefined) {
        const text = (config: ConfigDto) => JSON.stringify(valueAt(config, path));
        return { path, label: path, from: text(active), to: text(saved), consequence: [] };
      }
      const from = readSetting(active, setting.path);
      const to = readSetting(saved, setting.path);
      return {
        path,
        label: setting.label,
        from: setting.describe(from, context),
        // What runs now says nothing about the next start.
        to: setting.describe(to, { ...context, runningPlaywright: null }),
        consequence: setting.consequence(to, from),
      };
    });
}
