import type { Setting } from './config-value.js';
import { ClientConfigError } from './errors.js';

/** Environment variable with the CLI's default output format. */
export const OUTPUT_ENV = 'SR_SPEECH_OUTPUT';

export const OUTPUT_FORMATS = ['text', 'json'] as const;

/** What the CLI prints without `--json` (docs/usage/client.md#output-format). */
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

/** Checks an output format: `text` or `json`, in any case. */
export function parseOutputFormat(input: string, origin = 'Output format'): OutputFormat {
  const value = input.trim().toLowerCase();
  if ((OUTPUT_FORMATS as readonly string[]).includes(value)) return value as OutputFormat;
  throw new ClientConfigError(`${origin} "${input}" must be text or json`);
}

export const OUTPUT_SETTING: Setting = {
  env: OUTPUT_ENV,
  default: 'text',
  normalize: parseOutputFormat,
};
