import {
  checkDto,
  SpeechEntrySchema,
  type SpeechListDto,
} from '@screenreader-speech-capture/shared';
import type { SessionScope } from '#lib/core/sessions.js';
import type { SpeechFeed, SpeechFeedHandlers } from '#lib/core/speech.js';
import { routeJson } from './route-request.js';

/** Entries read per request when an ended session is read page by page. */
const PAGE_SIZE = 1000;

/**
 * Reads the speech of a scope through the UI's own routes (`urls` include the base path):
 * - A live scope is followed on the stream relay with `?since=0`, so the bridge replays the
 *   buffer first. `EventSource` reconnects by itself and sends `Last-Event-ID`, so a drop only
 *   shows as `reconnecting` and the missed entries are replayed.
 * - An ended session never gets new entries: it is read page by page, once, without a stream.
 */
export class SseSpeechFeed implements SpeechFeed {
  constructor(
    private readonly streamUrl: string,
    private readonly speechUrl: string,
  ) {}

  open(scope: SessionScope, live: boolean, handlers: SpeechFeedHandlers): () => void {
    handlers.onState('connecting');
    return live ? this.follow(scope, handlers) : this.read(scope, handlers);
  }

  private follow(scope: SessionScope, handlers: SpeechFeedHandlers): () => void {
    const source = new EventSource(
      `${this.streamUrl}?session=${encodeURIComponent(String(scope))}&since=0`,
    );
    source.onopen = () => handlers.onState('live');
    source.onerror = () => handlers.onState('reconnecting');
    source.addEventListener('entry', (event) => {
      let data: unknown;
      try {
        data = JSON.parse((event as MessageEvent<string>).data);
      } catch {
        return;
      }
      // The one check left in the browser: the BFF relays the stream as it is, unchecked.
      const checked = checkDto(SpeechEntrySchema, data);
      if (checked.ok) handlers.onEntry(checked.value);
    });
    source.addEventListener('clear', () => handlers.onClear());
    return () => source.close();
  }

  private read(scope: SessionScope, handlers: SpeechFeedHandlers): () => void {
    const abort = new AbortController();
    const load = async (): Promise<void> => {
      let since = 0;
      for (;;) {
        const query = new URLSearchParams({
          session: String(scope),
          since: String(since),
          limit: String(PAGE_SIZE),
        });
        const { entries, hasMore } = await routeJson<SpeechListDto>(`${this.speechUrl}?${query}`, {
          signal: abort.signal,
        });
        handlers.onEntries(entries);
        const last = entries.at(-1);
        if (!hasMore || last === undefined) return;
        since = last.seq;
      }
    };
    load().then(
      () => handlers.onState('ended'),
      () => {
        if (!abort.signal.aborted) handlers.onState('failed');
      },
    );
    return () => abort.abort();
  }
}
