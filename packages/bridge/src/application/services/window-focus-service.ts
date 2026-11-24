import { API_LIMITS } from '@screenreader-speech-capture/shared';
import type { ServiceName } from '../../domain/child-service.js';
import { AppError, invalidField } from '../../domain/errors.js';
import type {
  FocusedWindow,
  FocusRequest,
  FocusTarget,
  FocusWindow,
} from '../ports/in/focus-window.js';
import type { InputQueue } from '../ports/in/send-native-input.js';
import type { Clock } from '../ports/out/clock.js';
import type { Logger } from '../ports/out/logger.js';
import type { ProcessSupervisor } from '../ports/out/process-supervisor.js';
import type { AppWindow, WindowSystem } from '../ports/out/window-system.js';

interface WindowFocusDeps {
  windows: WindowSystem;
  /** The input queue: a focus and a key press never interleave. */
  queue: InputQueue;
  /** The supervisors of the services whose browsers can be focused. */
  services: Readonly<Record<ServiceName, Pick<ProcessSupervisor, 'pid'>>>;
  clock: Pick<Clock, 'sleep'>;
  logger: Logger;
}

/** How long a `title` may take to show up in the window title, and how often it is looked for. */
export const TITLE_WAIT = { timeoutMs: 2000, pollMs: 50 } as const;

const TARGETS: Readonly<Record<FocusTarget, { service: ServiceName; name: string }>> = {
  mcp: { service: 'mcp', name: 'Playwright MCP' },
  playwright: { service: 'playwright', name: 'the Playwright server' },
};

/**
 * Brings a window of a browser the bridge started to the front
 * (docs/usage/native-input.md#bringing-the-browser-to-the-front): the front-most visible
 * top-level window of the target service's process tree, or with `title` the front-most one
 * whose title contains it.
 */
export class WindowFocusService implements FocusWindow {
  constructor(private readonly deps: WindowFocusDeps) {}

  async focus({ target, title }: FocusRequest): Promise<FocusedWindow> {
    const known = Object.hasOwn(TARGETS, target) ? TARGETS[target] : undefined;
    if (!known) throw invalidField('target', 'must be mcp or playwright');
    if (title !== undefined && (title === '' || title.length > API_LIMITS.input.focusTitleLength)) {
      throw invalidField('title', `must be 1 to ${API_LIMITS.input.focusTitleLength} characters`);
    }
    const pid = this.deps.services[known.service].pid();
    if (pid === null) throw new AppError('NOT_FOUND', `${capitalize(known.name)} is not running`);

    return this.deps.queue.exclusive(async () => {
      const window = await this.find(pid, title);
      if (!window) throw notFound(known, title);
      if (!(await this.deps.windows.bringToFront(window))) {
        throw new AppError(
          'FOCUS_FAILED',
          `Windows did not bring "${window.title}" to the front (is the desktop locked, or ` +
            'does an elevated window have the focus?)',
        );
      }
      this.deps.logger.info(`focus ${target}: "${window.title}" (pid ${window.pid})`);
      return { title: window.title, pid: window.pid };
    });
  }

  /**
   * The front-most window of the tree below `pid` with a title (containing `title`, if given).
   * The browser sets its window title a moment after `document.title` changes, so a `title` is
   * looked for again until {@link TITLE_WAIT} runs out.
   */
  private async find(pid: number, title: string | undefined): Promise<AppWindow | undefined> {
    const { windows, clock } = this.deps;
    const tries = title === undefined ? 1 : TITLE_WAIT.timeoutMs / TITLE_WAIT.pollMs + 1;
    for (let attempt = 0; attempt < tries; attempt++) {
      if (attempt > 0) await clock.sleep(TITLE_WAIT.pollMs);
      const tree = await windows.processTree(pid);
      const found = (await windows.topLevelWindows()).find(
        (window) =>
          tree.has(window.pid) &&
          window.title !== '' &&
          (title === undefined || window.title.includes(title)),
      );
      if (found) return found;
    }
    return undefined;
  }
}

function notFound(target: { name: string }, title: string | undefined): AppError {
  if (title !== undefined) {
    return new AppError(
      'NOT_FOUND',
      `No window of ${target.name} has "${title}" in its title (a browser the bridge didn't start?)`,
    );
  }
  return new AppError(
    'NOT_FOUND',
    `${capitalize(target.name)} has no browser window yet (Playwright MCP opens its browser on ` +
      'the first browser tool call)',
  );
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
