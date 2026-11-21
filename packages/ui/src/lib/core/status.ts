import type { ServiceStatusDto, StatusDto } from '@screenreader-speech-capture/shared';

/** Where the status comes from (the HTTP adapter asks the BFF, which asks the bridge). */
export interface StatusApi {
  fetch(): Promise<StatusDto>;
}

export type ChipId = 'playwright' | 'mcp' | 'bridge';
export type ChipTone = 'ok' | 'error' | 'warning' | 'neutral';

export type Chip = {
  id: ChipId;
  /** What the chip shows. */
  text: string;
  tone: ChipTone;
  /** A hollow dot means "nothing there yet"; a filled one means "there is state". */
  dot: 'filled' | 'hollow';
  /** Spoken name of the state, so it is never colour alone. */
  description: string;
  /** Not connected or not ready: the dot is red while the chip itself stays neutral. */
  down?: boolean;
};

/**
 * Only what needs a look: a service that is not running (not enabled) has no chip, and the session
 * is the sessions pane's business. An unreachable bridge is a chip of its own.
 */
export function deriveChips(status: StatusDto | null, reachable: boolean): Chip[] {
  if (!reachable) {
    return [
      {
        id: 'bridge',
        text: 'Bridge unreachable',
        tone: 'error',
        dot: 'filled',
        description: 'Bridge unreachable',
      },
    ];
  }
  if (status === null) return [];
  return [
    serviceChip('playwright', 'Playwright', status.playwright),
    serviceChip('mcp', 'MCP', status.mcp),
  ].filter((chip): chip is Chip => chip !== null);
}

function serviceChip(id: ChipId, name: string, service: ServiceStatusDto): Chip | null {
  const base = `${name} ${service.version}`;
  switch (service.state) {
    case 'running':
      return { id, text: base, tone: 'ok', dot: 'filled', description: `${base}, running` };
    case 'crashed':
    case 'failed':
      return {
        id,
        text: `${base} · ${service.state}`,
        tone: 'warning',
        dot: 'filled',
        description: `${base}, ${service.state}`,
      };
    case 'starting':
      return {
        id,
        text: base,
        tone: 'neutral',
        dot: 'hollow',
        description: `${base}, starting`,
        down: true,
      };
    case 'stopped':
      return null;
  }
}

/**
 * The words a screen reader gets when the state changes. Empty while everything is fine, so the
 * regular refresh never speaks.
 */
export function announcement(chips: Chip[], reachable: boolean): string {
  if (!reachable) return 'Bridge unreachable.';
  return chips
    .filter((chip) => chip.tone === 'error' || chip.tone === 'warning')
    .map((chip) => `${chip.description}.`)
    .join(' ');
}
