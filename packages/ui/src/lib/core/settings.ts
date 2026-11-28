import type { ConfigDto, ConfigPatchDto } from '@screenreader-speech-capture/shared';
import {
  parseMaxEntries,
  parsePlaywrightVersion,
  parsePort,
  pendingFields,
  SettingRejected,
} from './config.js';

// The bridge settings the Settings page edits, as data: what each one is called, how its value is
// shown and read, and what to say about it. The components only render this.

/** The settings with a UI element, by dotted path. */
export type SettingPath =
  'tcp.port' | 'tcp.encoding' | 'buffer.maxEntries' | 'playwright.enabled' | 'playwright.version';

export type SettingValue = string | number | boolean | null;

/** What the texts of a setting need besides its value. */
export interface SettingContext {
  /** The version the Playwright server runs (from the status); `null` while unknown. */
  runningPlaywright: string | null;
  /** The saved configuration turns the Playwright server off. */
  playwrightOff?: boolean;
}

/** A piece of a text: plain, or a command name. */
export type Fragment = string | { code: string };

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

/** One choice of a select. */
export interface Option {
  value: string;
  label: string;
}

export type Control =
  | { kind: 'text'; inputmode: 'text' | 'numeric'; suffix?: string }
  | { kind: 'select'; options: readonly Option[] }
  /** On or off; the control holds `true` or `false`. */
  | { kind: 'checkbox' };

export interface Setting<T = SettingValue> {
  path: SettingPath;
  label: string;
  control: Control;
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

/** The ANSI code pages Windows has, plus UTF-8: what a speech voice on the VM can send. */
const ENCODINGS: readonly Option[] = (
  [
    ['windows-874', 'Thai'],
    ['windows-1250', 'Central European'],
    ['windows-1251', 'Cyrillic'],
    ['windows-1252', 'Western European'],
    ['windows-1253', 'Greek'],
    ['windows-1254', 'Turkish'],
    ['windows-1255', 'Hebrew'],
    ['windows-1256', 'Arabic'],
    ['windows-1257', 'Baltic'],
    ['windows-1258', 'Vietnamese'],
    ['shift_jis', 'Japanese'],
    ['gbk', 'Simplified Chinese'],
    ['euc-kr', 'Korean'],
    ['big5', 'Traditional Chinese'],
    ['utf-8', 'Unicode'],
  ] as const
).map(([value, name]) => ({ value, label: `${value} (${name})` }));

/**
 * The options of a select that holds `value`. A saved value outside the list (an alias such as
 * `cp1252`) is added, so showing it never changes it.
 */
export function selectOptions(options: readonly Option[], value: string): readonly Option[] {
  return options.some((option) => option.value === value)
    ? options
    : [...options, { value, label: value }];
}

export const TEXT_ENCODING: Setting<string> = {
  path: 'tcp.encoding',
  label: 'Text encoding',
  control: { kind: 'select', options: ENCODINGS },
  help: () =>
    "The code page the speech voice sends: the VM's ANSI code page. Default windows-1252.",
  format: (encoding) => encoding,
  parse: (text) => ({ ok: true, value: text }),
  describe: (encoding) => encoding,
  consequence: () => [],
};

export const BUFFER_SIZE: Setting<number> = {
  path: 'buffer.maxEntries',
  label: 'Speech buffer size',
  control: { kind: 'text', inputmode: 'numeric', suffix: 'entries' },
  help: () =>
    'How many speech entries the bridge keeps; then the oldest are dropped. Default 10000.',
  format: String,
  parse(text) {
    const parsed = parseMaxEntries(text);
    return parsed.ok ? { ok: true, value: parsed.entries } : parsed;
  },
  describe: String,
  consequence: () => [],
};

/** What every on / off setting shares. */
const onOff = {
  control: { kind: 'checkbox' },
  format: String,
  parse: (text: string): Parsed<boolean> => ({ ok: true, value: text === 'true' }),
  describe: (on: boolean) => (on ? 'On' : 'Off'),
} as const;

export const PLAYWRIGHT_ENABLED: Setting<boolean> = {
  ...onOff,
  path: 'playwright.enabled',
  label: 'Playwright server',
  help: () => 'Tests connect to it to drive a browser on the VM.',
  consequence: (saved) => [
    saved
      ? 'The first start installs what is missing, which can take a minute or two.'
      : "Tests can't connect to a browser on the VM while it is off.",
  ],
};

const bundled = ({ runningPlaywright }: SettingContext) =>
  runningPlaywright === null ? 'bundled version' : `bundled version (${runningPlaywright})`;

export const PLAYWRIGHT_VERSION: Setting<string | null> = {
  path: 'playwright.version',
  label: 'Playwright version',
  control: { kind: 'text', inputmode: 'text' },
  // The running version is the bundled one only while no version is configured.
  help: (active, { runningPlaywright, playwrightOff }) =>
    'The exact version of the Playwright server, like 1.65.0. Use the version your tests use. ' +
    'Leave empty for the bundled version' +
    (active === null && runningPlaywright !== null ? ` (${runningPlaywright}).` : '.') +
    (playwrightOff === true ? ' Applies when the server is turned on.' : ''),
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
export const SETTINGS: readonly Setting[] = [
  TCP_PORT,
  TEXT_ENCODING,
  BUFFER_SIZE,
  PLAYWRIGHT_ENABLED,
  PLAYWRIGHT_VERSION,
];

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

/** Why a save failed: on the field it is about, or for the form as a whole. */
export interface Rejection {
  field: SettingPath | null;
  message: string;
}

/**
 * Puts a failed save into the form's terms. The bridge names one setting (`details.field`) by its
 * dotted path, which isn't always the one that was changed: two listeners on one port are reported
 * on the later one. So the field is the named one if the form has it, else one the message names.
 */
export function explainRejection(cause: unknown, settings: readonly Setting[]): Rejection {
  if (!(cause instanceof Error))
    return { field: null, message: 'The settings could not be saved.' };
  if (!(cause instanceof SettingRejected) || cause.field === undefined) {
    return { field: null, message: cause.message };
  }
  const target =
    settings.find((setting) => setting.path === cause.field) ??
    settings.find((setting) => cause.message.includes(setting.path));
  const readable = SETTINGS.reduce(
    (message, setting) => message.replaceAll(setting.path, setting.label),
    cause.message,
  );
  return { field: target?.path ?? null, message: `${readable}. Nothing was saved.` };
}
