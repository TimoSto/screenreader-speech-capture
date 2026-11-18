import type { Ticker } from '#lib/core/status.js';

/** Real time, `setInterval` and the Page Visibility API. */
export class BrowserTicker implements Ticker {
  now(): number {
    return Date.now();
  }

  every(ms: number, fn: () => void): () => void {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  }

  isVisible(): boolean {
    return document.visibilityState === 'visible';
  }

  onVisible(fn: () => void): () => void {
    const listener = () => {
      if (document.visibilityState === 'visible') fn();
    };
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  }
}
