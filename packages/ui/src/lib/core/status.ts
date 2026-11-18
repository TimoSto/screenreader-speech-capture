import type { ServiceStatusDto, StatusDto } from '@screenreader-speech-capture/shared';

/** How often the header asks the bridge for its status (docs/implementation/web-ui-design/DESIGN.md). */
export const STATUS_POLL_MS = 2000;

/** Where the status comes from (the HTTP adapter asks the BFF, which asks the bridge). */
export interface StatusApi {
  fetch(): Promise<StatusDto>;
}

/** Time, timers and tab visibility, so the poll loop can be tested without a browser. */
export interface Ticker {
  /** Milliseconds since the epoch. */
  now(): number;
  /** Call `fn` every `ms` until the returned function is called. */
  every(ms: number, fn: () => void): () => void;
  isVisible(): boolean;
  /** Call `fn` whenever the tab becomes visible again. Returns the way to stop. */
  onVisible(fn: () => void): () => void;
}

export type ChipId = 'playwright' | 'mcp' | 'session';
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
};

export function deriveChips(status: StatusDto | null, reachable: boolean): Chip[] {
  if (status === null) {
    return [
      neutral('playwright', 'Playwright'),
      neutral('mcp', 'MCP'),
      neutral('session', 'Session'),
    ];
  }
  const chips = [
    serviceChip('playwright', 'Playwright', status.playwright),
    serviceChip('mcp', 'MCP', status.mcp),
    sessionChip(status),
  ];
  // The last known values stay visible, but they are no longer a statement about now.
  return reachable ? chips : chips.map((chip) => ({ ...chip, tone: 'neutral' as const }));
}

function neutral(id: ChipId, text: string): Chip {
  return { id, text, tone: 'neutral', dot: 'hollow', description: `${text}, state unknown` };
}

function serviceChip(id: ChipId, name: string, service: ServiceStatusDto): Chip {
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
      return { id, text: base, tone: 'neutral', dot: 'hollow', description: `${base}, starting` };
    case 'stopped':
      return { id, text: base, tone: 'neutral', dot: 'hollow', description: `${base}, stopped` };
  }
}

function sessionChip({ session }: StatusDto): Chip {
  if (session.current === null) {
    return {
      id: 'session',
      text: 'No session',
      tone: 'neutral',
      dot: 'hollow',
      description: 'No session is running',
    };
  }
  const text = `Session #${session.current.id}`;
  return { id: 'session', text, tone: 'ok', dot: 'filled', description: `${text}, live` };
}

/**
 * The words a screen reader gets when the state changes. Empty while everything is fine, so the
 * regular poll never speaks.
 */
export function announcement(chips: Chip[], reachable: boolean): string {
  if (!reachable) return 'Bridge unreachable.';
  return chips
    .filter((chip) => chip.tone === 'error' || chip.tone === 'warning')
    .map((chip) => `${chip.description}.`)
    .join(' ');
}

/** "status 2 s ago", for the refresh button. */
export function formatAge(nowMs: number, lastOkMs: number | null): string {
  if (lastOkMs === null) return 'status unknown';
  const seconds = Math.max(0, Math.floor((nowMs - lastOkMs) / 1000));
  return `status ${seconds} s ago`;
}
