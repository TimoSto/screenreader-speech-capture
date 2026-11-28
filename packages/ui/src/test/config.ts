import type { ConfigDto, ConfigPatchDto } from '@screenreader-speech-capture/shared';

const DEFAULTS: ConfigDto = {
  tcp: { host: '127.0.0.1', port: 4449, encoding: 'windows-1252', maxLineBytes: 65536 },
  http: { host: '0.0.0.0', port: 5151, allowedHosts: [] },
  playwright: { enabled: true, port: 3000, version: null },
  mcp: { enabled: true, port: 8931 },
  buffer: { maxEntries: 10000 },
  log: { level: 'info', file: null, consoleSpeech: false },
};

/** A configuration as the bridge answers it: the defaults with `changes` on top. */
export function configWith(changes: ConfigPatchDto = {}): ConfigDto {
  const config = structuredClone(DEFAULTS) as unknown as Record<string, object>;
  for (const [section, values] of Object.entries(changes)) {
    config[section] = { ...config[section], ...values };
  }
  return config as unknown as ConfigDto;
}
